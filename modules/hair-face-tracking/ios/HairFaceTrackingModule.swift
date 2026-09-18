// The module surface: is it available, give me a still, and the view.
//
// Nothing here talks to the network, writes outside the app's own caches,
// or keeps anything after the app is deleted.

import ARKit
import CoreImage
import ExpoModulesCore
import UIKit

private let errorCode = "ERR_HAIR_FACE_TRACKING"

public final class HairFaceTrackingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HairFaceTracking")

    Function("isAvailable") { () -> Bool in
      ARFaceTrackingConfiguration.isSupported
    }

    AsyncFunction("capture") { (promise: Promise) in
      HairFaceTrackingRegistry.shared.capture(promise: promise)
    }

    View(HairFaceTrackingView.self) {
      Events("onFace", "onError")

      Prop("paused") { (view: HairFaceTrackingView, paused: Bool?) in
        view.setPaused(paused ?? false)
      }
    }
  }
}

/// Finds the tracking view that is on screen, so `capture()` can reach it.
///
/// Held weakly: a view that goes away empties the slot by itself, and
/// nothing here keeps a screen alive after it has been left.
final class HairFaceTrackingRegistry {
  static let shared = HairFaceTrackingRegistry()

  private let lock = NSLock()
  private weak var view: HairFaceTrackingView?

  /// JPEG encoding is a few tens of milliseconds; it does not belong on the
  /// main thread and it must not touch the session's own queue.
  private let work = DispatchQueue(label: "app.tress.hair-face-tracking.capture", qos: .userInitiated)

  /// A CIContext is expensive to build and cheap to keep.
  private lazy var context = CIContext(options: [.useSoftwareRenderer: false])

  private init() {}

  func register(_ view: HairFaceTrackingView) {
    lock.lock()
    self.view = view
    lock.unlock()
  }

  private var currentView: HairFaceTrackingView? {
    lock.lock()
    defer { lock.unlock() }
    return view
  }

  func capture(promise: Promise) {
    // The view, the session's current frame and the interface orientation
    // are all UIKit-side reads, so they happen on the main thread.
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        promise.reject(errorCode, "Face tracking went away before the photograph was taken.")
        return
      }
      guard let view = self.currentView else {
        promise.reject(errorCode, "The face tracking view is not on screen.")
        return
      }
      guard let frame = view.latestFrame else {
        promise.reject(errorCode, "The camera has not delivered a frame yet.")
        return
      }

      // The CIImage is made here because everything it needs is a
      // main-thread read: the view, the session's current frame and the
      // interface orientation.
      //
      // Be clear about what this does NOT do. `CIImage(cvPixelBuffer:)`
      // retains the buffer and reads it lazily, so ONE slot of the
      // session's capture pool stays held from this line until
      // `jpegRepresentation` below finishes with it — the `ARFrame`
      // wrapper going out of scope does not release it. That is the
      // deliberate trade: one buffer held for the few tens of milliseconds
      // an encode takes, rather than a full-size memcpy on the main thread
      // to get it back sooner. If an AR stall is ever traced to a capture,
      // the encode's duration is the thing to look at, not this line.
      let image = CIImage(cvPixelBuffer: frame.capturedImage).oriented(view.captureOrientation)
      let extent = image.extent

      self.work.async { [weak self] in
        guard let self else {
          promise.reject(errorCode, "Face tracking went away before the photograph was written.")
          return
        }
        guard
          let data = self.context.jpegRepresentation(
            of: image,
            colorSpace: CGColorSpaceCreateDeviceRGB(),
            options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.9]
          )
        else {
          promise.reject(errorCode, "The camera frame could not be encoded.")
          return
        }

        guard
          let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        else {
          promise.reject(errorCode, "This device has no caches directory to write to.")
          return
        }
        let directory = caches.appendingPathComponent("hair-face-tracking", isDirectory: true)
        let url = directory.appendingPathComponent("\(UUID().uuidString).jpg")

        do {
          try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
          try data.write(to: url, options: .atomic)
        } catch {
          promise.reject(errorCode, "The photograph could not be saved: \(error.localizedDescription)")
          return
        }

        promise.resolve([
          "uri": url.absoluteString,
          "width": Int(extent.width.rounded()),
          "height": Int(extent.height.rounded())
        ])
      }
    }
  }
}
