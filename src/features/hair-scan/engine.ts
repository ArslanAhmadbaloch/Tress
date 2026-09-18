/**
 * The hair scan, as a reducer with nothing in it that needs a phone.
 *
 * The screen owns the camera, the tracker and the haptics; this owns the
 * question they are all asking — what is happening right now, and what
 * should happen next. It takes one action at a time (a tracker tick, a
 * frame landing, a button) and returns the next state plus the list of
 * things the outside world should now do. It takes no photographs and
 * fires no haptics, so every rule below can be read and checked under
 * `node --test`.
 *
 * ── The choreography ─────────────────────────────────────────────────
 * One continuous motion, in four steps, with no shutter anywhere in it.
 * The person is told one thing at a time and the engine takes the
 * pictures itself as they move — the pace a KYC check sets, not a photo
 * session:
 *
 *   1. `front` — look straight.        → the FRONT HAIRLINE
 *   2. `right` — turn your head right. → one TEMPLE
 *   3. `left`  — turn your head left.  → the other TEMPLE
 *   4. `down`  — look down.            → the CROWN
 *
 * No chin up, and no shot of the back of the head: neither is something
 * a person can do holding their own phone. Each step hands over the
 * moment its pose is reached AND it is holding a frame it is happy with
 * (`stepSatisfied`); each also hands over on a generous timeout with
 * whatever it has (`STEP_TIMEOUT_MS`), so nobody is ever trapped — but
 * the timeout is the escape hatch, not the design. Start is live the
 * moment a head is followed: any distance, any angle, any light.
 *
 * Those four regions are the report, so they are what the engine asks
 * for: `REQUIRED_REGIONS`, SEVERAL kept frames each, better ones
 * replacing worse ones while the step is still running. Nothing at all
 * is ever said about how far away to stand.
 *
 * ── Why several, and not one ─────────────────────────────────────────
 * Build 19 kept exactly one frame per region, so a whole scan was four
 * pictures. The owner counted them and asked for more, which is the
 * visible half. The other half needs a distinction this feature makes
 * badly, because two different things are called a region:
 *
 *   • A `ScanTarget` — this file's `REQUIRED_REGIONS` — is a CAPTURE
 *     region: a pose the scan goes and photographs.
 *   • `measure/regions.ts`'s `ScanRegion` is a MEASUREMENT region: one
 *     of SIX places on a head. Four of the six share their names with
 *     the four targets, which is the whole trap.
 *
 * They are not in step, because `measureScan` reads ALL SIX measurement
 * regions out of EVERY frame, whatever target that frame was asked for.
 * So four captured frames were never four readings. Driven through this
 * same four-step motion at camera delays of 0–500 ms, build 19 came
 * away with: hairline read in 4 frames (confidence 0.94), partLine 4
 * (0.94), leftTemple 3 (0.54), rightTemple 3 (0.87), midScalp 2 (0.77)
 * — and CROWN 1 (0.25). Five of the six already had a measured spread
 * and were already comparable. It is the crown, and the crown alone,
 * that had one reading, took `SINGLE_FRAME_SPREAD` — a stand-in, not a
 * measurement — sat exactly on `UNREPEATED_CONFIDENCE`, and was refused
 * by `compareScans` every time.
 *
 * So the honest statement of what several frames buy is narrower than
 * "the measurement did not exist", and it is still worth having:
 *
 * 1. The crown becomes measurable at all: 1 frame → 2, confidence
 *    0.25 → 0.72, `insufficient` → a verdict. That is the one region a
 *    person scanning their own head most wants followed and the one the
 *    old curation reliably lost.
 * 2. Every other region gets more readings to disagree over, so its
 *    error bar is measured from more of the turn (midScalp 2 → 7
 *    frames, rightTemple 3 → 7). Note that this can LOWER a confidence
 *    — hairline 0.94 → 0.90 — because frames taken across a wider arc
 *    disagree more. That is the error bar working, not a regression.
 * 3. The record and the processing screen have more than four pictures
 *    in them, which is what the owner asked for.
 *
 * So a region holds up to `FRAMES_PER_REGION`, wants at least
 * `REGION_MIN_FRAMES`, and — this is the part that keeps the error bar
 * honest — the frames it holds have to be DIFFERENT MOMENTS. Two frames
 * of one instant agree perfectly, which would read as a spread of zero:
 * a measurement claiming to be exact, taken twice by accident. See
 * `distinctMoment`.
 *
 * ── No shutter ───────────────────────────────────────────────────────
 * There is no capture action in `ScanAction` and no hold-to-fire. While
 * a step runs the engine raises `capture` requests itself whenever the
 * pose is near that step's target, the head is steady, the region still
 * wants a frame and this instant is not one it already holds. Everything
 * not kept is named in a `discard` event so the screen deletes the file.
 *
 * How many that is, honestly: `CAPTURE_INTERVAL_MS` is a floor between
 * requests, and a region's own pace is the wider of that and
 * `FRAME_GAP_MS` — a still head cannot be photographed twice for the
 * same instant, and a turning one can, because the picture changes. A
 * region may have `PENDING_PER_TARGET` requests in flight at once, so a
 * step no longer waits out a whole camera round trip between frames.
 * Driven end to end that is nine to eleven kept frames across the whole
 * scan — measured, at camera delays of 0, 150, 300 and 500 ms: 9, 9, 10,
 * 11 — two or three per region, and the third only while what the region
 * holds is not yet good. Anything written about how many files a scan
 * puts on a phone has to start there.
 *
 * TWO REQUESTS IN FLIGHT IS NOT TWO SHUTTERS AT ONCE. This is a request
 * for a photograph, not the photograph: `hair-scan.tsx` queues the
 * actual `takePhoto` calls one behind the other, because the iOS capture
 * path holds a slot of the AR session's own pixel-buffer pool for the
 * length of a JPEG encode and asking it for two at a time is asking it
 * to hold two. Widening this widens how fast the engine may ASK.
 *
 * ── The ring ─────────────────────────────────────────────────────────
 * Twenty-four sectors run clockwise from the top, and they are the
 * JOURNEY rather than the pose — `ringDirection`, not `headDirection`.
 * The three upright steps (`stage` 'sweep') walk the top half: the turn
 * to the person's own left at nine o'clock, square on at twelve, the
 * turn to their own right at three. The last step ('crown') walks the
 * bottom half with the chin down: nine, six, three again. The fill only
 * ever rises, so the last step adds to what the first three left rather
 * than restarting it, and between them the whole circle is walked once.
 *
 * It was a compass before, read straight off the pose — and on that dial
 * the top meant the chin LIFTED, which this choreography never asks for.
 * A third of the ring could not light at the end of a perfect scan while
 * the report said it had closed. The picture is the thing the person
 * trusts, so the picture is what was changed. The ring is drawn from
 * `stage`, which is derived from the step: the three upright steps walk
 * the top half and `down` walks the bottom.
 *
 * Frames. Several are kept per wanted region, each filed under the
 * region it was asked for and never under the ring bin it happened to
 * land in. Those are two different things and treating them as one was
 * a bug with teeth: a hairline taken with the phone below eye level
 * shares a bin with every crown frame, and each crown in turn was thrown
 * away for losing to it, so the scan could not finish. A request is only
 * raised when the head is steady, in a pose the step's region still
 * wants, and at a moment that region is not already holding. Every image
 * the engine lets go of — outscored, replaced, answered late, or
 * abandoned by a cancel — is named in a `discard` event, so the screen
 * can delete the file. The frames stop being the engine's at the report,
 * when they belong to the journal.
 *
 * Everything the engine knows is where a head is and how still it was.
 * It cannot see hair, and it never claims to.
 */

import type { CapFit } from './head-cap';
import { CONTOUR_NAMES, type Contours, type TrackedFace, type ViewSize } from './tracking';
import type {
  CaptureRequest,
  CapturedImage,
  DiscardReason,
  FaceReading,
  FrameMesh,
  MeshPose,
  MeshFace,
  RegionScores,
  ScanAction,
  ScanCue,
  ScanEvent,
  ScanFrame,
  ScanMilestone,
  ScanReduction,
  ScanRegion,
  ScanStage,
  ScanState,
  ScanStep,
  ScanTarget,
  ScannerState,
  Size,
  StepProgress,
  StepTarget,
  TargetProgress,
} from './types';

/* ------------------------------ tuning ------------------------------- */

/**
 * The four frames the scan exists to take, and the only thing that ends
 * it. The report shows these images; the plan and the hairstyles read
 * the same record on both platforms.
 */
export const REQUIRED_REGIONS = ['hairline', 'leftTemple', 'rightTemple', 'crown'] as const;

/** The four steps, in the order a person does them. */
export const SCAN_STEPS: readonly ScanStep[] = ['front', 'right', 'left', 'down'];

/*
  ── Handedness, settled ────────────────────────────────────────────────

  Two different facts get called "right" in this feature, and confusing
  them files a photograph of one side of somebody's head under the other.

  1. THE SIGN. Both detectors report positive `yaw` for a head turned
     towards its OWN right, and positive `pitch` for a face tilted up —
     so a lowered chin is negative pitch. The `right` step therefore
     wants POSITIVE yaw, and `left` wants negative.

  2. THE SIDE THE CAMERA SEES, which is the OPPOSITE one. Stand facing a
     camera and turn your head to your own right: your nose swings right,
     your right cheek rotates away from the lens, and your LEFT cheek
     rotates towards it. At the end of that turn the camera is looking at
     your left temple. So `right` (the step) yields `leftTemple` (the
     region), and `left` yields `rightTemple`.

     Two other parts of the app already say this and would be wrong if
     this line were flipped: `ANGLE_GUIDANCE.leftTemple` in
     `src/types/domain.ts` reads "Turn your head to the right to show
     your left side", and `region-crops.ts` cuts the `leftTemple`
     rectangle from the LEFT of the still — which is where that temple
     lands, because the preview and the still are both written mirrored,
     and a mirrored front camera puts your own left on the viewer's left.

  ONE PLACE DISAGREES, and it is in this folder: `closestAngle` in
  `result.ts` defaults `leftSign` to −1, so a NEGATIVE yaw reads as the
  left temple there — the opposite of the line above. It is dormant on
  this path and nothing is mis-filed today, because the screen files
  every scan frame by its explicit `angle` (`ANGLE_OF_TARGET[f.target]`
  in `hair-scan.tsx`) and `scanPhotos` only falls back to a pose when
  that is missing. It is written down here rather than left out so that
  nobody reads this note as unanimity: the two want one owner, and the
  fix belongs in `result.ts`, not here.

  The step is named for the direction the head MOVES, because that is
  what the person is told and what the arrow points at. The region is
  named for the part of the head in the picture. `REGION_OF_STEP` below
  is the only place the two meet, and `stepReach` is the only place the
  sign is read. If a device ever shows this inverted, change those two —
  and `closestAngle`'s default in the same pass, or the app ends up with
  three files on one convention and two on the other.
*/

/**
 * The window either side of square on that counts as the front, in
 * degrees of yaw. `front` asks for half of it closed — 12° — because
 * somebody looking at their own phone is never exactly 0°, and asking
 * them to be was build 17's gate.
 */
export const FRONT_YAW_DEG = 24;
export const FRONT_REACH = 0.5;

/**
 * The turn the `right` and `left` steps aim at, in degrees of yaw.
 *
 * Twenty-eight degrees is a head turn, not a shoulder turn: it is about
 * as far as somebody looking at a phone held in front of them swivels
 * before their eyes leave the screen, and both temples are plainly in
 * frame well before it. Thirty-five and up is where people start turning
 * their whole torso, lose sight of the instruction, and drift out of the
 * picture — so the scan does not ask for it.
 *
 * `TURN_HANDOVER_DEG` is what the step HANDS OVER at, and it is
 * deliberately well short of the aim: nineteen degrees of smoothed yaw,
 * expressed as `TURN_REACH` because that is the share `stepReach`
 * reports. Nine tenths of the aim — 25° — was the design, and it was no
 * design at all: driven with somebody who turns a natural 20° and holds
 * it, both temples were photographed (frames land from about 14°) and
 * yet neither turn step ever reached its target, so both burned their
 * whole seven seconds and a scan that should take six took twenty-two.
 * The timeout is meant to be the escape hatch; at 25° it was the route
 * anybody with an ordinary neck took.
 *
 * Handing over early does not mean settling for the shallow picture. The
 * aim stays 28° — `TEMPLE_FULL_DEG` reads it, so the quality curve keeps
 * paying for the fuller turn — and `stepSatisfied` holds `STEP_SETTLE_MS`
 * past the moment of arrival, so the frame taken as the turn completes
 * replaces the one taken on the way.
 */
