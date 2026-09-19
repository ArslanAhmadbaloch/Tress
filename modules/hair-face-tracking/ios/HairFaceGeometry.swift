// ARKit's face geometry, reduced to the ring of points the scan draws with.
//
// ── What ARFaceGeometry actually is ───────────────────────────────────────
// A MASK, not a head. Its 1220 vertices cover the face from the upper
// forehead down to the jaw and chin: there is no skull, no crown, no back
// of the head and no ear in it. Slot 0 of the rim ring below is the top of
// the FOREHEAD, not the top of the head. Anything above the brow line —
// the crown the scan has to photograph — is not in this payload and never
// will be; the cap that draws the head has to loft it, using the rim and
// the pose as its anchor. Saying otherwise in a comment would send the
// drawing side looking for geometry that does not exist.
//
// ── What the scan wants out of it ─────────────────────────────────────────
// Not the features — eyelids, nostrils, lips — but the parts of the mask
// that belong to the SHAPE of the head and stay put when the person talks,
// smiles or opens their jaw: a boundary it can hang a cap on, and a second
// ring inside it so the cap has somewhere to bulge.
//
// Vertices whose position is driven by expression are therefore excluded
// before either ring is picked. That exclusion is measured, not guessed:
// ARKit will build a geometry from any set of blend-shape coefficients, so
// a neutral face and a maximally expressive one are built once, and any
// vertex that moves between them is an expression's vertex, not a head's.
// Without it the inner ring lands on the lips and cheeks around the bottom
// of the circle, and half the ring crawls across the face whenever the
// person speaks — the exact swimming this module exists to end.
//
// The surviving indices are picked ONCE, from the first geometry that
// arrives, and reused for the life of the session. Picking them per frame
// would make the points crawl for a second reason; picking them from a
// hardcoded table of ARKit vertex indices would mean shipping a table
// nobody in this lane can verify without a TrueDepth camera, and a wrong
// table is a mesh sitting on the nose. So the ORDER is the contract — see
// `src/points.ts` — and the indices are resolved here, geometrically.

import ARKit
import simd

/// The fixed subset of the face geometry, and the topology around it.
struct HairFaceOutline {
  /// Points in each of the two rings.
  static let ringPoints = 36

  /// Degrees between neighbouring ring slots.
  static let stepDegrees: Float = 360 / Float(ringPoints)

  /// Where the inner ring sits, as a share of the rim's radius.
  static let innerRadius: Float = 0.58

  /// Points sent per frame: the rim ring, then the inner ring.
  static let pointCount = ringPoints * 2

  /// How far a vertex may move under a full expression and still count as
  /// the head's own, in metres. A face is roughly 0.2 m tall, so 4 mm is a
  /// millimetre or two of mesh noise rather than a moving feature.
  static let expressionTolerance: Float = 0.004

  /// If fewer than this share of the vertices survive the expression test,
  /// the test is distrusted and every vertex is allowed. Better a ring
  /// picked the old way than a ring picked from eleven vertices.
  static let minimumStableShare: Float = 0.25

  /// Vertex indices, in the order `src/points.ts` documents.
  let indices: [Int]

  /// Triangles that touch at least one selected vertex.
  private let triangles: [(Int, Int, Int)]

  /// Per selected point, the triangles above that contain it.
  private let adjacency: [[Int]]

  /// +1 when the triangles wind outward, -1 when they wind inward.
  private let winding: Float

