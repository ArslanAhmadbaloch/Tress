// The AR preview. It *is* the camera.
//
// ARKit takes exclusive hold of the front camera while a face-tracking
// session runs, so nothing else may be mounted over the same lens —
// react-native-vision-camera included. On iOS this view renders the camera
// feed, tracks the head, and hands stills to `capture()`; on Android none
// of this exists and the scan keeps to ML Kit.
//
// ── Coasting, and why the crown stage depends on it ───────────────────────
// The scan's second stage asks the person to LOWER their head and turn it,
// so the camera can see the crown. At that angle ARKit is looking at a
// forehead and a scalp, not a face: `ARFaceAnchor.isTracked` goes false and
// the anchor stops being updated, sometimes for a second at a time. A view
// that fell silent there would leave the ring with nothing to run on and
// the stage would never arm — so instead the last good frame keeps being
// sent, flagged `tracking: false`, for `coastGrace` seconds. The JavaScript
// side knows it is holding a pose rather than reading one, and the ring
// keeps its place instead of resetting. Only when the grace runs out does
// `{ lost: true }` go.

import ARKit
import ExpoModulesCore
import QuartzCore
import SceneKit
import UIKit
import simd

public final class HairFaceTrackingView: ExpoView, ARSCNViewDelegate {
  // Event names here must match `Events(...)` in the module definition.
  private let onFace = EventDispatcher()
  private let onError = EventDispatcher()

  private let sceneView = ARSCNView(frame: .zero)

  /// Whether the preview is flipped left-for-right.
  ///
  /// Mirroring is a SCREEN-SPACE fact, and exactly three things depend on
  /// it, all of them below: the feed's transform, the `x` this view
  /// reports for every projected point, and the sign of `roll`. They are
  /// all read off this one flag so they cannot drift apart — the last
  /// time they did, the head cap leaned the opposite way to the face.
  ///
  /// What does NOT depend on it: `yaw` and `pitch`, which describe where
  /// the head is pointing in the world, and the still the report crops
  /// (see `captureOrientation`). So flipping this flag changes what the
  /// user sees and nothing about which temple is filed under which name.
  ///
  /// A selfie preview normally reads as a mirror; this app's owner asked
  /// for the un-mirrored view, so it is off.
  static let mirrorPreview = false

  private static var previewTransform: CGAffineTransform {
    mirrorPreview ? CGAffineTransform(scaleX: -1, y: 1) : .identity
  }

  /// A projected point's x as a fraction of the width the user is looking
  /// at, which is the other side of the frame when the preview is flipped.
  private static func screenX(_ x: CGFloat, width: CGFloat) -> Double {
    let fraction = Double(x) / Double(width)
    return mirrorPreview ? 1 - fraction : fraction
  }

  /// Just over 1/60 s, so a 60 fps session passes through untouched and
  /// anything faster is thinned rather than flooding the bridge.
  private static let minimumInterval: CFTimeInterval = 1.0 / 62.0

  /// How long the last good pose keeps being sent once ARKit stops
  /// updating the anchor. Long enough to cover the head-down half of the
  /// crown stage; short enough that a person who walked away is reported
  /// gone rather than frozen on screen. Mirrored in `src/points.ts` as
  /// `COAST_MS` — change both together.
  private static let coastGrace: CFTimeInterval = 1.5

  /// How often the coast is considered.
  private static let coastTick: CFTimeInterval = 0.1

  /// How stale the stream has to be before a held pose is sent. Three
  /// missed frames at 60 fps: past a hitch, short of a stall.
  private static let coastAfter: CFTimeInterval = 0.05

  /// The most often the "this iPhone cannot track a face" message repeats.
  private static let unsupportedInterval: CFTimeInterval = 2

  private var pausedByProp = false
  private var backgrounded = false
  private var running = false
  private var lastEmit: CFTimeInterval = 0
  private var sawFace = false
  private var outline: HairFaceOutline?
  private var observers: [NSObjectProtocol] = []

  /// The last frame ARKit actually tracked, and when it arrived. Together
  /// they are the whole of the coast: what to repeat, and for how long.
  private var lastTracked: [String: Any]?
  private var lastTrackedAt: CFTimeInterval = 0
  private var coastTimer: Timer?
  private var lastUnsupportedReport: CFTimeInterval = 0

  private let emitLock = NSLock()
  private var emitPending = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    clipsToBounds = true
    isUserInteractionEnabled = false