export const TURN_YAW_DEG = 28;
export const TURN_HANDOVER_DEG = 19;
export const TURN_REACH = TURN_HANDOVER_DEG / TURN_YAW_DEG;

/**
 * The nod the `down` step aims at, in degrees of chin-down (negative
 * pitch). At twenty-five degrees the top of the head is square to a phone
 * held at chest height, which is where the crown is. `DOWN_HANDOVER_DEG`
 * hands the step over well short of it, for the same reason the turns do:
 * a modest nodder must not be held to the timeout to prove they nodded.
 */
export const DOWN_PITCH_DEG = 25;
export const DOWN_HANDOVER_DEG = 19;
export const DOWN_REACH = DOWN_HANDOVER_DEG / DOWN_PITCH_DEG;

/**
 * What each step asks the head to reach. `stepReach` measures against
 * this and `stepSatisfied` decides when it has been met.
 */
export const STEP_TARGETS: Record<ScanStep, StepTarget> = {
  front: { step: 'front', yawDeg: FRONT_YAW_DEG, pitchDeg: null, reach: FRONT_REACH },
  right: { step: 'right', yawDeg: TURN_YAW_DEG, pitchDeg: null, reach: TURN_REACH },
  left: { step: 'left', yawDeg: -TURN_YAW_DEG, pitchDeg: null, reach: TURN_REACH },
  down: { step: 'down', yawDeg: null, pitchDeg: -DOWN_PITCH_DEG, reach: DOWN_REACH },
};

/**
 * Which part of the head each step puts in front of the lens. The
 * opposite-side pairing on the two turns is the whole of the handedness
 * note above, in two lines of code.
 */
export const REGION_OF_STEP: Record<ScanStep, ScanTarget> = {
  front: 'hairline',
  right: 'leftTemple',
  left: 'rightTemple',
  down: 'crown',
};

/**
 * Angles used to score a frame once its region is known — how well this
 * pose stands for that region, rather than whether the step is done.
 *
 * Deliberately generous, and set where a comfortable turn lands after the
 * tracker's smoothing rather than where the detector stops reading.
 */
/** Inside this much turn, the frame shows the front hairline. */
export const HAIRLINE_YAW_DEG = FRONT_YAW_DEG * FRONT_REACH;
/** From this much turn, the frame shows that temple. */
export const TEMPLE_YAW_DEG = 16;
/** At this much turn the temple is as well seen as the scan asks for. */
export const TEMPLE_FULL_DEG = TURN_YAW_DEG;
/** Chin down this far (pitch ≤ −this) and the top of the head comes into view. */
export const CROWN_PITCH_DEG = 14;
/** Chin down this far, the crown is as well seen as the scan asks for. */
export const CROWN_FULL_DEG = DOWN_PITCH_DEG;

/**
 * How far the chin may be off level before an upright step's frame stops
 * being what it says it is. The two sides are not the same distance, and
 * treating them as one number was a bug that cost people whole steps.
 *
 * Inside `LEVEL_PITCH_DEG` nothing is deducted at all: almost everybody
 * holds a phone below eye level, and that is not a mistake to be
 * corrected. Past it the score tapers, to nothing at the limit for that
 * side:
 *
 * - CHIN UP (`SWEEP_PITCH_UP_LIMIT_DEG`). The tight one. The forehead
 *   leaves the picture quickly when a phone goes overhead, and what is
 *   left is nostrils: there is no hairline in that frame and no temple
 *   either, however good the picture is.
 * - CHIN DOWN (`SWEEP_PITCH_DOWN_LIMIT_DEG`). The generous one, and it
 *   has to be. A phone at chest height reads thirty degrees of chin-down
 *   on a person doing nothing wrong — and chin-down is the side where
 *   MORE of the hairline faces the lens, not less. A symmetric ±30° gate
 *   meant that person's first three steps could not raise a single
 *   capture request: three steps' worth of titles asking them to look
 *   straight, then right, then left, each running its whole timeout with
 *   nothing taken and nothing said. Fifty degrees is where the face
 *   really has become a scalp.
 *
 * Both are deliberately much deeper than `CROWN_PITCH_DEG`: the upright
 * steps and the crown step share poses, and a frame is filed by the
 * region its step asked for, never by the pose it happened to be at.
 */
export const LEVEL_PITCH_DEG = 12;
export const SWEEP_PITCH_UP_LIMIT_DEG = 30;
export const SWEEP_PITCH_DOWN_LIMIT_DEG = 50;

export const RING_SECTORS = 24;
export const SECTOR_DEG = 360 / RING_SECTORS;

/** The front plus twelve slices of the ring. Bin 0 is the front. */
export const RING_BINS = 12;
/**
 * How many frames one region may hold, and the fewest it wants.
 *
 * `REGION_MIN_FRAMES` is two because two is the fewest readings that can
 * disagree with one another, and the disagreement IS the measurement's
 * error bar (`measure/noise.ts`: `REPEATED_FRAMES` is the same two, and
 * a measurement region below it is capped at `UNREPEATED_CONFIDENCE` and
 * refused by `compareScans`). A step is not satisfied until its capture
 * region has them.
 *
 * The two counts are not the same count — `measureScan` reads all six
 * measurement regions out of every frame, so two frames a target is
 * seven-odd readings for the regions that face the lens throughout and
 * two for the crown, which only the last step sees. Two here is what it
 * takes to get the CROWN over `REPEATED_FRAMES`; the rest were already
 * over it at build 19. See the header.
 *
 * `FRAMES_PER_REGION` is the ceiling, and the third frame is only asked
 * for while the region's poorest is short of `GOOD_QUALITY` — so a clean
 * scan costs two shutters a region and a scrappy one costs three.
 */
export const REGION_MIN_FRAMES = 2;
export const FRAMES_PER_REGION = 3;

/**
 * How many frames the scan ever holds.
 *
 * Arithmetic, not a policy. The store is keyed by region, each region
 * caps its own list, so this is the product and nothing is ever evicted
 * across regions.
 */
export const MAX_FRAMES = REQUIRED_REGIONS.length * FRAMES_PER_REGION;

/**
 * Degrees of turn that count as the side fully seen.
 *
 * The tracker smooths yaw and the reading lags the turn, so this is set
 * where a comfortable turn lands, not where ML Kit stops reading. With
 * `REGION_NEEDED` below, a side is done from about 23° of smoothed yaw.
 * Device-tune upwards only if real scans finish too easily.
 */
export const YAW_FULL_DEG = 26;
/** Degrees of chin-down that count as the chin band fully seen. */
export const PITCH_DOWN_FULL_DEG = 18;
/** Below this normalised deviation the head is "front"; above it, on the ring. */
export const FRONT_DEVIATION = 0.3;

/** Sectors this close to the head's direction fill fully; further, they taper to nothing. */
export const SPREAD_FULL_DEG = 30;
export const SPREAD_ZERO_DEG = 55;

/** Sufficiency: how full each region must be. The chin only needs "some". */
export const REGION_NEEDED: RegionScores = { front: 1, right: 0.8, left: 0.8, chin: 0.5 };
export const REGION_WEIGHT: RegionScores = { front: 0.1, right: 0.3, left: 0.3, chin: 0.3 };

/** Sectors whose centres sit within 30° of three, six and nine o'clock. */
export const RIGHT_SECTORS = [4, 5, 6, 7];
export const CHIN_SECTORS = [10, 11, 12, 13];
export const LEFT_SECTORS = [16, 17, 18, 19];
export const REQUIRED_SECTORS = [...RIGHT_SECTORS, ...CHIN_SECTORS, ...LEFT_SECTORS];

/**
 * Framing, as fractions of the guidance frame.
 *
 * None of these gate anything any more. `SIZE_MIN`/`SIZE_MAX`/`SIZE_IDEAL`
 * survive only inside `frameQuality`, where they say which of two frames
 * of the same pose is the better picture; no cue and no gate reads them,
 * and the scan never asks anybody to move closer or further away.
 */
export const SIZE_MIN = 0.3;
export const SIZE_MAX = 0.68;
export const SIZE_IDEAL = 0.46;

/**
 * Past this far from the middle of the guidance frame the head is
 * leaving the picture, and is asked back. A cue, never a gate: the ring
 * keeps filling and the shutter keeps working while it is said.
 */
export const OFF_FRAME_TOLERANCE = 0.34;

/** Front lock: within this of square on and steady. */
export const FRONT_LOCK_DEG = 8;

/**
 * How steady the head has to be for a frame to be worth asking for, and
 * the floor a step drops to rather than come away with nothing.
 *
 * `stabilityOf` (tracking.ts) measures the centre moving and the size
 * changing — a deliberate turn with a still phone reads as steady — so
 * this is a shaky HAND, not a turning head. But a shaky hand used to
 * cost the whole scan: driven at 0.50 throughout, the engine raised no
 * request at all, all four steps ran their timeouts, and `settle` found
 * no frames and showed the error screen. A blurry picture of somebody's
 * hairline is worth more to them than that, so a step that is past
 * `STEP_RELAX_SHARE` of its own time with nothing for its region settles
 * for `STABLE_RELAXED` — and the frame carries its low quality with it,
 * so a steadier pass still replaces it.
 *
 * The pose is never relaxed, only the picture: what a frame is OF is not
 * something to compromise on to fill a slot.
 */
export const STABLE_MIN = 0.55;
export const STABLE_RELAXED = 0.25;
export const STEP_RELAX_SHARE = 0.45;
/**
 * The other way a step relaxes: the pose held for this long with nothing
 * taken. Arriving is the signal — a head sitting in the pose the title
 * asked for, and no picture of it — and it comes long before the share of
 * the timeout does, which matters most on `front`, where a person is in
 * the pose from the first tick.
 */
export const STEP_ARRIVED_GRACE_MS = 700;
/**
 * Lighting below this is dark enough to be worth mentioning. It gates
 * nothing: Start arms in the dark, and a dark frame is still a frame —
 * `frameQuality` simply scores it low, so a better-lit pass replaces it.
 */
export const LIGHT_MIN = 0.3;
/** The neutral lighting score used for quality when lighting is unmeasured. */
export const LIGHT_UNKNOWN = 0.7;

/**
 * The floor between two capture requests, and how many of them one
 * region may have in flight at once.
 *
 * Neither is the rate. A region's real pace is the wider of this floor
 * and `FRAME_GAP_MS`, because a request for a moment the region already
 * holds is not raised at all (`newMoment`) — there is no point writing a
 * file only to discard it. So a head sitting still is photographed about
 * every `FRAME_GAP_MS`, and a head turning every `CAPTURE_INTERVAL_MS`,
 * which is what a turn deserves: the picture is changing.
 *
 * `PENDING_PER_TARGET` is the widening build 20 needed. Before it, a
 * region refused a second request while one was out, so the shutter was
 * paced by the camera's whole round trip and a step could only ever come
 * away with one picture. Two in flight lets a turn be photographed twice
 * on its way through without the scan taking any longer.
 *
 * It is a limit on OUTSTANDING REQUESTS, not on concurrent shutters.
 * `hair-scan.tsx` chains its `takePhoto` calls so the camera is only
 * ever asked for one photograph at a time — on iOS each capture holds a
 * slot of the AR session's pixel-buffer pool until its JPEG encode
 * finishes, and two at once would hold two. Raise this and the engine
 * asks sooner; the camera still answers in order.
 */
export const CAPTURE_INTERVAL_MS = 300;
export const MAX_PENDING = 2;
export const PENDING_PER_TARGET = 2;

/**
 * When two frames of one region count as two moments rather than one.
 *
 * This is the guard on the error bar. `measure/noise.ts` reads a
 * region's spread as how far its frames disagreed, so two frames of the
 * SAME instant would disagree by nothing and publish a spread of zero —
 * a false error bar, and worse than none, because a zero spread lets any
 * difference next month clear the noise floor. Two frames count as two
 * moments when they are `FRAME_GAP_MS` apart in the clock OR
 * `FRAME_TURN_DEG` apart in pose; anything closer than both is the same
 * instant photographed twice, and the better picture of it is kept.
 *
 * `FRAME_GAP_MS` is deliberately wider than `CAPTURE_INTERVAL_MS`: the
 * interval is what the camera may be asked at, this is what actually
 * counts as new. Three degrees is about a tenth of the turn a step asks
 * for — plainly a different picture of the head, and well above the
 * degree or so a smoothed reading drifts by while somebody holds still.
 */