  /// Fails only on a geometry too small to be a face — never in practice,
  /// but the caller would rather send no points than crash.
  init?(geometry: ARFaceGeometry) {
    let vertices = geometry.vertices
    let count = vertices.count
    guard count >= HairFaceOutline.pointCount * 4 else { return nil }

    let stable = HairFaceOutline.expressionFree(vertexCount: count)

    // The head's centre, in the anchor's own space.
    var sum = SIMD3<Float>(repeating: 0)
    for vertex in vertices {
      sum += vertex
    }
    let centre = sum / Float(count)

    // Bin every vertex by its angle, measured CLOCKWISE from twelve
    // o'clock as the user sees themselves in the MIRRORED preview.
    //
    // The face anchor's +x runs toward the subject's own left ear, which a
    // mirror puts on the left of the screen; so screen-right is -x, and
    // the clockwise-from-noon angle of a vertex is atan2(-dx, dy).
    //
    // Two candidates are kept per bin: the outermost vertex that survived
    // the expression test, and the outermost of any kind. The second is
    // only ever used where the first does not exist.
    var steady = [Int](repeating: -1, count: HairFaceOutline.ringPoints)
    var steadyRadius = [Float](repeating: -1, count: HairFaceOutline.ringPoints)
    var anyVertex = [Int](repeating: -1, count: HairFaceOutline.ringPoints)
    var anyRadius = [Float](repeating: -1, count: HairFaceOutline.ringPoints)
    var steadyMembers = [[Int]](repeating: [], count: HairFaceOutline.ringPoints)
    var members = [[Int]](repeating: [], count: HairFaceOutline.ringPoints)
    var radii = [Float](repeating: 0, count: count)

    for index in 0..<count {
      let dx = vertices[index].x - centre.x
      let dy = vertices[index].y - centre.y
      let radius = (dx * dx + dy * dy).squareRoot()
      radii[index] = radius

      var degrees = atan2(-dx, dy) * 180 / .pi
      if degrees < 0 {
        degrees += 360
      }
      let slot = min(HairFaceOutline.ringPoints - 1, Int(degrees / HairFaceOutline.stepDegrees))
      members[slot].append(index)
      if radius > anyRadius[slot] {
        anyRadius[slot] = radius
        anyVertex[slot] = index
      }
      guard stable[index] else { continue }
      steadyMembers[slot].append(index)
      if radius > steadyRadius[slot] {
        steadyRadius[slot] = radius
        steady[slot] = index
      }
    }

    // The rim: the outermost expression-free vertex in the bin, falling
    // back to the outermost of any kind only where the bin holds nothing
    // steady at all. Around the jaw this pulls the rim a few millimetres
    // inside the true edge of the mask — which is the trade the whole file
    // is making: a boundary slightly inside the face that stays put beats
    // one exactly on it that moves every time the mouth opens.
    var rim = steady
    var rimRadius = steadyRadius
    for slot in 0..<HairFaceOutline.ringPoints where rim[slot] < 0 {
      rim[slot] = anyVertex[slot]
      rimRadius[slot] = anyRadius[slot]
    }

    // A bin with nothing in it at all borrows the nearest filled bin, so
    // the ring is always complete and always in order. Two passes round
    // the circle is enough for any gap a face mesh can produce.
    for _ in 0..<2 {
      for slot in 0..<HairFaceOutline.ringPoints {
        if rim[slot] >= 0 { continue }
        let previous = (slot + HairFaceOutline.ringPoints - 1) % HairFaceOutline.ringPoints
        let next = (slot + 1) % HairFaceOutline.ringPoints
        if rim[previous] >= 0 {
          rim[slot] = rim[previous]
          rimRadius[slot] = rimRadius[previous]
        } else if rim[next] >= 0 {
          rim[slot] = rim[next]
          rimRadius[slot] = rimRadius[next]
        }
      }
    }
    guard rim.allSatisfy({ $0 >= 0 }) else { return nil }

    // The inner ring: in each bin, the EXPRESSION-FREE vertex sitting
    // closest to `innerRadius` of that bin's rim radius. Restricting the
    // search to steady vertices is what keeps the lower half of this ring
    // off the lips, the cheeks and the chin — the most blend-shape-driven
    // vertices ARKit produces, and the ones that would otherwise crawl.
    //
    // A bin with no steady vertex inside the rim repeats its rim point.
    // A doubled point makes that spoke of the cap flat; a crawling point
    // makes the whole cap swim, and only one of those is worth having.
    var inner = [Int](repeating: -1, count: HairFaceOutline.ringPoints)
    for slot in 0..<HairFaceOutline.ringPoints {
      let target = rimRadius[slot] * HairFaceOutline.innerRadius
      var bestIndex = rim[slot]
      var bestGap = Float.greatestFiniteMagnitude
      let candidates = steadyMembers[slot].isEmpty ? members[slot] : steadyMembers[slot]
      for index in candidates {
        let gap = abs(radii[index] - target)
        if gap < bestGap {
          bestGap = gap
          bestIndex = index
        }
      }
      inner[slot] = bestIndex
    }

    let selected = rim + inner
    indices = selected

    // Only the triangles that touch a selected vertex are kept, so the
    // per-frame normal pass walks a few hundred indices rather than seven
    // thousand.
    let wanted = Set(selected)
    var keptTriangles: [(Int, Int, Int)] = []
    var trianglesOfVertex: [Int: [Int]] = [:]
    let triangleIndices = geometry.triangleIndices
    for triangle in 0..<geometry.triangleCount {
      let base = triangle * 3
      guard base + 2 < triangleIndices.count else { break }
      let a = Int(triangleIndices[base])
      let b = Int(triangleIndices[base + 1])
      let c = Int(triangleIndices[base + 2])
      guard a < count, b < count, c < count else { continue }
      guard wanted.contains(a) || wanted.contains(b) || wanted.contains(c) else { continue }
      let slot = keptTriangles.count
      keptTriangles.append((a, b, c))
      for vertex in [a, b, c] where wanted.contains(vertex) {
        trianglesOfVertex[vertex, default: []].append(slot)
      }
    }
    triangles = keptTriangles
    adjacency = selected.map { trianglesOfVertex[$0] ?? [] }

    // Which way the triangles wind is not worth guessing: measure it once
    // against the direction that must be outward — away from the head's
    // centre — and carry the sign.
    var agreement: Float = 0
    for slot in 0..<HairFaceOutline.ringPoints {
      let vertex = vertices[selected[slot]]
      let outward = vertex - centre
      guard simd_length(outward) > 1e-6 else { continue }
      let normal = HairFaceOutline.rawNormal(
        triangleSlots: adjacency[slot],
        triangles: keptTriangles,
        vertices: vertices
      )
      guard simd_length(normal) > 1e-9 else { continue }
      agreement += simd_dot(simd_normalize(normal), simd_normalize(outward))
    }
    winding = agreement < 0 ? -1 : 1
  }

