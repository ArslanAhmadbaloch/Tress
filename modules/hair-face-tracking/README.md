# hair-face-tracking

ARKit face tracking for the Tress hair scan. A **local** Expo module: it lives
in `modules/`, is autolinked by `expo-modules-autolinking`, and is not an npm
dependency. There is nothing to install.

```ts
import {
  HairFaceTrackingView,
  capture,
  isFaceTrackingAvailable,
  isFaceFrame,
  isFaceLost,
  isTracking,
} from '../../modules/hair-face-tracking';
```

iOS only, and only on an iPhone with a TrueDepth camera. Everywhere else —
Android, the web, Expo Go, the simulator — `isFaceTrackingAvailable()` is
`false`, `HairFaceTrackingView` renders nothing, and the scan keeps to the
ML Kit path with no error and no warning.

## The one architectural rule

**ARKit and react-native-vision-camera cannot share the front camera.** A
screen that mounts `HairFaceTrackingView` must not mount VisionCamera, and
must take its stills from `capture()` rather than `takePhoto()`. The AR view
*is* the preview.

## What this module is NOT

`ARFaceGeometry` is a **face mask**. It runs from the upper forehead down to
the jaw and chin: no skull, no crown, no back of the head, no ears. Slot 0 of
the rim ring below is the top of the **forehead**, not the top of the head,
and `COVERS_CROWN` is exported as `false` to say so in code.

The scan photographs the crown, so this has to be said plainly: **the crown
is never in this payload and no ARKit release will put it there.** What the
payload gives is a rim glued to the face through any turn and a pose accurate
to a degree — enough for `head-cap.ts` to loft a head *above* the rim and
keep it there through the turn. A cloud of this shape reads as an open shell
rather than a closed head in `readCloud`, which is the honest reading of it.

## Wiring a screen to it

The module ships the one conversion the app needs, `toRawFace`, so no
screen has to re-derive it: the native side speaks in view **fractions**,
and `RawFace` in `src/features/hair-scan/tracking.ts` wants the box in
preview **points**. Getting that wrong puts the cap in the corner of the
screen, silently, so it lives in `src/raw-face.ts` with tests on it.

```tsx
const arkit = isFaceTrackingAvailable();        // false off iOS, always
// …and then, instead of <ScannerCamera/>, never alongside it:
<HairFaceTrackingView
  style={StyleSheet.absoluteFill}
  paused={paused}
  onFace={(e) => {
    const event = e.nativeEvent;
    if (isFaceLost(event)) {
      setTracker((t) => trackFrame(t, null, Date.now()));
      return;
    }
    if (!isFaceFrame(event)) return;
    const raw = toRawFace(event, view);          // view = the preview's size
    if (raw) setTracker((t) => trackFrame(t, raw, Date.now()));
  }}
  onError={() => fallBackToMlKit()}
/>
```

Stills come from `capture()` instead of `takePhoto()`, and everything after
that — the engine, the regions, the record, the report — is unchanged and
identical on both platforms.

`toRawFace` sets `source: 'arkit'`, which is what turns the tracker's
smoothing almost off; leaving it out would smooth an already-stable pose
and reintroduce the lag the module exists to remove.

## Handedness

Which way round everything is. This has been re-derived twice from scratch,
each time at the cost of a phase, so it is written down once here and the
tests hold the Swift to it.

### There are FOUR flips, not one

An earlier draft of this section said the module had a single mirroring in
it and that the single mirroring was `captureOrientation`. That was wrong,
and wrong in the way that costs a phase: a reader who believes it changes
`captureOrientation` expecting all five rows below to move with it, and gets
a **half-flip** — still and sample one way, preview and mesh the other, no
error anywhere, and a symmetric head looking perfectly fine while the
record's sides swap.

Four independent expressions, in three files, decide the handedness. They
agree with each other today, and the convention *is* that agreement:

| # | the flip | where | what it turns |
| --- | --- | --- | --- |
| 1 | `mirrorTransform`, `CGAffineTransform(scaleX: -1, y: 1)`, set on the `ARSCNView` in `layoutSubviews` | `ios/HairFaceTrackingView.swift:38`, applied at `:157` | the **preview**. `ARSCNView` does not mirror a front feed — this line does. Delete it and the preview un-mirrors on its own. |
| 2 | `let x = 1 - Double(projected.x) / Double(size.width)` | `ios/HairFaceTrackingView.swift:435` (the two rings) and `:479` (the pose-only fallback box) | every **point** a frame reports — `cx`, the rim ring, the inner ring — into the mirrored preview's fractions |
| 3 | `yaw: -yawEye`, and the sense carried by `roll: rollEye` | `ios/HairFaceGeometry.swift:383` and `:385` | the **angles**, into ML Kit's on-screen signs |
| 4 | `captureOrientation`, whose every case is a `…Mirrored` variant | `ios/HairFaceTrackingView.swift:292`–`:299`, used at `ios/HairFaceTrackingModule.swift:184` (`capture()`) and `:336` (`sampleFrame()`) | the **still** and the **live sample** |

`atan2(-dx, dy)` in `HairFaceOutline.init`
(`ios/HairFaceGeometry.swift:115`) is **not** a fifth flip, although its
comment talks about the mirror. It is the clockwise-from-noon **ring
ordering** in the face anchor's own space: it decides which 10° slot a vertex
falls in, and nothing at all about which side of the image that vertex is
drawn on. Change it and the ring runs the other way round; the picture keeps
its hand.

So the table that matters:

| what | handedness | decided by |
| --- | --- | --- |
| the preview (`HairFaceTrackingView`) | **mirrored** — raise your right hand, it appears on the right | flip 1, `mirrorTransform` |
| the frame's points (`cx`, `cy`, rim, inner) | **mirrored** — view fractions of that preview | flip 2, the `1 - x` |
| `yaw` / `roll` | **mirrored** — signs taken on screen | flip 3, in `HairFacePose.degrees` |
| `sampleFrame()` bytes | **mirrored** — matches the preview exactly | flip 4, `captureOrientation` |
| `capture()` still | **mirrored** — matches the preview exactly | flip 4, `captureOrientation` |

A test reads all three Swift files and fails if a horizontal flip is added,
moved or removed anywhere in the module, so the count above cannot drift
without somebody being told.

### Mirrored is not "wrong", and un-mirrored is not "anatomically true"

A mirrored photograph shows the same flesh as an un-mirrored one; what
differs is which side of the frame it is on. Because every scan is mirrored
the same way, two scans months apart lay side by side correctly, and the
rectangles the report crops — measured on the mirrored preview — land on the
flesh they name.

Say that last part exactly, because it is the whole of the argument: a crop
filed as `leftTemple` is cut from the image-left of a mirrored still, and the
image-left of a mirrored still **is the person's own left temple**. The
*label* is already anatomically true. What is reversed is only the framing a
viewer expects of a portrait — subject's left on the viewer's right — and
lettering in the background, which reads backwards. Neither is a measurement
error, and un-mirroring the still without moving everything in the list below
does not make the label truer; it makes it false. Weigh that against the
section below before changing anything.

### If the still is ever un-mirrored, these move in the SAME commit

The app reads the still **by image side**, so a flip here is a flip of the
record's left and right. Flipping `captureOrientation` alone swaps every
temple with the other temple, silently, and on a symmetric head it looks
perfectly fine while it does it.

Inside the module first — these are the lines the decision is actually
enacted at, or consciously left alone at, and they are flips 1, 2 and 4 of
the four above:

- `ios/HairFaceTrackingView.swift:292`–`:299` — `captureOrientation`. The
  still and the sample. Dropping `Mirrored` from the four cases is the whole
  of the camera-end change, and by itself it is the half-flip.