export const FRAME_GAP_MS = 400;
export const FRAME_TURN_DEG = 3;

/** A region whose poorest frame is at or above this quality is not asked for a better one. */
export const GOOD_QUALITY = 0.8;
/** A replacement must beat the frame it replaces by this much to be worth a shutter. */
export const REPLACE_MARGIN = 0.1;

/** Head speed, in degrees per second, above which frames are refused. */
export const TOO_FAST_DEG_PER_S = 90;
export const TOO_FAST_EVENT_GAP_MS = 1500;
export const SLOW_DOWN_HOLD_MS = 1000;
/** In a bin that wants a frame but not steady for this long: ask for stillness. */
export const HOLD_HINT_MS = 500;

export const LOST_MS = 600;
export const STALL_MS = 3500;

/**
 * How near a step's target the head has to be before frames are worth
 * asking for, as a share of that step's own `reach`.
 *
 * Seven tenths: the pictures start arriving while the turn is still
 * finishing, which is the point of a continuous motion, and the last and
 * best of them lands at the end of it.
 */
export const CAPTURE_REACH = 0.7;

/**
 * How long a step holds after its first frame so a better one can take
 * its place — the deeper nod, the fuller turn. Short: this is the beat
 * between "we have it" and "next", and it is paid four times.
 */
export const STEP_SETTLE_MS = 400;

/*
  ── The shallow turn ───────────────────────────────────────────────────

  A turn step hands over at `TURN_HANDOVER_DEG`. Somebody who turns a
  little less than that — and plenty of people do, once, because nobody
  has told them how far is far enough — reaches neither turn target.
  Both steps run their whole timers, the `down` step follows, and about
  twenty-two seconds later the scan has the hairline and an explanation
  of nothing. That is the failure this build is here to end, and the
  owner was explicit about which way to end it: ASK FOR MORE TURN, rather
  than lower the bar again and keep the poor frame.

  Four numbers say when asking is fair, and all four have to be true at
  once, because each on its own would catch somebody who is simply still
  moving — or somebody who has not moved at all, which is a different
  person needing a different sentence:

  - `NUDGE_STARTED_SHARE` — the head has actually come some way: a
    quarter of the distance to the hand-over, which is about 4.8° in
    either step. (A quarter of `TURN_HANDOVER_DEG` and a quarter of
    `DOWN_HANDOVER_DEG`, and those are both 19°: the share is applied to
    a step's `reach`, whose scale is its own full angle, so the two
    scales cancel and turn and nod come out at the same 4.75°.)
    It is what makes "keep turning" and "a little further" true
    sentences. Below it nothing has begun, and a phone telling somebody
    to keep doing a thing they have not started is a phone that is not
    watching; the step's own title and the arrow ask them, as they always
    did. Above the couple of degrees a head drifts by while it is held
    still, so a still head is never mistaken for a short turn.
  - `NUDGE_PLATEAU_MS` — the best the step has seen has not improved for
    a second. A second is long enough that it is a decision and short
    enough to be worth saying: a turn that is still coming gains several
    degrees in that time.
  - `NUDGE_GAIN_REACH` — what counts as an improvement at all, measured
    from the last place the head actually got to (`gainedReach`) rather
    than from the frame before. A smoothed reading creeps up by hundredths
    while a head sits perfectly still, so without a floor under "improved"
    the plateau would never be reached by anybody; and measured frame to
    frame instead, a six-second turn gains a thousandth at a time and the
    slowest turn in the world would read as a dead stop. Three hundredths
    of a step's own scale is about 0.8° of turn: below that, nothing is
    happening.
  - `NUDGE_AFTER_SHARE` — enough of the step's own time has gone. Before
    that, a person may simply not have started; the arrow and the title
    have earned the right to be tried first. It is `STEP_RELAX_SHARE`
    itself, and tied to it rather than merely near it, so that a step
    still chasing its first frame has already given way on how steady the
    hand has to be before this can speak over the stillness line. Set an
    eighth lower — which it was, at a third — and there is most of a
    second in every step where the screen asks for more turn while
    quietly withholding the correction that is actually blocking the
    frame.

    THE TIE IS NOT AN INVARIANT, and the older comment here claimed it
    was. `stepRelaxed` returns false at its FIRST line once the step's
    region has a frame, and this nudge deliberately says nothing about
    whether the region has one — so from about 13.3° (`CAPTURE_REACH` of
    the target) up to the 19° hand-over, the region is captured, the turn
    is still short, and the nudge can speak while `stepRelaxed` is false.
    That band is precisely the shallow turn this exists for, so it is the
    case to reason about rather than the exception. It is sound on its
    own merits, not on the tie: "hold still" is only reached at all while
    a frame is actually WANTED here (`holdWanted && state.hold !== null`,
    and `targetWants` declines once the region holds two good pictures,
    as does `newMoment` for an instant it already has), the ask lasts
    `NUDGE_SAY_MS` and not the step, and the turn is the only one of the
    two that can finish the step.

  And one more says how long the asking LASTS. `NUDGE_SAY_MS` is the ask:
  a beat, long enough to read a four-word line twice at the edge of the
  eye, and then the plate is free again. The nudge is not a banner that
  owns the rest of a step — a sticky one would sit on top of "find a
  brighter spot" for fifteen seconds of a twenty-two second scan, and
  poor light is exactly what makes the shallow frames such a scan keeps
  worse. If the head moves and stops again, that is a new plateau and a
  new ask; standing still is asked about once.

  It is guidance and nothing else: no gate, no extra timer, no effect on
  `stepSatisfied`, `stepExpired` or anything the scan keeps. If the turn
  still does not come, the step ends exactly as it does today and the
  report says honestly which regions it held.
*/
export const NUDGE_PLATEAU_MS = 1_000;
export const NUDGE_GAIN_REACH = 0.03;
export const NUDGE_STARTED_SHARE = 0.25;
export const NUDGE_AFTER_SHARE = STEP_RELAX_SHARE;
export const NUDGE_SAY_MS = 2_500;

/**
 * The corrective line each step asks with when the turn stops short, and
 * null for the one step that never asks. `front` is not a turn: there is
 * nowhere further to go from square on, and a person looking straight at
 * their phone being told to look straighter is the build-17 gate wearing
 * a new hat.
 */
export const TURN_FURTHER_CUE: Record<ScanStep, ScanCue | null> = {
  front: null,
  right: 'turnFurtherRight',
  left: 'turnFurtherLeft',
  down: 'turnFurtherDown',
};

/** Whether a cue is the ask-for-more-turn nudge, whichever way it points. */
export function isTurnFurtherCue(cue: ScanCue | null): boolean {
  return cue === 'turnFurtherRight' || cue === 'turnFurtherLeft' || cue === 'turnFurtherDown';
}

/**
 * The longest each step may run before it hands over with whatever it
 * holds. Nobody is ever trapped, and nobody is ever asked twice.
 *
 * They add up to 27 s, and with the in-flight wait the worst scan anybody
 * can have — somebody who presses Start and then does nothing at all — is
 * about 28.5 s. Driven, the scans people actually have are far shorter:
 * about 6 s for a full 28° turn and 25° nod, and about 7 s for somebody
 * who only turns 20° and nods 20°. That second figure is the one this
 * build exists to fix: at the old hand-over angle the same person took
 * 22 s, because both turn steps ran their whole timeout to prove a turn
 * they had already made.
 */
export const STEP_TIMEOUT_MS: Record<ScanStep, number> = {
  front: 5_000,
  right: 7_000,
  left: 7_000,
  down: 8_000,
};

/**
 * The backstop under all four timeouts: at thirty-two seconds the scan
 * ends with whatever it has, whatever the steps think.
 */
export const FORCED_FINISH_MS = 32_000;
/** How long completion waits for in-flight frames before going on without them. */
export const SETTLE_MS = 1500;

/* ------------------------------ state -------------------------------- */

function freshTarget(): TargetProgress {
  return { captured: false, quality: 0, weakest: 0, frameIds: [], reach: 0 };
}

export function createTargets(): Record<ScanTarget, TargetProgress> {
  return {
    hairline: freshTarget(),
    leftTemple: freshTarget(),
    rightTemple: freshTarget(),
    crown: freshTarget(),
  };
}

function freshStep(): StepProgress {
  return {
    reach: 0,
    frames: 0,
    firstFrameAt: null,
    reachedAt: null,
    gainedAt: null,
    gainedReach: 0,
    done: false,
  };
}

export function createSteps(): Record<ScanStep, StepProgress> {
  return { front: freshStep(), right: freshStep(), left: freshStep(), down: freshStep() };
}

/** The half of the choreography a step belongs to, for the older screens. */
export function stageOfStep(step: ScanStep): ScanStage {
  return step === 'down' ? 'crown' : 'sweep';
}

export function createScanState(): ScanState {
  return {
    scanner: 'instructions',
    status: 'initializing',
    step: 'front',
    stepIndex: 0,
    stepStartedAt: null,
    steps: createSteps(),
    stage: 'sweep',
    targets: createTargets(),
    cue: null,
    permission: 'unknown',
    error: null,
    sectors: new Array<number>(RING_SECTORS).fill(0),
    completion: 0,
    regions: { front: 0, right: 0, left: 0, chin: 0 },
    frontLocked: false,
    frames: [],
    pending: [],
    abandoned: [],
    startedAt: null,
    completedAt: null,
    completeReason: null,
    lastTickAt: null,
    lastFaceAt: null,
    lastReading: null,
    lost: false,
    lastRequestAt: null,
    lastGainAt: null,
    stalled: false,
    lastTooFastAt: null,
    slowDownUntil: 0,
    hold: null,
    milestones: [],
    requestCount: 0,
  };
}

/* ---------------------------- geometry ------------------------------- */

/** The centre of a sector, in degrees clockwise from the top. */
export function sectorAngle(index: number): number {
  return index * SECTOR_DEG + SECTOR_DEG / 2;
}

/** Shortest angular distance between two ring angles, in degrees. */
export function angularGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
}

export type HeadDirection = {
  /** Degrees clockwise from the top: right turn → 90, chin down → 180, left turn → 270. */
  angle: number;
  /** Normalised deviation from square on; 1 is a full turn or a full chin-down. */
  magnitude: number;
};

/**
 * Where the head is pointing, as a direction on the ring.
 *
 * Yaw and chin-down are each normalised by the amount that counts as
 * "fully seen", so a full turn and a full nod are the same distance from
 * the centre and the ring is round rather than a lozenge.
 */
export function headDirection(face: Pick<FaceReading, 'yaw' | 'pitch'>): HeadDirection {
  const x = face.yaw / YAW_FULL_DEG;
  const down = -face.pitch / PITCH_DOWN_FULL_DEG;
  const magnitude = Math.hypot(x, down);
  const raw = (Math.atan2(x, -down) * 180) / Math.PI;
  return { angle: ((raw % 360) + 360) % 360, magnitude };
}

/**
 * Where the JOURNEY stands on the dial, which is not the same thing as
 * where the head is pointing.
 *
 * `headDirection` reads a pose as a compass bearing, and on that dial the
 * top is the chin lifted. Nothing in this choreography ever asks anybody
 * to lift their chin, so the top third of the ring could never light: a
 * perfect scan ended with eight of the twenty-four sectors dark while the
 * report said the ring had closed. The picture is the thing the person
 * trusts, so the dial is now the journey rather than the pose.
 *
 * The journey is a turn made twice. The upright steps walk the TOP half —
 * the turn to the person's own left at nine o'clock, square on at twelve,
 * the turn to their own right at three. The last step walks the BOTTOM
 * half with the chin down: nine o'clock, six, three. Between them the
 * turn is made once each way and the whole circle is walked once, which
 * is what the ring has claimed all along.
 *
 * Null when this pose is not part of this stage's walk — a head bowed out
 * of the upright steps, or a chin not yet down in the last one. Nothing
 * fills then, and nothing is taken away either: the sectors only rise.
 */
export function ringDirection(
  face: Pick<FaceReading, 'yaw' | 'pitch'>,
  stage: ScanStage,
): HeadDirection | null {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch)) return null;
  const turn = Math.max(-1, Math.min(1, face.yaw / YAW_FULL_DEG));
  if (stage === 'sweep') {
    // The same asymmetry as the capture gate: a phone held low is not a
    // head bowed out of the sweep, and the ring must keep filling for it.
    if (face.pitch >= SWEEP_PITCH_UP_LIMIT_DEG) return null;
    if (face.pitch <= -SWEEP_PITCH_DOWN_LIMIT_DEG) return null;
    return { angle: ((turn * 90) % 360 + 360) % 360, magnitude: 1 };
  }
  if (!(face.pitch <= -CROWN_PITCH_DEG)) return null;
  return { angle: 180 - turn * 90, magnitude: 1 };
}