    // Only the view's own delegate is set. ARSCNView installs itself as
    // the ARSession delegate and needs to stay there — taking that slot
    // stops the camera feed. `ARSCNViewDelegate` inherits
    // `ARSessionObserver`, so the session's failures and interruptions
    // arrive here anyway.
    sceneView.delegate = self
    sceneView.scene = SCNScene()
    sceneView.isUserInteractionEnabled = false
    sceneView.antialiasingMode = .none
    sceneView.preferredFramesPerSecond = 60
    sceneView.automaticallyUpdatesLighting = true
    sceneView.rendersContinuously = false
    addSubview(sceneView)

    // `[weak self]` throughout: the notification centre holds these blocks
    // for as long as the tokens live, and the tokens are released below.
    let centre = NotificationCenter.default
    observers.append(
      centre.addObserver(
        forName: UIApplication.didEnterBackgroundNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.backgrounded = true
        self?.stopSession()
      }
    )
    observers.append(
      centre.addObserver(
        forName: UIApplication.willEnterForegroundNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.backgrounded = false
        self?.startSessionIfPossible()
      }
    )

    HairFaceTrackingRegistry.shared.register(self)
  }

  deinit {
    let centre = NotificationCenter.default
    for token in observers {
      centre.removeObserver(token)
    }
    // Swift makes no promise about which thread the last release lands on,
    // and both an ARSession and a Timer are main-thread business. Only
    // these two objects are captured — never `self`, which is halfway gone
    // by the time this runs.
    let session = sceneView.session
    let timer = coastTimer
    let tearDown = {
      timer?.invalidate()
      session.pause()
    }
    if Thread.isMainThread {
      tearDown()
    } else {
      DispatchQueue.main.async(execute: tearDown)
    }
    // The registry holds this view weakly, so it empties itself.
  }

  // MARK: - Layout and lifecycle

  public override func layoutSubviews() {
    super.layoutSubviews()
    // `frame` is undefined under a transform, so the transform comes off,
    // the frame goes on, and the transform goes back.
    sceneView.transform = .identity
    sceneView.frame = bounds
    sceneView.transform = HairFaceTrackingView.previewTransform
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      stopSession()
    } else {
      startSessionIfPossible()
    }
  }

  /// Set from the `paused` prop, on the main thread.
  func setPaused(_ paused: Bool) {
    guard paused != pausedByProp else { return }
    pausedByProp = paused
    if paused {
      stopSession()
    } else {
      startSessionIfPossible()
    }
  }

  private func startSessionIfPossible() {
    guard window != nil, !pausedByProp, !backgrounded, !running else { return }
    guard ARFaceTrackingConfiguration.isSupported else {
      reportUnsupported()
      return
    }
    let configuration = ARFaceTrackingConfiguration()
    configuration.isLightEstimationEnabled = true
    configuration.maximumNumberOfTrackedFaces = 1
    sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    running = true
    startCoastTimer()
  }

  /// Tells JavaScript, once per start attempt, that this device cannot do
  /// what the view was mounted for.
  ///
  /// Two things make this awkward and both are handled here. Expo installs
  /// a view's event dispatchers *after* `init(appContext:)` returns, while
  /// the first `didMoveToWindow` can run in the same layout pass — so the
  /// message goes out on the next turn of the run loop, by which time the
  /// dispatchers exist. And it is deliberately not latched to one delivery
  /// for the life of the view: this is the fallback signal, and a signal
  /// that can only ever be sent once is a signal with no retry. It is
  /// rate-limited instead, because start attempts are rare but not unique.
  private func reportUnsupported() {
    let now = CACurrentMediaTime()
    guard now - lastUnsupportedReport >= HairFaceTrackingView.unsupportedInterval else { return }
    lastUnsupportedReport = now
    DispatchQueue.main.async { [weak self] in
      self?.onError(["message": "This iPhone cannot track a face in 3D."])
    }
  }

  private func stopSession() {
    guard running else { return }
    stopCoastTimer()
    sceneView.session.pause()
    running = false
    lastTracked = nil
    if sawFace {
      sawFace = false
      onFace(["lost": true])
    }
  }

  // MARK: - Coasting

  private func startCoastTimer() {
    stopCoastTimer()
    // `.common` so a scroll or a gesture elsewhere on the screen does not
    // stop the crown stage's heartbeat.
    let timer = Timer(
      timeInterval: HairFaceTrackingView.coastTick,
      repeats: true
    ) { [weak self] _ in
      self?.coast()
    }
    RunLoop.main.add(timer, forMode: .common)
    coastTimer = timer
  }

  private func stopCoastTimer() {
    coastTimer?.invalidate()
    coastTimer = nil
  }

  /// Sends the last tracked pose again when nothing fresh has arrived.
  ///
  /// It says so: `tracking` is false on every frame that leaves here, so
  /// nothing downstream can mistake a held pose for a read one. This is
  /// what keeps the ring turning while the head is down far enough that
  /// ARKit can no longer see a face.
  private func coast() {
    guard running, sawFace, let held = lastTracked else { return }
    let now = CACurrentMediaTime()
    guard now - lastEmit >= HairFaceTrackingView.coastAfter else { return }

    guard now - lastTrackedAt <= HairFaceTrackingView.coastGrace else {
      sawFace = false
      lastTracked = nil
      onFace(["lost": true])
      return
    }

    var coasted = held
    coasted["tracking"] = false
    coasted["at"] = Date().timeIntervalSince1970 * 1000
    lastEmit = now
    onFace(coasted)
  }

  // MARK: - Capture support (read on the main thread)

  var latestFrame: ARFrame? {
    sceneView.session.currentFrame
  }

  /// How the captured buffer has to be turned to match what is on screen.
  ///
  /// ARKit always hands `capturedImage` over in the sensor's own
  /// landscape-right order, whichever way the device is held, so rotating
  /// it to the interface is a fixed table. Which COLUMN of that table is
  /// used is `mirrorPreview`'s to say, not this function's: the still has
  /// to agree with the preview, because the region rectangles kept in the
  /// record are measured against what the user was looking at.
  ///
  ///   interface     unmirrored   mirrored
  ///   portrait      .right       .leftMirrored
  ///   upsideDown    .left        .rightMirrored
  ///   landLeft      .down        .downMirrored
  ///   landRight     .up          .upMirrored
  var captureOrientation: CGImagePropertyOrientation {
    let mirrored = HairFaceTrackingView.mirrorPreview
    switch window?.windowScene?.interfaceOrientation ?? .portrait {
    case .portraitUpsideDown: return mirrored ? .rightMirrored : .left
    case .landscapeLeft: return mirrored ? .downMirrored : .down
    case .landscapeRight: return mirrored ? .upMirrored : .up
    default: return mirrored ? .leftMirrored : .right
    }
  }

  // MARK: - ARSessionObserver, forwarded by ARSCNView

  public func session(_ session: ARSession, didFailWithError error: Error) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.running = false
      self.stopCoastTimer()
      self.onError(["message": error.localizedDescription])
    }
  }

  public func sessionWasInterrupted(_ session: ARSession) {
    // An interruption is the camera being taken away — a call, another app
    // in front. Nothing to coast on, and pretending otherwise would hold a
    // stale head on screen for a second and a half.
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.lastTracked = nil
      guard self.sawFace else { return }
      self.sawFace = false
      self.onFace(["lost": true])
    }
  }

  public func sessionInterruptionEnded(_ session: ARSession) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.running = false
      self.startSessionIfPossible()
    }
  }

  // MARK: - ARSCNViewDelegate

  public func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for anchor: ARAnchor) {
    schedule(anchor)
  }

  public func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
    schedule(anchor)
  }

  public func renderer(_ renderer: SCNSceneRenderer, didRemove node: SCNNode, for anchor: ARAnchor) {
    // Deliberately empty. A removed face anchor is not a loss yet: during
    // the crown stage it is the same situation as an untracked one, and
    // the coast decides — either the face comes back inside the grace
    // period, or `{ lost: true }` goes out when the grace runs out.
  }

  /// SceneKit calls the delegate on its own rendering thread. Everything
  /// that follows touches UIKit, so it hops to the main thread — and at
  /// most one hop is ever in flight, so a busy main thread thins the
  /// stream instead of building a queue behind it.
  private func schedule(_ anchor: ARAnchor) {
    guard let faceAnchor = anchor as? ARFaceAnchor else { return }
    guard let camera = sceneView.session.currentFrame?.camera else { return }

    emitLock.lock()
    if emitPending {
      emitLock.unlock()
      return
    }
    emitPending = true
    emitLock.unlock()

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.emit(faceAnchor, camera: camera)
      self.emitLock.lock()
      self.emitPending = false
      self.emitLock.unlock()
    }
  }

  private func emit(_ anchor: ARFaceAnchor, camera: ARCamera) {
    guard window != nil, running else { return }

    // An untracked anchor carries a stale transform. Sending it as though
    // it were fresh is what makes a mesh swim; going silent is what leaves
    // the crown stage with nothing to run on. So: neither. The coast holds
    // the last pose that was real, and says that is what it is doing.
    guard anchor.isTracked else { return }

    let now = CACurrentMediaTime()
    guard now - lastEmit >= HairFaceTrackingView.minimumInterval else { return }
    lastEmit = now

    let size = bounds.size
    guard size.width > 1, size.height > 1 else { return }
    let orientation = window?.windowScene?.interfaceOrientation ?? .portrait

    let pose = HairFacePose.degrees(
      faceInEye: simd_mul(camera.viewMatrix(for: orientation), anchor.transform)
    )

    let geometry = anchor.geometry
    let resolved = outline ?? HairFaceOutline(geometry: geometry)
    if outline == nil {
      outline = resolved
    }

    var points: [Double] = []
    var facing: [Double] = []
    var minX = Double.greatestFiniteMagnitude
    var minY = Double.greatestFiniteMagnitude
    var maxX = -Double.greatestFiniteMagnitude
    var maxY = -Double.greatestFiniteMagnitude

    if let resolved {
      let vertices = geometry.vertices
      let normals = resolved.normals(vertices: vertices)
      let transform = anchor.transform
      let cameraColumn = camera.transform.columns.3
      let eye = SIMD3<Float>(cameraColumn.x, cameraColumn.y, cameraColumn.z)

      points.reserveCapacity(resolved.indices.count * 2)
      facing.reserveCapacity(resolved.indices.count)

      // Either every point goes, in order, or none does. Dropping one and
      // carrying on would shift every point after it into the wrong ring
      // slot, and the drawing side has no way to notice.
      var complete = true

      for (slot, vertexIndex) in resolved.indices.enumerated() where complete {
        guard vertexIndex < vertices.count, slot < normals.count else {
          complete = false
          continue
        }
        let local = vertices[vertexIndex]
        let world4 = simd_mul(transform, SIMD4<Float>(local.x, local.y, local.z, 1))
        let world = SIMD3<Float>(world4.x, world4.y, world4.z)

        let projected = camera.projectPoint(world, orientation: orientation, viewportSize: size)
        let x = HairFaceTrackingView.screenX(projected.x, width: size.width)
        let y = Double(projected.y) / Double(size.height)
        guard x.isFinite, y.isFinite else {
          complete = false
          continue
        }
        points.append(x)
        points.append(y)

        let normal4 = simd_mul(transform, SIMD4<Float>(normals[slot].x, normals[slot].y, normals[slot].z, 0))
        let normal = SIMD3<Float>(normal4.x, normal4.y, normal4.z)
        let toEye = eye - world
        let lengths = simd_length(normal) * simd_length(toEye)
        let dot = lengths > 1e-9 ? Double(simd_dot(normal, toEye) / lengths) : 0
        facing.append(dot.isFinite ? dot : 0)

        // The rim ring alone sets the box: the inner ring sits inside it
        // by construction and would only blunt the edges.
        if slot < HairFaceOutline.ringPoints {
          minX = min(minX, x)
          maxX = max(maxX, x)
          minY = min(minY, y)
          maxY = max(maxY, y)
        }
      }

      if !complete {
        // A pose-only frame: honest, and the JavaScript side's
        // `hasFullMesh` reads false rather than drawing a scrambled cap.
        points.removeAll(keepingCapacity: false)
        facing.removeAll(keepingCapacity: false)
        minX = Double.greatestFiniteMagnitude
        minY = Double.greatestFiniteMagnitude
        maxX = -Double.greatestFiniteMagnitude
        maxY = -Double.greatestFiniteMagnitude
      }
    }

    // Without geometry there is still a pose worth sending; fall back to a
    // box around the anchor's origin so the ring keeps turning.
    if minX > maxX || minY > maxY {
      let originColumn = anchor.transform.columns.3
      let origin = SIMD3<Float>(originColumn.x, originColumn.y, originColumn.z)
      let projected = camera.projectPoint(origin, orientation: orientation, viewportSize: size)
      let x = HairFaceTrackingView.screenX(projected.x, width: size.width)
      let y = Double(projected.y) / Double(size.height)
      guard x.isFinite, y.isFinite else { return }
      minX = x
      maxX = x
      minY = y
      maxY = y
    }

    let payload: [String: Any] = [
      "cx": (minX + maxX) / 2,
      "cy": (minY + maxY) / 2,
      "width": maxX - minX,
      "height": maxY - minY,
      "yaw": Double(pose.yaw),
      "pitch": Double(pose.pitch),
      "roll": Double(pose.roll),
      "points": points,
      "facing": facing,
      "tracking": true,
      "at": Date().timeIntervalSince1970 * 1000
    ]

    sawFace = true
    lastTracked = payload
    lastTrackedAt = now
    onFace(payload)
  }
}
