// The module surface: is it available, give me a still, give me a small
// square of the live frame, and the view.
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

    // A small square of the live frame, as raw bytes, for the mesh's fit.
    // See `sampleFrame` below for what it costs and what it refuses.
    AsyncFunction("sampleFrame") { (size: Int, promise: Promise) in
      HairFaceTrackingRegistry.shared.sampleFrame(size: size, promise: promise)
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
  ///
  /// Only ever touched from `work`, which is serial, so the lazy
  /// initialisation cannot race with itself.
  private lazy var context = CIContext(options: [.useSoftwareRenderer: false])

  /// Sampling has its own queue, so a sample can never queue behind a
  /// photograph: a sample runs about three times a second for the whole
  /// scan and a capture happens four times in total, and the rare,
  /// waited-on thing must not wait on the frequent one.
  ///
  /// ── Why this is NOT `.utility`, which is what it says ──────────────
  /// It was, and the reasoning was that a missed sample costs a wireframe
  /// a little accuracy where a missed capture costs the scan a
  /// photograph. That is true about the RESULT and wrong about the work,
  /// because of what this queue is holding while it runs.
  /// `CIImage(cvPixelBuffer:)` on the main thread retains one slot of the
  /// AR session's capture pool, and the slot is not given back until the
  /// render on this queue finishes with it (the same trade `capture()`
  /// documents below). So this queue holds a resource ARKit needs to keep
  /// delivering frames — three times a second, for the whole scan. Run at
  /// the lowest priority in the file, a thermally throttled phone can
  /// leave that work waiting behind everything else while the session it
  /// is blocking is the thing drawing the screen: a priority inversion,
  /// and the symptom would be the face tracker stuttering, which is the
  /// one thing that must not regress. The holder of a shared resource
  /// runs at the priority of what needs it.
  ///
  /// It is still not `.userInteractive`: nothing is on screen waiting for
  /// this, and a sample that is late is dropped by the caller rather than
  /// queued. `.userInitiated` is the same band the photograph uses, which
  /// is the honest statement — both hold a pool slot, so neither may be
  /// the thing that yields.
  private let sampling = DispatchQueue(
    label: "app.tress.hair-face-tracking.sample",
    qos: .userInitiated
  )

  /// Built on the first sample and never before it. A phone that draws
  /// the standing dome — no model, no Nitro, Android — pays nothing here,
  /// because nothing on that road ever reaches this line.
  ///
  /// Separate from `context` above so each is touched from exactly one
  /// serial queue: two queues racing on one `lazy var` is a second
  /// CIContext built and thrown away, or worse.
  private lazy var sampleContext = CIContext(options: [.useSoftwareRenderer: false])

  /// The render target, kept between samples.
  ///
  /// A megabyte at the largest side this accepts, allocated once and
  /// reused, rather than a fresh buffer three times a second for the
  /// length of a scan. Grown, never shrunk: the caller asks for one size
  /// and keeps asking for it.
  private let sampleLock = NSLock()
  private var sampleBuffer: UnsafeMutableRawPointer?
  private var sampleCapacity = 0
  /// True between a sample being accepted and its bytes going back.
  private var samplingNow = false

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

  // MARK: - Sampling the live frame

  /// The smallest and largest square this will render. Both are limits on
  /// a buffer that crosses the bridge about three times a second, and
  /// the upper one is what keeps `sampleBuffer` under a megabyte.
  private static let sampleMin = 64
  private static let sampleMax = 512

  /// A small square of the AR frame on screen right now, as raw RGBA
  /// bytes, with the size of the picture it was squashed out of.
  ///
  /// ── What it is for ─────────────────────────────────────────────────
  /// The mesh is drawn to a dome lofted off a FACE anchor, which has
  /// nothing to say about hair standing off the skull. A segmenter can
  /// say where the hair is, and a segmenter needs pixels. This is the
  /// cheapest honest way to hand it some: no file is written, no JPEG is
  /// encoded, nothing is kept, and the bytes are a few hundred kilobytes
  /// rather than a photograph.
  ///
  /// ── The squash, and why it is not a crop ───────────────────────────
  /// The frame is scaled on each axis independently into a square. That
  /// is the same alignment invariant `hair-segmenter.ts` writes down for
  /// the still road: a pure axis-wise scale means a point in the square
  /// maps back onto the picture by nothing but a ratio, so the outline
  /// traced out of it lands where the hair is. Cropping to square would
  /// be faster and would put the outline somewhere the head is not, with
  /// no error to say so — which is why `sourceWidth` and `sourceHeight`
  /// go back with the bytes rather than being assumed on the other side.
  ///
  /// The orientation is the view's own `captureOrientation`, so the
  /// square agrees with what the person is looking at — mirrored, turned
  /// the way the interface is. A sample that disagreed with the preview
  /// would fit the cap to a reflection.
  ///
  /// ── What it refuses ────────────────────────────────────────────────
  /// No view on screen, no frame yet, a frame with no extent, or a
  /// render the context would not do: each rejects with a sentence
  /// rather than resolving something empty. A sample already in flight
  /// rejects too, at once — the caller is on a timer and a second
  /// request means the first is late, so the right answer is to drop
  /// this one rather than to build a queue of stale frames behind it.
  ///
  /// ── What it holds while it runs ────────────────────────────────────
  /// One slot of the session's capture pool, from the `CIImage` on the
  /// main thread below until the render on `sampling` has finished with
  /// it — `CIImage(cvPixelBuffer:)` retains the buffer and reads it
  /// lazily, exactly as `capture()` documents. Never more than one, since
  /// a second sample is refused outright rather than queued. This is the
  /// reason `sampling` runs at `.userInitiated` and not below it; it has
  /// NOT been measured on a device under thermal pressure, and if an AR
  /// stall is ever traced to the live fit, the duration of the render
  /// below is the thing to measure first.
  ///
  /// ── What it costs when nobody calls it ─────────────────────────────
  /// Nothing. No timer, no observer, no buffer and no CIContext exist
  /// until the first call, and no slot of anything is held.
  func sampleFrame(size: Int, promise: Promise) {
    let side = min(
      HairFaceTrackingRegistry.sampleMax,
      max(HairFaceTrackingRegistry.sampleMin, size)
    )

    sampleLock.lock()
    if samplingNow {
      sampleLock.unlock()
      promise.reject(errorCode, "A frame is already being sampled.")
      return
    }
    samplingNow = true
    sampleLock.unlock()

    // Every road out of here runs this exactly once, including the ones
    // that reject: a flag left set would stop every later sample and the
    // cap would quietly stop following the hair.
    let release = { [weak self] in
      guard let self else { return }
      self.sampleLock.lock()
      self.samplingNow = false
      self.sampleLock.unlock()
    }

    // The view, the session's current frame and the interface orientation
    // are all UIKit-side reads, so they happen on the main thread — and
    // only those. The render itself is below, off this thread and off
    // SceneKit's.
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        release()
        promise.reject(errorCode, "Face tracking went away before the frame was sampled.")
        return
      }
      guard let view = self.currentView else {
        release()
        promise.reject(errorCode, "The face tracking view is not on screen.")
        return
      }
      guard let frame = view.latestFrame else {
        release()
        promise.reject(errorCode, "The camera has not delivered a frame yet.")
        return
      }

      let image = CIImage(cvPixelBuffer: frame.capturedImage).oriented(view.captureOrientation)
      let extent = image.extent
      guard extent.width >= 1, extent.height >= 1, extent.width.isFinite, extent.height.isFinite
      else {
        release()
        promise.reject(errorCode, "The camera frame has no picture in it.")
        return
      }
      let sourceWidth = Int(extent.width.rounded())
      let sourceHeight = Int(extent.height.rounded())

      self.sampling.async { [weak self] in
        guard let self else {
          release()
          promise.reject(errorCode, "Face tracking went away before the frame was rendered.")
          return
        }
        defer { release() }

        // Origin to zero, then a scale on each axis: the squash, with no
        // crop, no offset and no rotation left in it.
        let square = image
          .transformed(by: CGAffineTransform(translationX: -extent.origin.x, y: -extent.origin.y))
          .transformed(
            by: CGAffineTransform(
              scaleX: CGFloat(side) / extent.width,
              y: CGFloat(side) / extent.height
            )
          )

        let rowBytes = side * 4
        let needed = rowBytes * side
        guard let buffer = self.renderBuffer(bytes: needed) else {
          promise.reject(errorCode, "This device could not spare the memory to sample a frame.")
          return
        }

        self.sampleContext.render(
          square,
          toBitmap: buffer,
          rowBytes: rowBytes,
          bounds: CGRect(x: 0, y: 0, width: side, height: side),
          format: .RGBA8,
          colorSpace: CGColorSpaceCreateDeviceRGB()
        )

        // The copy is the handover: `Data(bytes:count:)` copies, so the
        // reusable buffer is free again the moment this returns, and the
        // bytes that cross the bridge are nobody else's.
        promise.resolve([
          "data": Data(bytes: buffer, count: needed),
          "size": side,
          "sourceWidth": sourceWidth,
          "sourceHeight": sourceHeight
        ])
      }
    }
  }

  /// The render target, grown to fit and then kept.
  ///
  /// Touched only from `sampling`, which is serial, but locked anyway:
  /// the pointer it hands back outlives the lock and a second caller
  /// arriving on another queue would otherwise be writing into a buffer
  /// that was being freed underneath it.
  private func renderBuffer(bytes: Int) -> UnsafeMutableRawPointer? {
    sampleLock.lock()
    defer { sampleLock.unlock() }
    if let buffer = sampleBuffer, sampleCapacity >= bytes {
      return buffer
    }
    if let buffer = sampleBuffer {
      buffer.deallocate()
      sampleBuffer = nil
      sampleCapacity = 0
    }
    let buffer = UnsafeMutableRawPointer.allocate(byteCount: bytes, alignment: 16)
    sampleBuffer = buffer
    sampleCapacity = bytes
    return buffer
  }
}