/** Which of the 24 sectors an angle falls in. */
export function sectorOf(angle: number): number {
  const a = ((angle % 360) + 360) % 360;
  return Math.min(RING_SECTORS - 1, Math.floor(a / SECTOR_DEG));
}

/** Which frame bin the head is in: 0 for the front, 1–12 clockwise from the top. */
export function binOf(direction: HeadDirection): number {
  if (direction.magnitude < FRONT_DEVIATION) return 0;
  const slice = 360 / RING_BINS;
  return 1 + (Math.round(direction.angle / slice) % RING_BINS);
}

const RING_REGIONS: ScanRegion[] = [
  'up', 'rightUp', 'rightUp', 'right', 'rightDown', 'rightDown',
  'chin', 'leftDown', 'leftDown', 'left', 'leftUp', 'leftUp',
];

export function regionOfBin(bin: number): ScanRegion {
  if (bin <= 0) return 'front';
  return RING_REGIONS[(bin - 1) % RING_BINS] ?? 'front';
}

/**
 * How much each sector is filled by a head seen in this direction.
 *
 * Magnitude sets the ceiling: a small turn is a small fill, and only a
 * full turn fills anything to the top. Angular distance tapers it, so a
 * head pointing at three o'clock fills the sectors around three o'clock
 * and nothing at nine.
 */
export function fillFor(direction: HeadDirection): number[] {
  const reach = clamp01((direction.magnitude - FRONT_DEVIATION) / (1 - FRONT_DEVIATION));
  const out = new Array<number>(RING_SECTORS).fill(0);
  if (reach <= 0) return out;
  for (let i = 0; i < RING_SECTORS; i += 1) {
    const gap = angularGap(sectorAngle(i), direction.angle);
    const angular =
      gap <= SPREAD_FULL_DEG
        ? 1
        : clamp01(1 - (gap - SPREAD_FULL_DEG) / (SPREAD_ZERO_DEG - SPREAD_FULL_DEG));
    out[i] = reach * angular;
  }
  return out;
}

/** Nothing gained this frame. Shared because it is never written to. */
const EMPTY_FILL: readonly number[] = new Array<number>(RING_SECTORS).fill(0);

function mean(values: readonly number[], indices: readonly number[]): number {
  if (indices.length === 0) return 0;
  let sum = 0;
  for (const i of indices) sum += values[i] ?? 0;
  return sum / indices.length;
}

export function regionScores(sectors: readonly number[], frontLocked: boolean): RegionScores {
  return {
    front: frontLocked ? 1 : 0,
    right: mean(sectors, RIGHT_SECTORS),
    left: mean(sectors, LEFT_SECTORS),
    chin: mean(sectors, CHIN_SECTORS),
  };
}

/** 0–1, exactly 1 when every region has what sufficiency asks of it. */
export function completionOf(regions: RegionScores): number {
  let total = 0;
  for (const key of ['front', 'right', 'left', 'chin'] as const) {
    total += REGION_WEIGHT[key] * clamp01(regions[key] / REGION_NEEDED[key]);
  }
  return Math.min(1, total);
}

/* ------------------------- the wanted regions ------------------------ */

/**
 * 0–1: how far towards this step's pose the head has come.
 *
 * `front` is the odd one out and it is the only one that has to be: it
 * measures how much of the front window has been CLOSED, so 1 is square
 * on and 0 is at the window's edge. The other three measure the turn or
 * the nod they ask for, against the angle they aim at. The signs are the
 * handedness note at the top of this file, and this is the only place
 * they are read.
 */
export function stepReach(step: ScanStep, face: Pick<FaceReading, 'yaw' | 'pitch'>): number {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch)) return 0;
  switch (step) {
    case 'front':
      return clamp01(1 - Math.abs(face.yaw) / FRONT_YAW_DEG);
    // Positive yaw is the head turned towards its own right.
    case 'right':
      return clamp01(face.yaw / TURN_YAW_DEG);
    case 'left':
      return clamp01(-face.yaw / TURN_YAW_DEG);
    // Negative pitch is the chin lowered.
    case 'down':
      return clamp01(-face.pitch / DOWN_PITCH_DEG);
    default:
      return 0;
  }
}

/**
 * Whether the pose is near enough this step's target for a frame to be
 * worth asking for.
 *
 * Two conditions, and the first is the one that keeps the report honest:
 * the region this step is FOR has to be in the picture at all
 * (`targetFit` above zero). A frame is filed under the region its step
 * asked for, so a near-frontal frame raised by the `right` step would be
 * captioned as a temple in somebody's report; the score that decides
 * which frame to keep is the same function that decides whether to ask
 * for one, so the two cannot drift apart.
 *
 * That single clause carries the whole chin window with it, including its
 * asymmetry (see `SWEEP_PITCH_UP_LIMIT_DEG` and
 * `SWEEP_PITCH_DOWN_LIMIT_DEG`, which `levelFit` reads): a phone held at
 * chest height is thirty degrees of chin-down with a hairline in every
 * frame, and a phone held overhead is nostrils at the same number.
 * Nothing about how somebody holds their phone is ever said out loud; it
 * is scored, not corrected.
 *
 * The second is the step's own target, approached: frames start arriving
 * while the turn is still finishing, which is the point of a continuous
 * motion.
 */
export function stepWantsFrame(step: ScanStep, face: Pick<FaceReading, 'yaw' | 'pitch'>): boolean {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch)) return false;
  if (targetFit(face, REGION_OF_STEP[step]) <= 0) return false;
  return stepReach(step, face) >= CAPTURE_REACH * STEP_TARGETS[step].reach;
}

/**
 * 0–1: how much of the front of the head a chin angle leaves in view.
 *
 * Level is a whole frame; at the limit for that side there is nothing of
 * the hairline left to photograph. It cuts both ways and the two ways are
 * different lengths — the same asymmetry the capture gate has, so the
 * curve and the gate cannot disagree about what is photographable. The
 * chin-up side is the short one: a phone held above eye level used to
 * score a perfect hairline for a picture of two nostrils, and because it
 * scored perfectly, the square-on frame that followed could not replace
 * it.
 */
function levelFit(pitch: number): number {
  const off = Math.abs(pitch);
  if (off <= LEVEL_PITCH_DEG) return 1;
  const limit = pitch >= 0 ? SWEEP_PITCH_UP_LIMIT_DEG : SWEEP_PITCH_DOWN_LIMIT_DEG;
  return clamp01(1 - (off - LEVEL_PITCH_DEG) / (limit - LEVEL_PITCH_DEG));
}

/**
 * 0–1: how well this pose shows that region.
 *
 * Square on is a perfect hairline and a hopeless temple; the temples
 * earn their score with the turn, the crown with the depth of the nod.
 * The upright steps' two also earn it with the chin: both are pictures of the
 * front of the head, so both are scaled by `levelFit`. `frameQuality`
 * scales by all of this, so the first frame to scrape into a region
 * never counts as good and the better pass replaces it — the picture
 * the report calls the left temple is the left temple, and the one it
 * calls the hairline has a hairline in it.
 */
export function targetFit(face: Pick<FaceReading, 'yaw' | 'pitch'>, target: ScanTarget): number {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch)) return 0;
  switch (target) {
    case 'hairline':
      return clamp01(1 - Math.abs(face.yaw) / (HAIRLINE_YAW_DEG * 2)) * levelFit(face.pitch);
    case 'leftTemple':
    case 'rightTemple': {
      const turn = Math.abs(face.yaw);
      const fit = clamp01((turn - TEMPLE_YAW_DEG) / (TEMPLE_FULL_DEG - TEMPLE_YAW_DEG));
      return fit * levelFit(face.pitch);
    }
    case 'crown':
      return clamp01((-face.pitch - CROWN_PITCH_DEG) / (CROWN_FULL_DEG - CROWN_PITCH_DEG));
    default:
      return 0;
  }
}

/**
 * How near the head has come to a region, counting the approach as well
 * as the arrival, so the progress figure moves while somebody is still
 * turning rather than jumping in quarters.
 */
export function targetReach(face: Pick<FaceReading, 'yaw' | 'pitch'>, target: ScanTarget): number {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch)) return 0;
  switch (target) {
    case 'hairline':
      return targetFit(face, target);
    // Same pairing as `REGION_OF_STEP`: the left temple comes into view as
    // the head turns towards its own right, which is positive yaw.
    case 'leftTemple':
      return clamp01(face.yaw / TEMPLE_YAW_DEG);
    case 'rightTemple':
      return clamp01(-face.yaw / TEMPLE_YAW_DEG);
    case 'crown':
      return clamp01(-face.pitch / CROWN_PITCH_DEG);
    default:
      return 0;
  }
}

/** Every wanted region captured: what makes a finished scan a full one. */
export function isSufficient(targets: Record<ScanTarget, TargetProgress>): boolean {
  return REQUIRED_REGIONS.every((region) => targets[region].captured);
}

/**
 * The most of its quarter of the journey a region may be worth while
 * nobody has actually photographed it.
 *
 * `reach` is pose alone — how near the head has come — so without a
 * ceiling the figure reaches 1 on head movement, and a scan that never
 * saw the crown and ran out of time is written into the journal and read
 * out in the report as complete. The approach is worth showing, because
 * a figure that only moved four times would be no use to anybody; the
 * photograph is worth the rest.
 */
export const REACH_CEILING = 0.75;

/**
 * 0–1 across the whole journey, and 1 exactly when all four regions have
 * been captured. Approaching a region moves it; only the frame finishes
 * it. Whatever reads this figure — the ring, the record, the report —
 * can therefore treat 1 as "the scan got everything it went for".
 */
export function journeyProgress(targets: Record<ScanTarget, TargetProgress>): number {
  let total = 0;
  for (const region of REQUIRED_REGIONS) {
    const held = targets[region];
    total += held.captured ? 1 : Math.min(REACH_CEILING, clamp01(held.reach));
  }
  return clamp01(total / REQUIRED_REGIONS.length);
}

/**
 * How much of the pose the progress inside a step is made of; the rest
 * is the photograph. Same bargain as `journeyProgress`: the approach is
 * worth showing, because a bar that moved once would be no use, but only
 * the frame finishes the step.
 */
export const STEP_POSE_SHARE = 0.7;

/**
 * 0–1 inside the current step: what the thin bar at the top fills to,
 * and what the arrow takes its urgency from.
 *
 * Monotonic within a step, because `steps[step].reach` only ever rises,
 * so the bar cannot flinch backwards while somebody steadies themselves.
 */
export function stepProgress(state: ScanState): number {
  const step = state.step;
  const target = STEP_TARGETS[step];
  const held = state.steps[step];
  if (held.done) return 1;
  const pose = target.reach <= 0 ? 1 : clamp01(held.reach / target.reach);
  // The pictures, plural: the step wants `REGION_MIN_FRAMES` of them, so
  // the first one fills half of this share and the second the rest.
  const kept = clamp01(state.targets[REGION_OF_STEP[step]].frameIds.length / REGION_MIN_FRAMES);
  return clamp01(STEP_POSE_SHARE * pose + (1 - STEP_POSE_SHARE) * kept);
}

/** Whether the head has come as far as this step asks. */
export function stepReached(state: ScanState, step: ScanStep): boolean {
  return state.steps[step].reach >= STEP_TARGETS[step].reach - 1e-9;
}

/**
 * Whether this step has been running long enough with nothing to show
 * that it should settle for a worse picture rather than none.
 *
 * It is false for the whole of a scan that goes as asked — the moment the
 * step's region has the frames it wants it is false again — and the only
 * thing it loosens is how steady the hand has to be. See `STABLE_MIN`.
 *
 * It reads the region's whole list rather than `captured`, because a
 * region with one frame and no second is exactly the state this exists
 * for: a shaky hand that got one picture and would otherwise sit out the
 * rest of the step waiting for a steadiness that is not coming, and hand
 * over a region the measurement engine can never put an error bar on.
 */