  // MARK: - The expression test

  /// Every blend shape that moves the outline of the mask, at full
  /// strength. Between them they open the jaw, stretch and purse the lips,
  /// puff and raise the cheeks, close the eyes and drive the brow — which
  /// is every way a resting face can change shape without the head moving.
  private static let expressive: [ARFaceAnchor.BlendShapeLocation: NSNumber] = [
    .jawOpen: 1,
    .jawForward: 1,
    .jawLeft: 1,
    .mouthClose: 1,
    .mouthFunnel: 1,
    .mouthPucker: 1,
    .mouthSmileLeft: 1,
    .mouthSmileRight: 1,
    .mouthFrownLeft: 1,
    .mouthFrownRight: 1,
    .mouthStretchLeft: 1,
    .mouthStretchRight: 1,
    .cheekPuff: 1,
    .cheekSquintLeft: 1,
    .cheekSquintRight: 1,
    .eyeBlinkLeft: 1,
    .eyeBlinkRight: 1,
    .eyeSquintLeft: 1,
    .eyeSquintRight: 1,
    .eyeWideLeft: 1,
    .eyeWideRight: 1,
    .browDownLeft: 1,
    .browDownRight: 1,
    .browInnerUp: 1,
    .browOuterUpLeft: 1,
    .browOuterUpRight: 1,
    .noseSneerLeft: 1,
    .noseSneerRight: 1
  ]

  /// Per vertex, true when expression barely moves it.
  ///
  /// Both faces are built from the same blend-shape keys — one at 0, one
  /// at 1 — so the comparison is like for like and ARKit's topology is
  /// guaranteed to line up index for index. If either geometry cannot be
  /// built, or the test would leave too little to choose from, every
  /// vertex is allowed and the rings are picked the way they were before.
  static func expressionFree(vertexCount: Int) -> [Bool] {
    let allowAll = [Bool](repeating: true, count: vertexCount)

    var rest: [ARFaceAnchor.BlendShapeLocation: NSNumber] = [:]
    for key in expressive.keys {
      rest[key] = 0
    }
    guard
      let neutral = ARFaceGeometry(blendShapes: rest),
      let moved = ARFaceGeometry(blendShapes: expressive),
      neutral.vertices.count == vertexCount,
      moved.vertices.count == vertexCount
    else {
      return allowAll
    }

    let restVertices = neutral.vertices
    let movedVertices = moved.vertices
    var steady = [Bool](repeating: false, count: vertexCount)
    var kept = 0
    for index in 0..<vertexCount {
      let shift = simd_length(movedVertices[index] - restVertices[index])
      if shift <= expressionTolerance {
        steady[index] = true
        kept += 1
      }
    }
    guard Float(kept) >= minimumStableShare * Float(vertexCount) else {
      return allowAll
    }
    return steady
  }

  // MARK: - Normals

  /// The unnormalised area-weighted normal at one selected point.
  private static func rawNormal(
    triangleSlots: [Int],
    triangles: [(Int, Int, Int)],
    vertices: [SIMD3<Float>]
  ) -> SIMD3<Float> {
    var normal = SIMD3<Float>(repeating: 0)
    for slot in triangleSlots {
      guard slot < triangles.count else { continue }
      let (a, b, c) = triangles[slot]
      guard a < vertices.count, b < vertices.count, c < vertices.count else { continue }
      normal += simd_cross(vertices[b] - vertices[a], vertices[c] - vertices[a])
    }
    return normal
  }