- `ios/HairFaceTrackingView.swift:38` and `:157` — `mirrorTransform`. If the
  **preview** is meant to stay mirrored (it is: it is what every front camera
  does, and the person is using it as a mirror), this line does **not** move,
  and that is the deliberate asymmetry the rest of the list then has to
  absorb.
- `ios/HairFaceTrackingView.swift:435` and `:479` — the `1 - x`. The mesh is
  drawn on the preview, so it stays mirrored with the preview; but
  `region-crops.ts` lays that same mesh straight onto the still, so an
  un-mirrored still means the mesh must be un-mirrored **on the way to the
  crop** and nowhere else. Deciding where that happens is the real work of
  the change, and it is not in this module.

And then in the app:

- `src/features/hair-scan/region-crops.ts` — the "Mirroring" note, and the
  `leftTemple` / `rightTemple` rectangles, which are `cx - …` and `cx + …`
  in mesh coordinates laid straight onto the still by
  `meshInBox(mesh, still, still)`. Mesh x is preview x; an un-mirrored still
  needs `1 − x − w`.
- `src/features/hair-scan/measure/regions.ts` — `REGION_BOXES`, whose
  negative u *is* image-left, and the comment above it that says image-left
  is the person's own left. This is the measurement, not the picture.
- `src/features/hair-scan/result.ts` — `closestAngle`'s `leftSign` default,
  and `faceObservationFor`'s `eyes.left` / `eyes.right`, which are
  image-left and image-right on purpose.
- `src/features/hair-scan/engine.ts` — `REGION_OF_STEP`, whose comment
  derives the step → region mapping from the mirrored still.
- Old records. Every photograph already on the phone is mirrored, and
  nothing in `Photo` records which convention it was written under, so a
  flip without a stored flag makes a second scan uncomparable with a first.

The last point is the expensive one: the honest version of this change is a
recorded handedness on each photograph, not a one-line orientation swap.

## What a frame carries

`onFace` fires at most 60 times a second with either `{ lost: true }` or a
`FaceFrame`. Use `isFaceFrame` / `isFaceLost` rather than sniffing fields.

Every position is a **view fraction** of the rendered view — 0 at the
left/top edge, 1 at the right/bottom — measured against the view **as the
user sees it**, which is mirrored like a bathroom mirror. Points outside the
view are reported honestly rather than clamped.

Angles are degrees in **ML Kit's sign convention**, so the scan engine's yaw
dial reads an ARKit face and an ML Kit face the same way:

| angle | positive means |
| --- | --- |
| `yaw` | the nose turns toward the viewer's **right** on screen |
| `pitch` | the chin lifts (looking up); chin-down is negative |
| `roll` | the head tilts **counter-clockwise** on screen |

The derivation is in the comment on `HairFacePose.degrees` in
`ios/HairFaceGeometry.swift`: the anchor is taken into the camera's eye
space for the current interface orientation with `camera.viewMatrix(for:)`,
the face's own forward and up axes are read off it, and the mirroring of the
preview flips `yaw` and reverses the sense of `roll`.

`cx`, `cy`, `width` and `height` are the bounding box of the rim ring
(below) — roughly ML Kit's ear-to-ear, brow-to-chin box, and like ML Kit's,
it contains no part of the head above the brow.

## Coasting: how the crown stage survives

The scan's second stage asks the person to **lower the head, then turn it**,
so the camera can see the crown. At that angle ARKit is looking at a scalp
rather than a face: `ARFaceAnchor.isTracked` goes false, the anchor stops
being updated, and a view that simply fell silent would leave the ring with
nothing to run on — the stage would never arm, which is exactly the failure
the module was built to prevent.

So the last frame that *was* tracked keeps being sent, at ~10 Hz, with
`tracking: false` on it, for `COAST_MS` (1.5 s, mirrored between
`src/points.ts` and `coastGrace` in the Swift). Then `{ lost: true }`.

```ts
if (isFaceFrame(e.nativeEvent)) {
  const held = !isTracking(e.nativeEvent); // a real pose, not a fresh one
}
```