export function stepRelaxed(state: ScanState, at: number, step: ScanStep = state.step): boolean {
  if (state.targets[REGION_OF_STEP[step]].frameIds.length >= REGION_MIN_FRAMES) return false;
  // Held the pose a moment with nothing to show for it: the picture in
  // front of the lens right now is the one this step went for, and a
  // steadier one can still replace it while the step runs.
  const arrived = state.steps[step].reachedAt;
  if (arrived !== null && at - arrived >= STEP_ARRIVED_GRACE_MS) return true;
  if (state.stepStartedAt === null) return false;
  return at - state.stepStartedAt >= STEP_RELAX_SHARE * STEP_TIMEOUT_MS[step];
}

/**
 * Whether this step should ask for more turn: the shallow turn, caught
 * while there is still time to do something about it.
 *
 * Everything it reads is already in the step: the best the head has come
 * (`reach`, monotonic), when that last improved (`gainedAt`), and how
 * long the step has been running. Five things have to hold together, and
 * the wording of each matters more than the number in it:
 *
 * 1. THE STEP ASKS FOR A TURN AT ALL. `front` never nudges — see
 *    `TURN_FURTHER_CUE`.
 * 2. THE TURN IS SHORT. The head has not come as far as the step hands
 *    over at. A step that has arrived is finished with, not nagged.
 * 3. THE TURN STARTED. There is a real movement behind the plateau —
 *    `gainedAt` is set and the head is at least `NUDGE_STARTED_SHARE` of
 *    the way to the hand-over. Somebody who has not moved at all has not
 *    stopped short of anything, and "keep turning" would be the phone
 *    describing a turn that never happened. It is the condition that
 *    keeps the other three from collapsing into a plain timer.
 * 4. IT HAS STOPPED. The best reach has not improved by `NUDGE_GAIN_REACH`
 *    for `NUDGE_PLATEAU_MS`. A turn still in progress is left alone,
 *    which is the whole difference between a nudge and a nag.
 * 5. THE STEP HAS GIVEN THEM A MOMENT, AND THE ASK IS A BEAT. Past
 *    `NUDGE_AFTER_SHARE` of the step's own time — the title and the arrow
 *    get the opening to themselves — and for `NUDGE_SAY_MS` after that,
 *    not for the rest of the step. The window is measured from the later
 *    of the two, so the ask is the same length whichever condition was
 *    the last to come true.
 *
 * It says nothing about whether the region has a frame. A step holding a
 * shallow temple is exactly the case the owner named — a poor frame kept
 * rather than a fuller turn asked for — so having one is no reason to
 * stay quiet.
 *
 * Nothing downstream may gate on this. It picks a sentence; that is all.
 */
export function turnFurtherWanted(state: ScanState, at: number, step: ScanStep = state.step): boolean {
  if (TURN_FURTHER_CUE[step] === null) return false;
  const held = state.steps[step];
  if (held.done) return false;
  if (stepReached(state, step)) return false;
  if (state.stepStartedAt === null) return false;
  // A plateau is only a plateau if something came before it: the head has
  // to have actually got somewhere, and the wait is timed from there.
  if (held.gainedAt === null) return false;
  if (held.reach < NUDGE_STARTED_SHARE * STEP_TARGETS[step].reach) return false;
  const ready = Math.max(
    held.gainedAt + NUDGE_PLATEAU_MS,
    state.stepStartedAt + NUDGE_AFTER_SHARE * STEP_TIMEOUT_MS[step],
  );
  return at >= ready && at < ready + NUDGE_SAY_MS;
}

/** How steady a head has to be right now for a frame to be asked for. */
export function steadyEnough(state: ScanState, stability: number, at: number): boolean {
  return stability >= (stepRelaxed(state, at) ? STABLE_RELAXED : STABLE_MIN);
}

/**
 * Whether a step has everything it went for: the pose reached,
 * `REGION_MIN_FRAMES` held for its region, and the settle beat spent —
 * unless they are already as good as the scan asks for, in which case
 * there is nothing to wait for and the step hands over at once.
 *
 * The frame COUNT is the part build 20 added. A step that handed over on
 * its first good picture left the `down` step with a single frame, and
 * the crown is only in shot on that step, so the crown was the one
 * measurement region with no error bar and the one `compareScans`
 * refused (see the header for the measured figures; the other five
 * regions were already repeated). It costs about `FRAME_GAP_MS` a step —
 * the second frame arrives while the first settle beat is still running
 * — and the timeouts are unchanged.
 *
 * The beat is measured from the LATER of arriving and holding a frame,
 * which matters now that a step hands over well short of the angle it
 * aims at: the first frame of a turn often lands long before the turn
 * finishes, and a beat measured from it would already be spent at the
 * moment of arrival, so the step would hand over on the shallow picture
 * and the fuller turn would never be photographed.
 *
 * `step` is an argument, like `stepReached`'s, rather than read off the
 * state: two neighbouring predicates that disagree about where the step
 * comes from is how a caller ends up with an answer about a step it did
 * not ask about.
 */
export function stepSatisfied(state: ScanState, at: number, step: ScanStep = state.step): boolean {
  if (!stepReached(state, step)) return false;
  const region = state.targets[REGION_OF_STEP[step]];
  if (region.frameIds.length < REGION_MIN_FRAMES) return false;
  if (region.weakest >= GOOD_QUALITY) return true;
  const held = state.steps[step];
  const since = Math.max(held.reachedAt ?? at, held.firstFrameAt ?? at);
  return at - since >= STEP_SETTLE_MS;
}

/** Whether a step has run out of its own time and must hand over regardless. */
export function stepExpired(state: ScanState, at: number): boolean {
  if (state.stepStartedAt === null) return false;
  return at - state.stepStartedAt >= STEP_TIMEOUT_MS[state.step];
}

/**
 * Whether a frame of this quality would be worth taking for a region.
 *
 * Three rules, in order, and the first is the one that changed in build
 * 20:
 *
 * 1. UNTIL THE REGION HAS `REGION_MIN_FRAMES`, IT WANTS ONE, whatever it
 *    would score. A second frame is not a nicer picture — it is what
 *    lets a measurement region that is only in shot on ONE step (the
 *    crown) have an error bar at all, and without one `compareScans`
 *    refuses that region for the life of the journal. Quality decides
 *    which frames are KEPT, never whether the measurement gets to exist.
 * 2. A THIRD IS ASKED FOR ONLY WHILE THE REGION IS SHORT OF GOOD. Two
 *    good pictures are enough; three shutters for a region already well
 *    photographed is a file on somebody's phone for nothing.
 * 3. A FULL REGION WANTS ONLY A BETTER PICTURE THAN ITS POOREST, by
 *    `REPLACE_MARGIN` — the same bargain as before, now measured against
 *    the weakest of the list rather than the only one in it.
 *
 * In-flight requests count towards the list, so a region cannot ask for
 * five frames while its first two are still in the air.
 */
export function targetWants(state: ScanState, target: ScanTarget, quality: number): boolean {
  const flight = state.pending.reduce((n, p) => (p.target === target ? n + 1 : n), 0);
  if (flight >= PENDING_PER_TARGET) return false;
  const held = state.targets[target];
  const counted = held.frameIds.length + flight;
  if (counted < REGION_MIN_FRAMES) return true;
  if (held.weakest >= GOOD_QUALITY) return false;
  if (counted < FRAMES_PER_REGION) return true;
  return quality >= held.weakest + REPLACE_MARGIN;
}

/**
 * Whether two frames of one region stand for two different moments.
 *
 * Far enough apart in time, or far enough apart in pose: either makes
 * them two readings that can honestly disagree. Closer than both and
 * they are one instant photographed twice — see `FRAME_GAP_MS` for why
 * that is worse than having only one.
 *
 * An unreadable pose is treated as the same moment rather than a new
 * one: the safe side of this test is the one that keeps a false spread
 * out of the measurement.
 */
export function distinctMoment(
  a: Pick<ScanFrame, 'requestedAt' | 'yaw' | 'pitch'>,
  b: Pick<ScanFrame, 'requestedAt' | 'yaw' | 'pitch'>,
): boolean {
  if (Math.abs(a.requestedAt - b.requestedAt) >= FRAME_GAP_MS) return true;
  const moved = Math.hypot(a.yaw - b.yaw, a.pitch - b.pitch);
  return Number.isFinite(moved) && moved >= FRAME_TURN_DEG;
}

/**
 * Whether asking for a frame right now would be asking for a moment the
 * region already has — kept, or still in the air.
 *
 * Checked before the request rather than after the image lands, so the
 * camera is not asked for a photograph the curation would only delete.
 * The pending requests are included because two shutters fired half a
 * beat apart at a motionless head are the same instant twice, however
 * the files happen to land.
 */
export function newMoment(
  state: ScanState,
  target: ScanTarget,
  pose: Pick<ScanFrame, 'requestedAt' | 'yaw' | 'pitch'>,
): boolean {
  for (const frame of state.frames) {
    if (frame.target === target && !distinctMoment(frame, pose)) return false;
  }
  for (const request of state.pending) {
    if (request.target !== target) continue;
    const held = { requestedAt: request.at, yaw: request.yaw, pitch: request.pitch };
    if (!distinctMoment(held, pose)) return false;
  }
  return true;
}

/* ----------------------------- framing ------------------------------- */

/**
 * What can be said about where the head is in the picture.
 *
 * There is no size in it, and no "framed". A head is either readable or
 * it is not, and it is either on its way out of the picture or it is
 * not; neither of those ever stops the scan, and nothing here is
 * allowed to become a gate again.
 */
export type Framing = {
  readable: boolean;
  /** Far enough from the middle to be leaving the picture. */
  offFrame: boolean;
};

export function readable(face: FaceReading): boolean {
  return (
    Number.isFinite(face.yaw) &&
    Number.isFinite(face.pitch) &&
    Number.isFinite(face.roll) &&
    Number.isFinite(face.stability) &&
    Number.isFinite(face.size) &&
    Number.isFinite(face.bounds.x) &&
    Number.isFinite(face.bounds.y) &&
    Number.isFinite(face.bounds.width) &&
    Number.isFinite(face.bounds.height)
  );
}

export function framingOf(face: FaceReading): Framing {
  if (!readable(face)) return { readable: false, offFrame: false };
  const cx = face.bounds.x + face.bounds.width / 2;
  const cy = face.bounds.y + face.bounds.height / 2;
  const offFrame =
    Math.abs(cx - 0.5) > OFF_FRAME_TOLERANCE || Math.abs(cy - 0.5) > OFF_FRAME_TOLERANCE;
  return { readable: true, offFrame };
}

export function litEnough(lighting: number | null): boolean {
  return lighting === null || !Number.isFinite(lighting) || lighting >= LIGHT_MIN;
}

/** Within `FRONT_LOCK_DEG` of square on, in both yaw and pitch. */
export function squareOn(face: Pick<FaceReading, 'yaw' | 'pitch'>): boolean {
  return Math.abs(face.yaw) <= FRONT_LOCK_DEG && Math.abs(face.pitch) <= FRONT_LOCK_DEG;
}

/** The ring region a bin's frame counts towards, for `poseFit`; `up` counts towards none. */
function neededFor(region: ScanRegion): number {
  switch (region) {
    case 'front':
      return REGION_NEEDED.front;
    case 'right':
    case 'rightUp':
    case 'rightDown':
      return REGION_NEEDED.right;
    case 'left':
    case 'leftUp':
    case 'leftDown':
      return REGION_NEEDED.left;
    case 'chin':
      return REGION_NEEDED.chin;
    default:
      return 1;
  }
}

/**
 * 0–1: how far into its bin the head has turned.
 *
 * A ring bin begins at `FRONT_DEVIATION`, where a frame is still a
 * near-frontal picture with a side label; it is fully turned where its
 * region counts as seen (`REGION_NEEDED`, so a side at about 22° of yaw
 * and the chin at about 12° of nod). The front bin is the reverse: 1
 * square on, 0 at its edge. `frameQuality` scales by this so the first
 * frame into a bin never counts as good, and the fuller turn replaces
 * it — the frame the report calls the right side is the right side.
 */
export function poseFit(direction: HeadDirection): number {
  if (direction.magnitude < FRONT_DEVIATION) {
    return clamp01(1 - direction.magnitude / FRONT_DEVIATION);
  }
  const need = neededFor(regionOfBin(binOf(direction)));
  const full = FRONT_DEVIATION + (1 - FRONT_DEVIATION) * need;
  return clamp01((direction.magnitude - FRONT_DEVIATION) / (full - FRONT_DEVIATION));
}

/** How much of a frame's quality survives at a region's edge; the rest is earned by the turn. */
export const POSE_FLOOR = 0.4;