  /// Outward unit normals for every selected point, in anchor space.
  func normals(vertices: [SIMD3<Float>]) -> [SIMD3<Float>] {
    indices.indices.map { slot in
      let raw = HairFaceOutline.rawNormal(
        triangleSlots: adjacency[slot],
        triangles: triangles,
        vertices: vertices
      ) * winding
      let length = simd_length(raw)
      return length > 1e-9 ? raw / length : SIMD3<Float>(0, 0, 1)
    }
  }
}

/// Head pose, in the sign convention the scan engine already speaks.
enum HairFacePose {
  /// Yaw, pitch and roll in degrees, for the MIRRORED preview.
  ///
  /// `faceInEye` is the face anchor expressed in the camera's eye space
  /// for the current interface orientation — `camera.viewMatrix(for:)`
  /// times the anchor transform. Eye space is right-handed with +x to the
  /// right of the *unmirrored* image, +y up and +z toward the viewer, so
  /// the face's own forward axis (its +z, out of the face) has a positive
  /// z component whenever it is looking anywhere near the lens.
  ///
  /// Two of the three are facts about the head in the world, so they are
  /// fixed whatever the preview does:
  ///
  ///   yaw   +ve = head turned toward its OWN RIGHT  → +yawEye
  ///   pitch +ve = chin lifted, face looking up      → +pitchEye
  ///
  /// `yaw` is NOT negated, and the negation it used to carry was the
  /// scanner's longest-standing bug.
  ///
  /// The reasoning behind the negation was that eye space's +x is the
  /// right of the *unmirrored* image, which is the side a person's own
  /// LEFT appears on. That is wrong for a front camera: ARKit's view
  /// matrix already carries the front camera's flip, so eye-space +x is
  /// the right of the image as SHOWN, which is the person's own right.
  ///
  /// It survived four builds because it was cancelled out. The turn
  /// arrow pointed the wrong way too, so people followed the arrow,
  /// turned the opposite way to the instruction, and the step fired —
  /// two errors reading as one working scanner. Fixing the arrow exposed
  /// this: asked to look right, a head turning right produced nothing,
  /// and turning back fired the step it had not been asked for while the
  /// other step was already satisfied by the turn before it.
  ///
  /// Positive-for-own-right is ML Kit's convention, so `headDirection`
  /// in the scan engine reads an ARKit face and an ML Kit face the same
  /// way, and it is the convention `STEP_TARGETS`, `REGION_OF_STEP` and
  /// `closestAngle` are built on. That convention is not what changed
  /// here; what changed is this file finally meeting it.
  ///
  /// `roll` is the odd one out: it is consumed by the overlay drawn on
  /// top of the preview, so it is a screen-space quantity and its sign
  /// belongs to the preview, not to the head. A flip reverses the
  /// handedness of the image plane, so a head the camera sees tilting one
  /// way is drawn tilting the other. Shipped on the wrong side of that,
  /// the cap sat on a head leaning the opposite way to the face under it.
  /// It therefore reads `mirrorPreview` rather than hard-coding a sign —
  /// see the flag's own note for the other two sites that move with it.
  /// Pitch is exempt because it turns about the one axis a left-for-right
  /// flip leaves alone.
  ///
  static func degrees(faceInEye: simd_float4x4) -> (yaw: Float, pitch: Float, roll: Float) {
    let forwardColumn = faceInEye.columns.2
    let upColumn = faceInEye.columns.1
    let forward = SIMD3<Float>(forwardColumn.x, forwardColumn.y, forwardColumn.z)
    let up = SIMD3<Float>(upColumn.x, upColumn.y, upColumn.z)
    guard simd_length(forward) > 1e-6, simd_length(up) > 1e-6 else {
      return (0, 0, 0)
    }
    let f = simd_normalize(forward)
    let u = simd_normalize(up)

    let toDegrees = Float(180) / Float.pi
    let yawEye = atan2(f.x, f.z)
    let pitchEye = atan2(f.y, (f.x * f.x + f.z * f.z).squareRoot())
    let rollEye = atan2(u.x, u.y)

    let rollSign: Float = HairFaceTrackingView.mirrorPreview ? -1 : 1

    return (
      yaw: yawEye * toDegrees,
      pitch: pitchEye * toDegrees,
      roll: rollSign * rollEye * toDegrees
    )
  }
}