A held frame is worth drawing and worth stepping the ring with. It is *not*
evidence that the person moved, and the stillness test should ignore it. An
untracked anchor's transform is stale, which is why it is flagged rather than
passed off as a reading — a stale pose sold as fresh is what makes a mesh
swim.

An interruption (a call, another app taking the camera) is not coasted: there
is nothing to hold and `{ lost: true }` goes out at once.

## The point order, and why the vertex indices are not hardcoded

The native side sends a fixed subset of **72 points** as two flat `Float`
arrays (`points`, two numbers per point, and `facing`, one per point):

| index | ring | what it is |
| --- | --- | --- |
| 0 – 35 | **rim** | the edge of the face mask, one point every 10°, index 0 at twelve o'clock (top of the forehead), running **clockwise as the user sees themselves in the mirrored preview**, down past the temples and round the jaw |
| 36 – 71 | **inner** | a concentric ring at 58 % of each rim point's distance from the centre, at the same 36 angles and in the same order — the brow and the temples across the top, the outer cheek round the bottom |

The centre of the face is not sent; it is the mean of the inner ring.

`facing[i]` is the vertex normal dotted with the direction to the camera: 1
square on, 0 edge-on, below 0 turned away. It is what lets the drawing side
fade the far half of the cap as the head turns, instead of drawing a mesh
that folds through itself.

### Expression-free vertices only

Both rings are picked **only from vertices an expression does not move**.
ARKit's blend shapes drive the lips, the cheeks, the jaw, the eyelids and the
brow, and a ring allowed to land on those would crawl across the face every
time the person spoke or smiled — independently of head pose, and looking
exactly like the swimming mesh this module replaces. The lower half of the
inner ring is where that would happen: at 130°–230° a plain "58 % of the rim
radius" rule lands on the lips and the chin.

Which vertices those are is **measured, not guessed**. ARKit will build a
geometry from any set of blend-shape coefficients, so
`HairFaceOutline.expressionFree` builds two — every relevant coefficient at
0, and every one at 1 — and any vertex that moves more than 4 mm between them
is an expression's vertex, not the head's. Topology is fixed, so the two line
up index for index. If either geometry cannot be built, or fewer than a
quarter of the vertices survive, the test is distrusted and every vertex is
allowed.

Around the jaw this pulls the rim a few millimetres inside the true edge of
the mask. That is the trade being made deliberately: a boundary slightly
inside the face that stays put beats one exactly on it that jumps whenever
the mouth opens.

### Why the indices are resolved on the device

**The order is the contract. The vertex indices are not.** They are resolved
once, on the device, from the first geometry that arrives — the outermost
expression-free vertex in each 10° bin gives the rim, and the expression-free
vertex nearest 58 % of that radius in the same bin gives the inner ring.
Resolving them per frame would make the points crawl for a second reason, so
they are resolved once and reused for the life of the session.

They are not hardcoded because nobody can check a table of ARKit vertex
indices without a TrueDepth camera in hand, and a wrong table is a mesh
sitting on the nose. A geometric rule can be reasoned about, and is
self-correcting across whatever ARKit ships next. `src/points.ts` mirrors the
layout in TypeScript (`RING_POINTS`, `RIM_START`, `BROW_START`,
`INNER_RADIUS`, `ringAngle`) and the tests hold it there.

Triangle winding is measured rather than assumed: on the first geometry the
accumulated normals are compared against the outward direction from the
face's centre, and the sign is carried for the session. If ARKit ever flips
its winding, `facing` stays correct.

## `capture()`

Resolves `{ uri, width, height }` for a JPEG (quality 0.9) written into
`Caches/hair-face-tracking/`. Nothing leaves the device.

The still is rotated to the interface **and mirrored**, so it matches the
preview the region rectangles in the record were measured against.