/**
 * 0–1: how good a frame taken right now would be.
 *
 * Steadiness, light and how much of the picture the head fills decide
 * how good a photograph it is; the pose decides how well it stands for
 * the region it is being taken for. Size and light are read here and
 * only here — they say which of two frames to keep, and they have no
 * say at all in whether the scan may start or go on.
 *
 * With no `target` the pose term falls back to the ring bin the head is
 * in, which is what the ring's own frames are scored against.
 */
export function frameQuality(
  face: FaceReading,
  lighting: number | null,
  target: ScanTarget | null = null,
): number {
  const light = lighting === null || !Number.isFinite(lighting) ? LIGHT_UNKNOWN : clamp01(lighting);
  const halfRange = Math.max(SIZE_IDEAL - SIZE_MIN, SIZE_MAX - SIZE_IDEAL);
  const size = clamp01(1 - Math.abs(face.size - SIZE_IDEAL) / halfRange);
  const base = clamp01(0.45 * clamp01(face.stability) + 0.3 * light + 0.25 * size);
  const fit = target === null ? poseFit(headDirection(face)) : targetFit(face, target);
  const pose = POSE_FLOOR + (1 - POSE_FLOOR) * fit;
  return clamp01(base * pose);
}

/* ---------------------------- the reducer ---------------------------- */

export function reduce(state: ScanState, action: ScanAction): ScanReduction {
  switch (action.type) {
    case 'continue':
      if (state.scanner !== 'instructions') return { state, events: [] };
      return move(state, state.permission === 'granted' ? 'ready' : 'permission');

    case 'permission': {
      const permission = action.granted ? 'granted' : 'denied';
      if (state.scanner !== 'permission') return { state: { ...state, permission }, events: [] };
      if (action.granted) return move({ ...state, permission, error: null }, 'ready');
      return move({ ...state, permission, error: 'cameraDenied' }, 'error');
    }

    case 'start': {
      if (state.scanner !== 'ready') return { state, events: [] };
      // Tracking begins here, on the press, wherever the head happens to
      // be. The front lock earned on the ready screen carries over so
      // `faceLocked` is not fired twice.
      const fresh = resetScan(state);
      const regions = regionScores(fresh.sectors, state.frontLocked);
      return move(
        {
          ...fresh,
          status: 'capturing',
          step: 'front',
          stepIndex: 0,
          stepStartedAt: action.at,
          stage: 'sweep',
          // The step's own title and instruction carry the choreography
          // now, so there is nothing to correct at the moment of the press.
          cue: null,
          frontLocked: state.frontLocked,
          milestones: state.milestones.slice(),
          regions,
          startedAt: action.at,
          lastGainAt: action.at,
        },
        'scanning',
        state.cue === null ? [] : [{ type: 'cue', cue: null }],
      );
    }

    case 'tick':
      if (state.scanner === 'ready') return tickReady(state, action);
      if (state.scanner === 'scanning') return tickScanning(state, action);
      return { state, events: [] };

    case 'captured': {
      if (state.abandoned.includes(action.requestId)) {
        return {
          state: { ...state, abandoned: state.abandoned.filter((id) => id !== action.requestId) },
          events: [{ type: 'discard', images: [action.image], reason: 'late' }],
        };
      }
      return landFrame(state, action.requestId, action.image, action.mesh, action.at);
    }

    case 'captureFailed': {
      if (state.abandoned.includes(action.requestId)) {
        return {
          state: { ...state, abandoned: state.abandoned.filter((id) => id !== action.requestId) },
          events: [],
        };
      }
      if (!state.pending.some((p) => p.id === action.requestId)) return { state, events: [] };
      const next = { ...state, pending: state.pending.filter((p) => p.id !== action.requestId) };
      return settle(next, action.at);
    }

    case 'process':
      if (state.scanner !== 'complete') return { state, events: [] };
      return move(state, 'processing');

    case 'processed':
      if (state.scanner !== 'processing') return { state, events: [] };
      return move(state, 'report');

    case 'fail':
      if (state.scanner === 'error') return { state, events: [] };
      // The frames stay for the error screen; retry or cancel lets go of them.
      return move({ ...abandonPending(state), error: action.reason }, 'error');

    case 'retry': {
      if (state.scanner !== 'error') return { state, events: [] };
      const cleared = { ...resetScan(abandonPending(state)), error: null };
      return move(
        cleared,
        state.permission === 'granted' ? 'ready' : 'permission',
        discardAll(state),
      );
    }

    case 'cancel': {
      const fresh: ScanState = {
        ...createScanState(),
        permission: state.permission,
        abandoned: abandonPending(state).abandoned,
      };
      if (state.scanner === 'instructions') return { state: fresh, events: [] };
      return move(fresh, 'instructions', discardAll(state));
    }

    default:
      return { state, events: [] };
  }
}

function move(state: ScanState, to: ScannerState, extra: ScanEvent[] = []): ScanReduction {
  const from = state.scanner;
  if (from === to) return { state, events: extra };
  return { state: { ...state, scanner: to }, events: [{ type: 'state', from, to }, ...extra] };
}

/**
 * Everything the ring and the shutter learned, back to zero. Permission,
 * the screen, and the ids of requests still owed by the camera are kept.
 */
function resetScan(state: ScanState): ScanState {
  const fresh = createScanState();
  return {
    ...fresh,
    scanner: state.scanner,
    permission: state.permission,
    error: state.error,
    status: state.status,
    cue: state.cue,
    lastTickAt: state.lastTickAt,
    abandoned: state.abandoned,
  };
}

/** Stop waiting for in-flight requests; a late answer will be discarded. */
function abandonPending(state: ScanState): ScanState {
  if (state.pending.length === 0) return state;
  return { ...state, pending: [], abandoned: [...state.abandoned, ...state.pending.map((p) => p.id)] };
}

/**
 * The discard for letting go of every kept frame, or nothing when there
 * are none — or when the frames are no longer the engine's to let go of:
 * from the report on, they belong to the journal.
 */
function discardAll(state: ScanState): ScanEvent[] {
  if (state.scanner === 'report' || state.frames.length === 0) return [];
  return [{ type: 'discard', images: state.frames, reason: 'abandoned' }];
}

/* --------------------------- before start ---------------------------- */

/**
 * Before Start.
 *
 * One rule: a head that can be read at all is a head the scan can work
 * with, so Start arms. Distance, angle, stillness and light have no vote
 * — every one of them was a reason build 17 refused to begin. What is
 * left is a head leaving the picture, which is worth saying, and a dark
 * room, which is worth mentioning; neither holds the button down.
 */
function tickReady(state: ScanState, action: Extract<ScanAction, { type: 'tick' }>): ScanReduction {
  const { at, face, lighting } = action;
  let status: ScanState['status'] = 'detecting';
  let cue: ScanCue | null = 'faceCamera';
  let frontLocked = state.frontLocked;
  const milestones = state.milestones.slice();
  const events: ScanEvent[] = [];

  if (face !== null) {
    const framing = framingOf(face);
    if (framing.readable) {
      status = 'ready';
      cue = framing.offFrame ? 'faceCamera' : litEnough(lighting) ? null : 'brighter';
      // A head held square and still is worth one buzz — the scan knows
      // where the front is before it starts. It gates nothing.
      if (!frontLocked && face.stability >= STABLE_MIN && squareOn(face)) {
        frontLocked = true;
        pushMilestone({ ...state, milestones }, events, 'faceLocked');
      }
    }
  }

  if (cue !== state.cue) events.push({ type: 'cue', cue });
  return {
    state: {
      ...state,
      status,
      cue,
      frontLocked,
      milestones,
      lastTickAt: at,
      lastFaceAt: face === null ? state.lastFaceAt : at,
      lastReading: face === null ? state.lastReading : { yaw: face.yaw, pitch: face.pitch, at },
    },
    events,
  };
}

/* ----------------------------- scanning ------------------------------ */

/**
 * The ring region a frame is labelled with.
 *
 * The region a frame stands for, never the bin the head happened to be
 * in when the shutter fired. This label is not decoration: the screen
 * turns it into the journal's angle, so a hairline taken with the phone
 * below eye level — a chin-down bin, over on the left of the ring —
 * used to be filed in the record as a left temple, and the report drew
 * its temple crop from a picture of somebody's forehead.
 */
const REGION_OF_TARGET: Record<ScanTarget, ScanRegion> = {
  hairline: 'front',
  leftTemple: 'left',
  rightTemple: 'right',
  crown: 'chin',
};

/** The milestone each region fires when its frame is in. */
const MILESTONE_OF_TARGET: Record<ScanTarget, ScanMilestone> = {
  hairline: 'hairlineDone',
  leftTemple: 'leftTempleDone',
  rightTemple: 'rightTempleDone',
  crown: 'crownDone',
};

/**
 * The choreography, moved on as far as it will go this tick.
 *
 * A step closes when it has what it went for (`stepSatisfied`) or when
 * its own time is up (`stepExpired`) — and then the next one starts from
 * this instant, so a step that closes early gives its spare seconds to
 * the steps after it rather than to the clock. More than one may close
 * on a single tick: somebody who has already turned past the target when
 * the frame lands walks through two steps at once, which is exactly what
 * a continuous motion should do.
 *
 * The last step does not hand over to anything; it marks itself done and
 * `finishIfDone` reads that.
 */
function advanceSteps(state: ScanState, at: number, events: ScanEvent[]): ScanState {
  let next = state;
  // At most one pass per step: `stepSatisfied` reads the state it is
  // given, so the loop cannot run away.
  for (let guard = 0; guard < SCAN_STEPS.length; guard += 1) {
    const step = next.step;
    if (next.steps[step].done) break;
    if (!stepSatisfied(next, at, step) && !stepExpired(next, at)) break;
    const steps = { ...next.steps, [step]: { ...next.steps[step], done: true } };
    const index = next.stepIndex + 1;
    const to = SCAN_STEPS[index];
    if (to === undefined) {
      next = { ...next, steps };
      break;
    }
    events.push({ type: 'step', from: step, to, index });
    next = {
      ...next,
      steps,
      step: to,
      stepIndex: index,
      stepStartedAt: at,
      stage: stageOfStep(to),
      // A fresh step may ask for its first frame straight away.
      lastRequestAt: null,
      hold: null,
    };
  }
  return next;
}

/** Whether every step has closed, however it closed. */
export function stepsDone(state: ScanState): boolean {
  return SCAN_STEPS.every((step) => state.steps[step].done);
}

/**
 * Recomputes the journey figure from the four regions, never letting it
 * fall, and announces the quarter marks as they pass.
 */
function withProgress(state: ScanState, events: ScanEvent[]): ScanState {
  const completion = Math.max(state.completion, journeyProgress(state.targets));
  if (completion <= state.completion + 1e-12) return state;
  const next = { ...state, completion };
  for (const [mark, name] of [
    [0.25, 'quarter'],
    [0.5, 'half'],
    [0.75, 'threeQuarters'],
  ] as const) {
    if (state.completion < mark && completion >= mark) pushMilestone(next, events, name);
  }
  return next;
}

/**
 * The last step closed: the scan is over, whatever else is still in
 * flight. The thirty-two second backstop ends it too, from wherever it
 * had got to.
 *
 * `reason` is the honest one of the two. A scan that walked all four
 * steps but never got a frame for one of them reads as `timeout`, and
 * `completion` stays under 1, so nothing downstream can call it full.
 */
function finishIfDone(state: ScanState, at: number, events: ScanEvent[]): ScanReduction | null {
  if (state.scanner !== 'scanning' || state.status !== 'capturing') return null;
  const elapsed = state.startedAt === null ? 0 : at - state.startedAt;
  const walked = stepsDone(state);
  if (!walked && elapsed < FORCED_FINISH_MS) return null;
  const reason = isSufficient(state.targets) ? 'coverage' : 'timeout';
  const completing: ScanState = {
    ...state,
    status: 'completing',
    completedAt: at,
    completeReason: reason,
    cue: null,
    hold: null,
  };
  events.push({ type: 'scanComplete', reason });
  return settle(completing, at);
}

function tickScanning(state: ScanState, action: Extract<ScanAction, { type: 'tick' }>): ScanReduction {
  const { at, face, lighting } = action;
  const events: ScanEvent[] = [];

  if (state.status === 'completing') {
    return settle({ ...state, lastTickAt: at }, at);
  }

  let next: ScanState = { ...state, lastTickAt: at, milestones: state.milestones.slice() };

  /* Lost and found. */
  if (face === null) {
    const since = next.lastFaceAt ?? next.startedAt ?? at;
    if (!next.lost && at - since >= LOST_MS) {
      next = { ...next, lost: true, hold: null };
      events.push({ type: 'lost' });
    }
  } else if (next.lost) {
    next = { ...next, lost: false };
    events.push({ type: 'found' });
  }

  const framing = face === null ? null : framingOf(face);

  /* Speed. */
  let tooFast = false;
  if (face !== null && framing?.readable && next.lastReading) {
    const dt = at - next.lastReading.at;
    if (dt >= 16) {
      const moved = Math.hypot(face.yaw - next.lastReading.yaw, face.pitch - next.lastReading.pitch);
      tooFast = (moved / dt) * 1000 > TOO_FAST_DEG_PER_S;
    }
  }
  if (tooFast) {
    next = { ...next, slowDownUntil: at + SLOW_DOWN_HOLD_MS };
    if (next.lastTooFastAt === null || at - next.lastTooFastAt >= TOO_FAST_EVENT_GAP_MS) {
      next = { ...next, lastTooFastAt: at };
      events.push({ type: 'tooFast' });
    }
  }

  /*
    A reading is usable if it can be read and the head is not being
    whipped about. Distance, light and centring are not conditions —
    they never were the person's fault, and they are not the scan's
    business.
  */
  const usable = face !== null && framing !== null && framing.readable && !tooFast;
  if (face !== null && framing?.readable) {
    next = { ...next, lastFaceAt: at, lastReading: { yaw: face.yaw, pitch: face.pitch, at } };
  }

  /*
    The ring. One journey across the whole scan: the sectors only ever
    rise, the last step does not clear them, and because the chin is down
    by then the turn lands in the lower half of the ring and fills the arc
    the upright steps could not reach.
  */
  let direction: HeadDirection | null = null;
  if (usable && face !== null) {
    direction = headDirection(face);
    // The dial walks the journey; the bin below still reads the pose.
    const walk = ringDirection(face, next.stage);
    const gained = walk === null ? EMPTY_FILL : fillFor(walk);
    let sectors = next.sectors;
    let changed = false;
    for (let i = 0; i < RING_SECTORS; i += 1) {
      const g = gained[i] ?? 0;
      if (g > (sectors[i] ?? 0) + 1e-6) {
        if (!changed) {
          sectors = sectors.slice();
          changed = true;
        }
        sectors[i] = g;
      }
    }
    let frontLocked = next.frontLocked;
    if (!frontLocked && face.stability >= STABLE_MIN && squareOn(face)) {
      frontLocked = true;
      pushMilestone(next, events, 'faceLocked');
    }
    if (changed || frontLocked !== next.frontLocked) {
      next = { ...next, sectors, frontLocked, regions: regionScores(sectors, frontLocked) };
    }

    // How near the head has come to each wanted region. Monotonic, so
    // turning back through the middle costs nothing.
    let targets = next.targets;
    let moved = false;
    for (const region of REQUIRED_REGIONS) {
      const held = targets[region];
      const reach = targetReach(face, region);
      if (reach > held.reach + 1e-6) {
        if (!moved) {
          targets = { ...targets };
          moved = true;
        }
        targets[region] = { ...held, reach };
      }
    }
    if (moved) {
      const before = next.completion;
      next = withProgress({ ...next, targets }, events);
      // A stall clears only when the journey actually gains: a head that
      // wanders without coming nearer to anything is still stalled.
      if (next.completion > before + 1e-12) next = { ...next, lastGainAt: at, stalled: false };
    }

    // How far into the CURRENT step the head has come. Monotonic inside
    // the step, so the bar and the arrow never flinch backwards.
    const reach = stepReach(next.step, face);
    const held = next.steps[next.step];
    if (reach > held.reach + 1e-6) {
      // The instant the target is met is the anchor for the settle beat,
      // so the frame taken as the turn completes can replace the one
      // taken on the way to it.
      const arrived = reach >= STEP_TARGETS[next.step].reach - 1e-9;
      const reachedAt = held.reachedAt === null && arrived ? at : held.reachedAt;
      // And a gain worth calling a movement is the anchor for the nudge:
      // further than the head last actually got to, not further than the
      // frame before. Measured frame to frame, a slow turn creeps by
      // thousandths and would read as a head that had stopped.
      // `gained` rather than `moved`: the loop above has a `moved` of its
      // own and the two are different things — that one is "some region
      // came nearer", this one is "the head itself actually got further".
      const gained = reach >= held.gainedReach + NUDGE_GAIN_REACH;
      const gainedAt = gained ? at : held.gainedAt;
      const gainedReach = gained ? reach : held.gainedReach;
      next = {
        ...next,
        steps: {
          ...next.steps,
          [next.step]: { ...held, reach, reachedAt, gainedAt, gainedReach },
        },
      };
    }
  }

  /* The choreography, which a step that runs long moves on by itself. */
  next = advanceSteps(next, at, events);

  /*
    Capture. The step says which region is wanted — there is no shutter
    and nothing else is ever asked for — and a frame is raised when the
    pose is near that step's target and the head is steady enough.

    "Enough" is `steadyEnough`, which gives way for a step that has held
    its pose with nothing to show (see `STABLE_MIN`). While it has not
    given way, the wobble is worth a line — `holdWanted` becomes the
    hold-still cue — and once it has, there is nothing to correct and the
    picture is simply taken, low quality and all.
  */
  let holdWanted = false;
  const target =
    usable && face !== null && !next.steps[next.step].done && stepWantsFrame(next.step, face)
      ? REGION_OF_STEP[next.step]
      : null;
  if (usable && face !== null && direction !== null && target !== null) {
    const bin = binOf(direction);
    const quality = frameQuality(face, lighting, target);
    const wants = targetWants(next, target, quality);
    const steady = steadyEnough(next, face.stability, at);
    // Not a picture of a moment this region already holds: see `newMoment`.
    const fresh = newMoment(next, target, { requestedAt: at, yaw: face.yaw, pitch: face.pitch });
    if (wants && fresh && !steady) {
      holdWanted = true;
      if (next.hold === null || next.hold.bin !== bin) next = { ...next, hold: { bin, since: at } };
    } else {
      next = { ...next, hold: null };
    }
    const throttled = next.lastRequestAt !== null && at - next.lastRequestAt < CAPTURE_INTERVAL_MS;
    if (wants && fresh && !throttled && steady && next.pending.length < MAX_PENDING) {
      const request: CaptureRequest = {
        id: `c${next.requestCount + 1}`,
        bin,
        region: REGION_OF_TARGET[target],
        target,
        sector: bin === 0 ? null : sectorOf(direction.angle),
        yaw: face.yaw,
        pitch: face.pitch,
        quality,
        at,
      };
      next = {
        ...next,
        pending: [...next.pending, request],
        lastRequestAt: at,
        requestCount: next.requestCount + 1,
      };
      events.push({ type: 'capture', request });
    }
  } else if (next.hold !== null) {
    next = { ...next, hold: null };
  }

  /* Stall. */
  const readingNow = framing?.readable ?? false;
  if (readingNow && !next.stalled && next.lastGainAt !== null && at - next.lastGainAt >= STALL_MS) {
    next = { ...next, stalled: true };
    events.push({ type: 'stall' });
  }

  /* Cue: only ever a correction, and null when there is nothing to correct. */
  const cue = scanningCue(next, face, framing, holdWanted, at, lighting);
  if (cue !== next.cue) {
    next = { ...next, cue };
    events.push({ type: 'cue', cue });
  }

  /* Completion. */
  const finished = finishIfDone(next, at, events);
  if (finished !== null) return { state: finished.state, events: [...events, ...finished.events] };

  return { state: next, events };
}

function pushMilestone(state: ScanState, events: ScanEvent[], milestone: ScanMilestone): void {
  if (state.milestones.includes(milestone)) return;
  state.milestones.push(milestone);
  events.push({ type: 'milestone', milestone });
}

/**
 * The correction to show, or null when there is nothing to correct.
 *
 * What to DO is the step's own title and instruction, held at the top of
 * the screen for as long as the step runs; this line sits under it and is
 * empty most of the way through a good scan. That is the whole change
 * from the two-beat build: the choreography is no longer taught one cue
 * at a time in a place that also has to say "hold still".
 *
 * The one line here that does touch the choreography is the nudge, and it
 * only ever says MORE of what the title already said — see
 * `turnFurtherWanted`, which is where the judgement is made. It asks; it
 * decides nothing.
 *
 * Nothing in here asks anybody to move closer or further away, and
 * nothing in here is a verdict. Lighting comes last of the five because
 * it is the one condition that can hold for a whole scan: a dark frame is
 * still a frame, `frameQuality` scores it low and a better-lit pass
 * replaces it, so it is worth a mention and never worth interrupting a
 * turn for.
 */
function scanningCue(
  state: ScanState,
  face: FaceReading | null,
  framing: Framing | null,
  holdWanted: boolean,
  at: number,
  lighting: number | null,
): ScanCue | null {
  if (state.lost) return 'lost';
  if (face === null || framing === null) return state.cue;
  if (!framing.readable) return 'faceCamera';
  if (framing.offFrame) return 'faceCamera';
  if (state.slowDownUntil > at) return 'tooFast';
  /*
    The shallow turn, above "hold still" and "find a brighter spot" on
    purpose — and only for a beat. The turn is the only one of the three
    that can actually finish the step: a steadier hand and a brighter room
    both improve the picture of a temple that is still half turned away,
    and neither brings the temple round. "Hold still" is reached only
    while a frame is genuinely wanted here — `holdWanted` is false once
    `targetWants` declines, and once this instant is one the region
    already holds — so what this outranks is a request that is still
    open, for `NUDGE_SAY_MS` and no longer.

    It is NOT true that the step has always relaxed by the time this
    fires. `NUDGE_AFTER_SHARE` is `STEP_RELAX_SHARE`, which settles the
    case of a step still chasing its frames, but `stepRelaxed` is false
    at its first line once the region has its two — and the whole
    point of the nudge is that it says nothing about that. See
    `NUDGE_AFTER_SHARE` for the band where the two part company.
  */
  if (turnFurtherWanted(state, at)) return TURN_FURTHER_CUE[state.step];
  if (holdWanted && state.hold !== null && at - state.hold.since >= HOLD_HINT_MS) return 'holdStill';
  if (!litEnough(lighting)) return 'brighter';
  return null;
}

/* ----------------------------- curation ------------------------------ */

/**
 * What the scan has of each region, read back off the frames it is
 * actually holding.
 *
 * Derived rather than remembered, so a region cannot be marked captured
 * by a picture that was later replaced or outscored: what the
 * report will show is what the state says it has.
 */
function recredit(state: ScanState, at: number, events: ScanEvent[]): ScanState {
  let targets = state.targets;
  let changed = false;
  for (const region of REQUIRED_REGIONS) {
    const kept = regionFrames(state, region);
    const held = targets[region];
    const captured = kept.length > 0;
    const quality = kept[0]?.quality ?? 0;
    const weakest = kept[kept.length - 1]?.quality ?? 0;
    const frameIds = kept.map((f) => f.id);
    if (
      held.captured === captured &&
      held.quality === quality &&
      held.weakest === weakest &&
      held.frameIds.length === frameIds.length &&
      held.frameIds.every((id, i) => id === frameIds[i])
    ) {
      continue;
    }
    if (!changed) {
      targets = { ...targets };
      changed = true;
    }
    targets[region] = { captured, quality, weakest, frameIds, reach: captured ? 1 : held.reach };
  }
  if (!changed) return state;
  let next: ScanState = { ...state, targets };
  for (const region of REQUIRED_REGIONS) {
    if (next.targets[region].captured) pushMilestone(next, events, MILESTONE_OF_TARGET[region]);
  }
  next = withProgress(next, events);
  return advanceSteps(next, at, events);
}

/** Which step asks for a region: the reverse of `REGION_OF_STEP`. */
export const STEP_OF_REGION: Record<ScanTarget, ScanStep> = {
  hairline: 'front',
  leftTemple: 'right',
  rightTemple: 'left',
  crown: 'down',
};

/**
 * Records a landed image against the step that asked for it.
 *
 * `frames` counts every image the step caused, kept or not, because that
 * is how many shutters it cost. `firstFrameAt` starts the settle beat and
 * so only moves for an image the scan is actually holding: an image that
 * lost to a better one cannot start a wait for something better.
 */