The `CIImage` is built on the main thread because everything it needs is a
main-thread read (the view, the session's current frame, the interface
orientation), and the JPEG is encoded on a private queue — never the
session's, and never the main one. Be precise about what that does *not*
mean: `CIImage(cvPixelBuffer:)` retains the buffer and reads it lazily, so
**one slot of the session's capture pool stays held until the encode
finishes**; the `ARFrame` wrapper going out of scope does not release it.
That is a deliberate trade — one buffer held for the few tens of milliseconds
an encode takes, rather than a full-size memcpy on the main thread to get it
back sooner. If an AR stall is ever traced to a capture, the encode's
duration is the thing to measure.

It rejects, rather than resolving something empty, when no view is mounted,
no frame has arrived yet, or the file cannot be written.

## What must be checked on a device

None of this can be compiled or run without Xcode and an iPhone with a
TrueDepth camera. On the first build, check these in order — each has a
named fix beside it.

1. **The preview is mirrored and upright.** Raise your right hand; it should
   appear on the right of the screen. If it is not mirrored, the fix is
   `mirrorTransform` (`ios/HairFaceTrackingView.swift:38`, applied in
   `layoutSubviews` at `:157`) — *not* anything in `capture()`. ARKit hands
   over an un-mirrored front feed; that one line is what reverses it.
2. **The rim ring sits on the edge of the face**, index 0 at the top of the
   forehead, running clockwise. Log the first few points and watch which way
   they go. If they run counter-clockwise, flip the sign of the
   `atan2(-dx, dy)` in `HairFaceOutline.init` — it is the only place the
   direction is decided.
3. **The inner ring does not move when you talk.** Hold the head still, open
   the jaw wide, smile, then speak a sentence. The lower half of the ring
   (slots 13–23, 130°–230°) is the half to watch: it must sit still. If it
   crawls, the expression test is not taking — log how many vertices
   `expressionFree` kept, and raise `expressionTolerance` only if the count
   is implausibly high.
4. **Yaw is positive when you turn your nose to the right of the screen.**
   If it is inverted, the `-yawEye` in `HairFacePose.degrees` is the only
   place to change.
5. **Pitch is negative when you drop your chin** (the crown stage depends on
   this).
6. **The crown stage keeps running with the head down.** Lower the head until
   the camera sees the top of it. `onFace` must keep firing with
   `tracking: false` for about a second and a half — the ring should hold its
   place and keep stepping, not reset — and only then should `lost` arrive.
   If the stream stops dead instead, the coast timer is not running: check
   that `startCoastTimer` was reached and that the timer is on `.common`.
   This is the single most important check on the list; the owner's crown
   capture does not exist without it.
7. **Roll.** ML Kit calls counter-clockwise positive. Tilt your head and
   check the mesh leans with you rather than against you; the fix is the sign
   on `rollEye`. Only the mesh's tilt depends on it.
8. **`facing` is near 1 for the points on the side of the head turned toward
   the lens** and negative for the far side once you turn. If it is inverted
   everywhere, the winding measurement in `HairFaceOutline.init` is the place
   to look, not the per-frame path.
9. **A still from `capture()` is upright and mirrored like the preview** —
   hold up a hand and check the still puts it on the same side the preview
   did. If it is upside down, swap `.leftMirrored` for `.rightMirrored` in
   `captureOrientation`; the full table is in the comment there. If it comes
   out **un**-mirrored, that is not a cosmetic difference and the fix is not
   a one-line swap: read "Handedness" above first — the report crops and the
   measurement both read the still by image side, so an un-mirrored still
   files each temple under the other temple's name.
10. **Background the app and come back.** The session should stop and resume,
    and the scan should keep working.
11. **On an iPhone without face tracking** (or any iPad), `onError` fires and
    nothing else happens — the scan should fall back, not hang. The message
    is not latched to one delivery, so it repeats at most every two seconds
    per start attempt rather than being lost if it fires before the event
    dispatchers are installed.
12. **Frame rate.** ARKit face tracking runs at 60 fps; the event stream is
    throttled to that and at most one main-thread hop is ever in flight. If
    the preview stutters while the mesh draws, the drawing side is the
    suspect, not this module.