function creditStep(state: ScanState, target: ScanTarget, at: number, kept: boolean): ScanState {
  const step = STEP_OF_REGION[target];
  const held = state.steps[step];
  const firstFrameAt = kept && held.firstFrameAt === null ? at : held.firstFrameAt;
  return {
    ...state,
    steps: { ...state.steps, [step]: { ...held, frames: held.frames + 1, firstFrameAt } },
  };
}

function landFrame(
  state: ScanState,
  requestId: string,
  image: CapturedImage,
  mesh: FrameMesh | undefined,
  at: number,
): ScanReduction {
  const request = state.pending.find((p) => p.id === requestId);
  if (!request) return { state, events: [] };
  const pending = state.pending.filter((p) => p.id !== requestId);
  const frame: ScanFrame = {
    ...image,
    id: request.id,
    bin: request.bin,
    region: request.region,
    target: request.target,
    sector: request.sector,
    yaw: request.yaw,
    pitch: request.pitch,
    quality: request.quality,
    // The instant the pose was read, which is what tells two frames of
    // one region apart; `capturedAt` is a camera round trip later.
    requestedAt: request.at,
    capturedAt: at,
    // The mesh belongs to its own frame: a replacement brings its own,
    // and the frame it replaces takes the old one away with it.
    ...(mesh !== undefined ? { mesh } : {}),
  };
  const events: ScanEvent[] = [];
  const discard = (images: CapturedImage[], reason: DiscardReason): void => {
    if (images.length > 0) events.push({ type: 'discard', images, reason });
  };
  /*
    A frame competes only with the frames for its own region, and within
    that region only with the ones it could be mistaken for.

    Two rules, and they are different questions. IS THIS A MOMENT THE
    REGION ALREADY HAS? Then only the better picture of it is kept:
    holding both would hand the measurement engine two readings that
    agree by construction and a spread of zero. IS THE REGION FULL? Then
    the new frame has to beat the poorest one there.

    A frame competing across regions was the build-18 bug: a bin is not a
    region, the hairline of anybody holding the phone below eye level
    sits in the same bin as every crown frame, so each crown in turn lost
    to it and was discarded and the scan ran to the timeout with the one
    picture the owner most wanted missing. The requirements are keyed by
    region, so the store is too.
  */
  const kept = state.frames.filter((f) => f.target === frame.target);
  const twin = kept.find((f) => !distinctMoment(f, frame)) ?? null;
  const full = kept.length >= FRAMES_PER_REGION;
  const loser =
    twin ?? (full ? kept.reduce((a, b) => (b.quality < a.quality ? b : a)) : null);
  let frames: ScanFrame[];
  if (loser !== null) {
    if (loser.quality >= frame.quality) {
      discard([frame], 'outscored');
      const settled = settle(creditStep({ ...state, pending }, frame.target, at, false), at);
      return { state: settled.state, events: [...events, ...settled.events] };
    }
    frames = state.frames.map((f) => (f.id === loser.id ? frame : f));
    discard([loser], 'replaced');
  } else {
    frames = [...state.frames, frame];
  }
  let next: ScanState = creditStep(
    { ...state, pending, frames, milestones: state.milestones.slice() },
    frame.target,
    at,
    true,
  );
  events.push({ type: 'frame', frame, replaced: loser !== null });
  pushMilestone(next, events, 'firstFrame');
  // The frame set has changed, so what the scan has of each region has
  // changed with it — and this may be the one that ends the scan.
  next = recredit(next, at, events);
  const finished = finishIfDone(next, at, events);
  if (finished !== null) return { state: finished.state, events: [...events, ...finished.events] };
  const settled = settle(next, at);
  next = settled.state;
  return { state: next, events: [...events, ...settled.events] };
}

/* ---------------------------- completion ----------------------------- */

/** From `completing`, go to `complete` once in-flight frames have landed or the wait is up. */
function settle(state: ScanState, at: number): ScanReduction {
  if (state.scanner !== 'scanning' || state.status !== 'completing') return { state, events: [] };
  const waited = state.completedAt === null ? Infinity : at - state.completedAt;
  if (state.pending.length > 0 && waited < SETTLE_MS) return { state, events: [] };
  // Anything still out is no longer waited for; a late answer is discarded.
  const settled = abandonPending(state);
  if (settled.frames.length === 0) {
    return move({ ...settled, status: 'complete', error: 'noFrames' }, 'error');
  }
  return move({ ...settled, status: 'complete', cue: null }, 'complete');
}

/* ----------------------------- selectors ----------------------------- */

/**
 * The kept frames in the order the scan asked for them: hairline, left
 * temple, right temple, crown, and within each region the order they
 * were taken in. That is the order the report reads them in and the
 * order the processing screen flies them home in, and it no longer
 * depends on which ring bin a head happened to be in.
 *
 * Every kept frame is here, repeats included — eight to twelve of them
 * on a driven scan. The processing screen orbits this list, so what the
 * person watches being read is what was actually read.
 */
export function orderedFrames(state: ScanState): ScanFrame[] {
  const rank = (frame: ScanFrame): number => REQUIRED_REGIONS.indexOf(frame.target);
  return state.frames.slice().sort((a, b) => rank(a) - rank(b) || a.requestedAt - b.requestedAt);
}

/**
 * Everything one region is holding, best first, ties to the earlier
 * frame so the order is stable while a scan runs.
 *
 * This is the order `TargetProgress.frameIds` is kept in, and it is the
 * one place the ranking is written: best first means `frameIds[0]` is
 * the picture the report leads with, and the last is the one a better
 * frame would push out.
 */
export function regionFrames(state: ScanState, target: ScanTarget): ScanFrame[] {
  return state.frames
    .filter((f) => f.target === target)
    .sort((a, b) => b.quality - a.quality || a.requestedAt - b.requestedAt);
}

/**
 * The frame to show large: the front hairline, which is the one picture
 * of somebody that looks like them. Failing that — a scan that timed out
 * before it got one — the best of what there is.
 */
export function primaryFrame(state: ScanState): ScanFrame | null {
  const hairline = regionFrames(state, 'hairline')[0];
  if (hairline) return hairline;
  let best: ScanFrame | null = null;
  for (const f of state.frames) if (best === null || f.quality > best.quality) best = f;
  return best;
}

/**
 * Whether the Start button should be live: on the ready screen, with a
 * head being followed. That is the whole condition.
 *
 * It used to want square-on, a size window, stillness and light all at
 * once, and on a real face those four flickered against each other and
 * the owner could not press Start at all. Any one of them coming back
 * here is the same bug again.
 */
export function canStart(state: ScanState): boolean {
  return state.scanner === 'ready' && state.status === 'ready';
}

/**
 * The best frame of each region: the four pictures the report leads
 * with, in the order the person took them.
 *
 * One per region, as it has always been — a region's repeats are behind
 * it in `orderedFrames` and in `TargetProgress.frameIds`, and they are
 * for the measurement rather than for the four hero images. A region
 * with nothing is simply absent, which is how a short scan says so.
 */
export function requiredFrames(state: ScanState): ScanFrame[] {
  const out: ScanFrame[] = [];
  for (const region of REQUIRED_REGIONS) {
    const id = state.targets[region].frameIds[0];
    const frame = id === undefined ? undefined : state.frames.find((f) => f.id === id);
    if (frame) out.push(frame);
  }
  return out;
}

/** Milliseconds since the scan began, or 0. */
export function elapsedMs(state: ScanState, now: number): number {
  return state.startedAt === null ? 0 : Math.max(0, now - state.startedAt);
}

/* -------------------------- the mesh on the still ---------------------- */

/*
  Three coordinate spaces meet when the wireframe is held on a still.

  The tracker reports the face in *preview points*: the live view, which
  shows the camera frame aspect-filled — scaled to cover the screen and
  cropped at the sides (or, on a wide screen, top and bottom). The still
  the shutter writes is the *whole camera frame*, uncropped. And the
  processing screen draws that still inside a *box* of its own — a card,
  a disc, a thumbnail — aspect-filled again.

  So a point walks: preview fraction → camera-frame fraction (undoing the
  preview's cover crop) → box point (applying the box's cover crop). Both
  crops are the same rule, `coverFit`, applied in opposite directions.
  Mirroring never enters it: the preview, the detector's points and the
  still are all mirrored the same way (see scanner-camera.tsx).
*/

/**
 * How `content` is drawn to cover `box`: scaled uniformly by `scale` so
 * that it fills the box in both directions, then centred, so `x`/`y` is
 * where the content's origin lands — at or beyond the box's edge on the
 * axis that overflows.
 */
export type CoverFit = { scale: number; x: number; y: number };

export function coverFit(content: Size, box: Size): CoverFit {
  if (!(content.width > 0) || !(content.height > 0) || !(box.width > 0) || !(box.height > 0)) {
    return { scale: 1, x: 0, y: 0 };
  }
  const scale = Math.max(box.width / content.width, box.height / content.height);
  return {
    scale,
    x: (box.width - content.width * scale) / 2,
    y: (box.height - content.height * scale) / 2,
  };
}

/**
 * The tracked face as the live mesh had it, frozen as fractions of the
 * preview view for the frame about to be taken. Null when the preview
 * has no size yet: a fraction of nothing is not a place. The head's
 * angles ride along when the tracker had a finite reading, so the cap
 * drawn on the still can turn as the live one did.
 *
 * `fit` is the hair fit the live cap was wearing at this shutter, from
 * the mesh's own handle. It rides along for the same reason the angles
 * do: the still should show the cap the camera drew, fringe and all,
 * not a dome rebuilt from the standing allowance. Left out on a build
 * with no segmenter, which is exactly what it was before this existed.
 */
export function snapshotMesh(face: TrackedFace, view: ViewSize, fit?: CapFit): FrameMesh | null {
  if (!(view.width > 0) || !(view.height > 0)) return null;
  const contours: Contours = {};
  for (const name of CONTOUR_NAMES) {
    const points = face.contours[name];
    if (!points || points.length === 0) continue;
    contours[name] = points.map((p) => ({ x: p.x / view.width, y: p.y / view.height }));
  }
  const pose = meshPose(face);
  return {
    bounds: {
      x: (face.cx - face.width / 2) / view.width,
      y: (face.cy - face.height / 2) / view.height,
      width: face.width / view.width,
      height: face.height / view.height,
    },
    contours,
    viewAspect: view.width / view.height,
    ...(pose === null ? {} : { pose }),
    ...(fit === undefined ? {} : { fit }),
  };
}

/** The tracked head's angles, or null when any of them is not a number. */
function meshPose(face: Pick<TrackedFace, 'yaw' | 'pitch' | 'roll'>): MeshPose | null {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch) || !Number.isFinite(face.roll)) {
    return null;
  }
  return { yaw: face.yaw, pitch: face.pitch, roll: face.roll };
}

/**
 * Lays a frame's mesh over its still as drawn in `box`: the still, of
 * size `still`, is assumed to be aspect-filled into the box the way
 * `contentFit="cover"` draws it. The result is in the box's own points,
 * ready for the static mesh.
 */
export function meshInBox(mesh: FrameMesh, still: Size, box: Size): MeshFace {
  // A preview of the same aspect, at unit height, stands in for the real
  // one: only its proportions matter, and the fractions already carry them.
  const view: Size = { width: mesh.viewAspect, height: 1 };
  const onView = coverFit(still, view);
  const onBox = coverFit(still, box);
  const map = (fx: number, fy: number) => {
    // Preview fraction → preview point → camera-frame pixel → box point.
    const px = (fx * view.width - onView.x) / onView.scale;
    const py = (fy * view.height - onView.y) / onView.scale;
    return { x: px * onBox.scale + onBox.x, y: py * onBox.scale + onBox.y };
  };
  // Lengths scale without the offsets.
  const stretch = onBox.scale / onView.scale;
  const centre = map(mesh.bounds.x + mesh.bounds.width / 2, mesh.bounds.y + mesh.bounds.height / 2);
  const contours: Contours = {};
  for (const name of CONTOUR_NAMES) {
    const points = mesh.contours[name];
    if (!points || points.length === 0) continue;
    contours[name] = points.map((p) => map(p.x, p.y));
  }
  return {
    cx: centre.x,
    cy: centre.y,
    width: mesh.bounds.width * view.width * stretch,
    height: mesh.bounds.height * view.height * stretch,
    contours,
    // Angles are the head's, not the box's: they pass through untouched.
    ...(mesh.pose === undefined ? {} : { pose: mesh.pose }),
    // And so does the fit: it scales the cap about its own centre, in
    // multiples of itself, so there is nothing in it to map into a box.
    ...(mesh.fit === undefined ? {} : { fit: mesh.fit }),
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
