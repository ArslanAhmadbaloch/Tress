/**
 * The head cap: the geometry the hair scan draws over the head.
 *
 * Not a face mesh of its own. Two kinds of reading arrive, and the cap
 * is lofted from whichever the phone can give:
 *
 *   • a tracked 3D mesh — ARKit's face anchor on iOS, a cloud of points
 *     glued to the head at sixty frames a second, each carrying how much
 *     it faces the camera. The cap's scale comes off the cloud's own
 *     span, where the brow is on it off head proportions, which meridian
 *     the phone is looking at off the cloud's own facings, and the turn
 *     off the anchor's pose, which is measured rather than inferred.
 *     Nothing here guesses at a 2D oval.
 *
 *   • a face detector's oval, brow and pose — ML Kit on Android. The cap
 *     is extrapolated from those, the way it always was.
 *
 * Both produce the same vertices in the same order, so everything that
 * draws or tests the cap is written once and runs on both; the mesh path
 * is simply the sticky one. A phone that tracks in 3D and drops a frame
 * stays on the mesh road, driven by its box alone, rather than crossing
 * to the oval for a frame and back: the two roads put a head in
 * different places, and crossing between them is what an eye reads as
 * the mesh coming unstuck.
 *
 * WHICH road, and which KIND of cloud, are facts about the tracker and
 * are stated by it — never re-decided from the pose. Two kinds of cloud
 * put the crown, the ear line and the brow in very different places, so
 * anything that re-read the kind frame by frame would move the cap most
 * of a head's height in one frame somewhere mid-turn.
 *
 * ── The shape ─────────────────────────────────────────────────────────
 * A parametric ellipsoid in the head's own frame (right, down, towards
 * the camera): a little wider than the face, its equator at ear level,
 * its pole a head's rise above the brow. Meridians run from the pole
 * down to a base curve; the base is the brow line across the front and
 * drops to ear level at the sides, so the hairline, both temples and the
 * sides of the head are all inside it. Rows are latitude rings between
 * that base and the pole, packed towards the base where the hairline
 * band is, and columns bunch towards the sides where the temples are.
 * The meridians reach a hundred and seventeen degrees each way — past
 * the ears and round behind them — so the cap holds the whole head and
 * not just its front.
 *
 * ── The turn ──────────────────────────────────────────────────────────
 * Every point is a point in three dimensions, rotated by the tracked
 * pitch and yaw and projected flat: turn the head and the meridians on
 * the near side spread while the far side's compress and fold behind
 * the silhouette. Each point carries its *facing* — how much its
 * surface normal points at the camera — so the drawing can fade and
 * thin what faces away and brighten and widen what faces the phone,
 * which is what reads as depth. Roll needs no rotation: the frame is
 * read off the eye line (or the tracked roll), so a tilted head gets a
 * tilted cap.
 *
 * The cap is pinned to the head at the middle of the base row: that
 * vertex lands on the brow centre at every pose, so whatever the pose
 * does to the dome, the base stays on the eyebrows. On the oval road the
 * brow is the detected one. On the mesh road it is the cloud's own
 * centre — a whole-cloud reading — plus the brow's height above it,
 * which is head proportions; and across the picture, the meridian the
 * cloud's own facings say is turned towards the phone.
 *
 * ── The fill ──────────────────────────────────────────────────────────
 * Each vertex is mapped once to one of the scan ring's twenty-four
 * sectors, so the drawing can tint the cap from the engine's coverage
 * and the head fills in as the ring does. The mapping is the ring's own
 * dial, laid on the head: the sides of the cap belong to the sectors at
 * three and nine o'clock, the crown to the chin-down band at six, the
 * hairline to the top of the dial, and the front centre — the ring's
 * own centre — to the scan as a whole. It is a picture of where the
 * head has been pointed, the same one the ring gives.
 *
 * ── What it is not ────────────────────────────────────────────────────
 * Geometry, lofted from a face. It is where the scan looks, not a
 * reading of anything on the head. Everything here is pure and runs
 * under node; nothing knows what hair is.
 */

import {
  edgesAt,
  faceFrame,
  ovalFromBounds,
  type Contours,
  type FaceSource,
  type Point,
} from './tracking';

/* -------------------------------- tuning -------------------------------- */

export const CAP = {
  /** Latitude rings from the base up, the pole excluded. */
  rows: 10,
  /** Meridians, side to side. Odd, so one runs down the middle. */
  cols: 19,
  /** How far the pole sits above the face oval's top, in face heights. */
  rise: 0.45,
  /** Where the sides reach down to, in face heights below the oval's top: the ears. */
  earLevel: 0.5,
  /** The head's half-width over the oval's: temples and ears stand proud of the face. */
  widen: 1.15,
  /** Depth of the head over its half-width; only the turn sees it. */
  depth: 0.9,
  /** How far round the head the meridians go, in half-turns. 0.5 stops at the sides. */
  sweep: 0.65,
  /** Rows bunch towards the base by this power: the hairline band is the densest. */
  rowPacking: 1.3,
  /** Columns bunch towards the sides by this power: the temples are denser than the crown. */
  colPacking: 1.25,
  /** Where the brow line is assumed when no eyebrow contour arrives, in face heights from the top. */
  browGuess: 0.3,
  /** The hairline band: this many rings from the base, drawn denser and brighter. */
  bandRows: 5,
  /** The temple zones: this many columns in from each side, this many rows up. */
  templeCols: 3,
  templeRows: 7,
  /**
   * How much of the tracked yaw and pitch the cap turns by. The detector
   * reads a turned face's oval narrower and shifted, which already moves
   * the anchor the cap hangs from; turning the full angle on top of that
   * overshoots. Device-tune.
   */
  yawGain: 0.6,
  pitchGain: 0.8,
  /** Degrees beyond which the pose is clamped: a wild reading is not a wild cap. */
  yawMax: 45,
  pitchMax: 30,
} as const;

/**
 * A head, measured from the chin at 0 to the crown at 1.
 *
 * The canonical proportions a life drawing uses: the ear canal a little
 * under halfway up, the eyebrow line a little over. They are what the
 * cap's ellipsoid is hung on — its equator on the ear line, its pole on
 * the crown, its base on the brow — so every number below is a statement
 * about a head rather than about a drawing someone made of one.
 */
export const HEAD_LINES = { ear: 0.42, brow: 0.52, crown: 1 } as const;

/**
 * How much of that head each kind of cloud reaches, in the same measure.
 *
 *   shell   a face anchor's geometry: the face only, from the chin to
 *           the low forehead. It has no crown of its own, so the crown
 *           stands most of a span above the top of what it does have.
 *   closed  the drawn stand-in, and any tracker reporting a whole head.
 *
 * The upper edge of `shell` is the one figure here that is a guess about
 * somebody else's mesh rather than about a head, and it is the first
 * thing to measure on a device: read the anchor's own extent against the
 * head and set `high` to it.
 */
export const CLOUD_REACH = { shell: { low: 0.02, high: 0.68 }, closed: { low: 0, high: 1 } } as const;

/**
 * Where a cloud's own centre puts the head's landmarks, in cloud spans
 * measured from that centre, up negative:
 *
 *   apex  the crown — the top of the dome
 *   ear   the ear line — the dome's equator, where the sides reach down to
 *   brow  the eyebrow line — where the cap's base sits, and what it pins to
 *
 * Arithmetic on the two tables above, so a table cannot drift from the
 * proportions it claims.
 */
function landmarksOf(reach: { low: number; high: number }): {
  apex: number;
  ear: number;
  brow: number;
} {
  const span = reach.high - reach.low;
  const centre = (reach.low + reach.high) / 2;
  return {
    apex: (centre - HEAD_LINES.crown) / span,
    ear: (centre - HEAD_LINES.ear) / span,
    brow: (centre - HEAD_LINES.brow) / span,
  };
}

/**
 * The mesh path's own proportions.
 *
 * The landmarks are derived, above. What is left is the behaviour of a
 * projection rather than of a head — how far the cloud's centre stands
 * in front of the head's axis as a lowered head and as a turned head see
 * it, and how much of a turn's foreshortening comes back out of the
 * width and the height — and those four are *fitted*, against a model
 * head of exactly these proportions; the test holds what the fit bought
 * (the base within a twentieth of a head's height of the brow at every
 * pose the choreography reaches). They are the numbers to tune first on
 * a phone, because a real face anchor is not an ellipsoid.
 */
export const CAP_MESH = {
  /** The slice read for the anchor, either side of the brow, in projected cloud heights. */
  band: 0.09,
  /** Fewest usable points before the cloud is ignored and the oval drawn instead. */
  minPoints: 24,
  /** Floor under the foreshortening cosine: a profile is not stretched without limit. */
  minCos: 0.5,
  /** How far round the front the brow line runs, as a share of the head's half-width. */
  browSpan: 0.82,
  /**
   * A whole head. Its silhouette hardly narrows as it turns (a sphere
   * seen from any side is a circle) but it does shorten as the head goes
   * down, because the chin swings out of the picture. Its centre is on
   * the head's own axis, so lowering the head does not slide it.
   */
  head: { ...landmarksOf(CLOUD_REACH.closed), depth: 0, sway: 0, widen: 1.12, turnGain: 0, tiltGain: 0.2 },
  /**
   * A face shell. The far cheek leaves the picture as the head turns, so
   * its width is the reading a turn costs most; and its centre stands
   * out in front of the head's axis, so lowering the head slides it down
   * the picture as well as shortening it.
   */
  shell: { ...landmarksOf(CLOUD_REACH.shell), depth: 0.25, sway: 0.1, widen: 1.12, turnGain: 0.65, tiltGain: 0.5 },
  /**
   * The anchor's pose is measured rather than inferred, so the cap turns
   * by all of it, and further than the detector path dares.
   */
  yawGain: 1,
  pitchGain: 1,
  yawMax: 60,
  pitchMax: 45,
} as const;

/** Index, in vertices, of a cap cell. Row 0 is the base, the last row the ring under the pole. */
export function capIndex(row: number, col: number): number {
  // Called from the mesh's UI-thread path builders, so it must be a worklet.
  'worklet';
  return row * CAP.cols + col;
}

/** The pole: one vertex every meridian ends on. */
export const CAP_POLE = CAP.rows * CAP.cols;
export const CAP_POINTS = CAP_POLE + 1;
/** Each vertex is x, y, facing. */
export const CAP_STRIDE = 3;
export const CAP_LENGTH = CAP_POINTS * CAP_STRIDE;

/** A vertex mapped to no sector: the front centre, which fills with the scan as a whole. */
export const CAP_FRONT = -1;
const RING_SECTORS = 24;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Latitude of each row, 0 at the base to 1 at the pole; packed towards the base. */
export const CAP_ROW_T: readonly number[] = range(CAP.rows).map((i) =>
  Math.pow(i / CAP.rows, CAP.rowPacking),
);

/** Longitude of each column, in radians: 0 faces the camera, ±π/2 are the sides. */
export const CAP_COL_THETA: readonly number[] = range(CAP.cols).map((j) => {
  const u = CAP.cols > 1 ? -1 + (2 * j) / (CAP.cols - 1) : 0;
  const packed = 1 - Math.pow(1 - Math.abs(u), CAP.colPacking);
  return Math.sign(u) * packed * CAP.sweep * Math.PI;
});

/** The rings, base first, as vertex index lists. */
export const CAP_RINGS: readonly (readonly number[])[] = range(CAP.rows).map((r) =>
  range(CAP.cols).map((c) => capIndex(r, c)),
);

/** The meridians, base to pole, as vertex index lists. */
export const CAP_MERIDIANS: readonly (readonly number[])[] = range(CAP.cols).map((c) => [
  ...range(CAP.rows).map((r) => capIndex(r, c)),
  CAP_POLE,
]);

/** Whether a vertex is in the hairline band or a temple zone: the parts drawn brighter. */
export const CAP_BAND: readonly boolean[] = range(CAP_POINTS).map((v) => {
  if (v === CAP_POLE) return false;
  const row = Math.floor(v / CAP.cols);
  const col = v % CAP.cols;
  const temple = col < CAP.templeCols || col >= CAP.cols - CAP.templeCols;
  return row < CAP.bandRows || (temple && row < CAP.templeRows);
});

/**
 * The ring sector each vertex belongs to, or `CAP_FRONT`.
 *
 * A vertex's direction on the dial is the blend of where its meridian
 * points (the base row is the dial's rim: a temple at ninety degrees
 * is three o'clock) and the crown (six o'clock, the chin-down band).
 * Between the two the blend passes through nothing — the front centre
 * of the cap, which is the dial's own centre.
 */
export const CAP_SECTOR_OF: readonly number[] = range(CAP_POINTS).map((v) => {
  if (v === CAP_POLE) return 12;
  const row = Math.floor(v / CAP.cols);
  const col = v % CAP.cols;
  const theta = CAP_COL_THETA[col];
  const t = CAP_ROW_T[row];
  const ux = Math.sin(theta) * (1 - t);
  const uy = -Math.cos(theta) * (1 - t) + t;
  if (Math.hypot(ux, uy) < 0.4) return CAP_FRONT;
  const deg = (Math.atan2(ux, -uy) * 180) / Math.PI;
  const angle = ((deg % 360) + 360) % 360;
  return Math.min(RING_SECTORS - 1, Math.floor(angle / (360 / RING_SECTORS)));
});

/* ------------------------------- regions -------------------------------- */

/**
 * The four places the guided scan actually captures, as the cap can tell
 * them apart: the front, each side, and the top.
 *
 * Spelled the way the measurement engine spells them
 * (`ScanRegion` in measure/regions.ts) so nothing has to translate. The
 * cap simply has no opinion about the two regions there whose boundary
 * it cannot see — the mid scalp and the part line — because it is a
 * picture of where the scan has looked, not a reading of the head.
 *
 * Named by the side of the PICTURE, as the ring's sectors are:
 * `leftTemple` is the quarter of the cap on the LEFT of the screen — the
 * meridians at negative `CAP_COL_THETA` — and `rightTemple` the quarter
 * on the right. Nothing here claims which of the person's own temples
 * that is; the camera and the mirroring decide.
 *
 * ── WHICH STEP LIGHTS WHICH IS THE OPPOSITE OF THE OBVIOUS PAIRING ────
 * Turning right does NOT light the right of the screen, and a wiring
 * lane that assumes it does will light the quarter of the head that is
 * hidden at that moment.
 *
 * The geometry says so plainly. At the equator `facing` in `writeDome`
 * comes out as cos(theta + psi), so a POSITIVE yaw — the `right` step,
 * the nose swinging to the screen's right — is squarest to the camera at
 * theta = −psi: the NEGATIVE-theta meridians, which are `leftTemple`,
 * the screen's left. `REGION_OF_STEP` in engine.ts writes the same
 * pairing down from the person's side and argues it at length
 * (`right: 'leftTemple'`, `left: 'rightTemple'`), and `region-crops.ts`
 * cuts that temple from the same side of the still.
 *
 * So `REGION_OF_STEP` is the ONE place the two vocabularies meet:
 * anything wiring this cap's fill to the choreography reads the pairing
 * from there and never infers it from these two names. The test
 * 'regions: the temple a step lights is the one the camera can see'
 * holds the geometry and that table together, so this comment cannot
 * drift away from either.
 */
export type CapRegion = 'hairline' | 'leftTemple' | 'rightTemple' | 'crown';

/** The canonical order. A per-region array is indexed by this. */
export const CAP_REGIONS: readonly CapRegion[] = [
  'hairline',
  'leftTemple',
  'rightTemple',
  'crown',
];

const REGION_HAIRLINE = CAP_REGIONS.indexOf('hairline');
const REGION_LEFT = CAP_REGIONS.indexOf('leftTemple');
const REGION_RIGHT = CAP_REGIONS.indexOf('rightTemple');
const REGION_CROWN = CAP_REGIONS.indexOf('crown');

/** Where one region gives way to the next on the dome. */
export const CAP_REGION = {
  /** Above this latitude — 0 at the base, 1 at the pole — the cap is the crown. */
  crownT: 0.5,
  /** Further round the head than this, in radians from the front, a meridian is a temple. */
  templeTheta: Math.PI / 3,
} as const;

/**
 * The region each vertex belongs to, as an index into `CAP_REGIONS`.
 *
 * Every vertex has one — unlike the ring's sectors, which leave the
 * front centre unassigned — because the choreography's four steps cover
 * the whole of what the camera sees of a head.
 */
export const CAP_REGION_OF: readonly number[] = range(CAP_POINTS).map((v) => {
  if (v === CAP_POLE) return REGION_CROWN;
  const row = Math.floor(v / CAP.cols);
  const col = v % CAP.cols;
  if (CAP_ROW_T[row] >= CAP_REGION.crownT) return REGION_CROWN;
  const theta = CAP_COL_THETA[col];
  if (theta >= CAP_REGION.templeTheta) return REGION_RIGHT;
  if (theta <= -CAP_REGION.templeTheta) return REGION_LEFT;
  return REGION_HAIRLINE;
});

/**
 * The vertices worth lighting while the scan runs: the hairline band
 * just above the base, and the temple zones — on the meridians that
 * face the camera when the head is square on.
 */
export const CAP_SITES: readonly number[] = (() => {
  const sites = new Set<number>();
  for (let col = 0; col < CAP.cols; col += 1) {
    if (Math.abs(CAP_COL_THETA[col]) > Math.PI / 2) continue;
    sites.add(capIndex(1, col));
    sites.add(capIndex(2, col));
    const temple = col < CAP.templeCols || col >= CAP.cols - CAP.templeCols;
    if (!temple) continue;
    for (let row = 0; row < CAP.templeRows; row += 1) sites.add(capIndex(row, col));
  }
  return [...sites];
})();

/**
 * Every vertex the twinkles may visit: the whole cap but the pole, where
 * all nineteen meridians meet and a fleck would sit on a seam. Fixed
 * here so nothing walks the cap on the UI thread.
 */
export const CAP_VERTICES: readonly number[] = range(CAP_POLE);

/* -------------------------------- building ------------------------------- */

/**
 * A tracked 3D face mesh: the points of a face anchor, projected into
 * the view, with how much each one faces the camera.
 *
 * The points may be in view fractions or in view points — the cap reads
 * the cloud's own extent and maps it onto the face box, so it never has
 * to know which.
 */
export type CapMesh = {
  /** x then y, per point, in the module's fixed vertex order. */
  points: readonly number[];
  /** Per point: 1 towards the camera, 0 edge on, below 0 turned away. */
  facing: readonly number[];
  /**
   * Whether the cloud goes all the way round the head rather than being
   * the shell of a face. A face anchor's is not, and says nothing; a
   * tracker that reports a whole head must set this, or its cap will be
   * built on a face's landmarks.
   */
  closed?: boolean;
};

/** What the cap is built from: the tracked face, or a still's face with no pose. */
export type CapSource = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  contours: Contours;
  /** Degrees. Missing or NaN reads as square on. */
  yaw?: number;
  pitch?: number;
  /** Degrees of tilt, used to stand the tracked mesh upright. Missing reads as level. */
  roll?: number;
  /** The tracked 3D mesh, when the platform has one. */
  mesh?: CapMesh;
  /** Whether that mesh is real geometry worth lofting from. */
  hasMesh?: boolean;
  /**
   * Which tracker this reading came from. It is what decides the shape
   * of the cloud — a face anchor is always the shell of a face, the
   * drawn stand-in always a whole head — so the kind is never re-guessed
   * from the pose, and the cap cannot change shape mid-turn. Absent, a
   * cloud is taken for the shell of a face unless its mesh says it is
   * closed: nothing is inferred from the geometry, because every
   * statistic that separates the two moves with the pose, and a cap that
   * changes table mid-turn jumps most of a head's height.
   */
  source?: FaceSource;
};

type Frame = ReturnType<typeof faceFrame>;

function toLocal(frame: Frame, p: Point): Point {
  const x = p.x - frame.ox;
  const y = p.y - frame.oy;
  return { x: x * frame.rx + y * frame.ry, y: x * frame.dx + y * frame.dy };
}

function fromLocal(frame: Frame, x: number, y: number): Point {
  return {
    x: frame.ox + x * frame.rx + y * frame.dx,
    y: frame.oy + x * frame.ry + y * frame.dy,
  };
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

function smoothstep(t: number): number {
  const s = clamp(t, 0, 1);
  return s * s * (3 - 2 * s);
}

function degrees(value: number | undefined, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return clamp(value, -max, max);
}

function radians(value: number | undefined, max: number, gain: number): number {
  return (degrees(value, max) * gain * Math.PI) / 180;
}

/**
 * The dome one reading asks for: an ellipsoid in the head's own frame,
 * where its base sits, and how far it is turned. Both readings — the
 * tracked mesh and the detector's oval — end here, and one writer turns
 * it into vertices, so the two paths cannot drift apart.
 */
type Dome = {
  frame: Frame;
  /** Where the base row's middle vertex is pinned, in the frame's own axes. */
  anchorX: number;
  anchorY: number;
  /** Half-width, half-height and depth of the ellipsoid. */
  ax: number;
  ay: number;
  az: number;
  /** Latitude of the base across the front, and how far round the front it reaches. */
  phiBrow: number;
  thetaBrow: number;
  /**
   * The meridian the anchor is pinned on, head-fixed. Zero pins the
   * front centre — what a detector's brow reading means; minus the yaw
   * pins the meridian that faces the camera, which is what a cloud's
   * own facing-weighted band reports.
   */
  pinTheta: number;
  /** Radians of yaw and pitch actually applied. */
  psi: number;
  alpha: number;
};

/**
 * Writes one dome into `out`: `CAP_LENGTH` numbers — x, y, facing per
 * vertex — in the same points the face is in, every one of them finite.
 */
function writeDome(out: number[], dome: Dome): number[] {
  const { frame, ax, ay, az, phiBrow, thetaBrow, psi, alpha } = dome;
  const cosPsi = Math.cos(psi);
  const sinPsi = Math.sin(psi);
  const cosAlpha = Math.cos(alpha);
  const sinAlpha = Math.sin(alpha);

  const rotate = (x: number, y: number, z: number): [number, number, number] => {
    // Pitch about the side-to-side axis: chin down (negative) brings the crown forward.
    const y1 = y * cosAlpha - z * sinAlpha;
    const z1 = y * sinAlpha + z * cosAlpha;
    // Yaw about the vertical: positive points the nose to the screen's right.
    const x2 = x * cosPsi + z1 * sinPsi;
    const z2 = -x * sinPsi + z1 * cosPsi;
    return [x2, y1, z2];
  };

  const surface = (theta: number, phi: number): [number, number, number] => {
    const cosPhi = Math.cos(phi);
    return rotate(ax * cosPhi * Math.sin(theta), -ay * Math.sin(phi), az * cosPhi * Math.cos(theta));
  };

  const facing = (theta: number, phi: number): number => {
    const cosPhi = Math.cos(phi);
    const nx = (Math.sin(theta) * cosPhi) / ax;
    const ny = -Math.sin(phi) / ay;
    const nz = (Math.cos(theta) * cosPhi) / az;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 0)) return 0;
    const n = rotate(nx / len, ny / len, nz / len);
    return n[2];
  };

  // The anchor: the brow, on the meridian this reading measured it on.
  const anchor = surface(dome.pinTheta, phiBrow);

  const write = (index: number, sx: number, sy: number, f: number) => {
    const p = fromLocal(frame, dome.anchorX + (sx - anchor[0]), dome.anchorY + (sy - anchor[1]));
    const k = index * CAP_STRIDE;
    out[k] = Number.isFinite(p.x) ? p.x : frame.ox;
    out[k + 1] = Number.isFinite(p.y) ? p.y : frame.oy;
    out[k + 2] = Number.isFinite(f) ? f : 0;
  };

  const halfPi = Math.PI / 2;
  for (let col = 0; col < CAP.cols; col += 1) {
    const theta = CAP_COL_THETA[col];
    const turn = Math.abs(theta);
    const onBrow =
      turn <= thetaBrow ? 1 : turn >= halfPi ? 0 : smoothstep((halfPi - turn) / (halfPi - thetaBrow));
    const phi0 = phiBrow * onBrow;
    for (let row = 0; row < CAP.rows; row += 1) {
      const phi = phi0 + (halfPi - phi0) * CAP_ROW_T[row];
      const p = surface(theta, phi);
      write(capIndex(row, col), p[0], p[1], facing(theta, phi));
    }
  }
  const pole = surface(0, halfPi);
  write(CAP_POLE, pole[0], pole[1], facing(0, halfPi));

  return out;
}

/* ---------------------------- the tracked mesh --------------------------- */

/** Which kind of cloud arrived: a whole head, or the shell of a face. */
type CloudKind = {
  /** The crown, the ear line and the brow, in cloud spans from the cloud's centre. */
  readonly apex: number;
  readonly ear: number;
  readonly brow: number;
  /** How far the cloud's own centre stands in front of the head's axis, in spans. */
  readonly depth: number;
  /** The same standoff as a turn sees it: what slides the cloud's centre sideways. */
  readonly sway: number;
  /** The head's half-width over the cloud's. */
  readonly widen: number;
  /** How much of the turn's foreshortening comes back out of the width and the height. */
  readonly turnGain: number;
  readonly tiltGain: number;
};

/**
 * What the cap needs from a tracked cloud, in the output's own points.
 * The anchor is in the head's upright axes with its origin on the face
 * box's centre; the rest is the head's own size with the foreshortening
 * of its turn taken back out.
 */
type Cloud = {
  kind: CloudKind;
  /** Half the head's width and the cloud's full height, un-foreshortened. */
  halfWidth: number;
  span: number;
  /** The projected height, as measured: what the anchor's band is cut from. */
  rawHeight: number;
  /**
   * The face box's centre — the point the cap's frame hangs from — in
   * the head's upright axes and the output's units. Everything the
   * cloud measures is offset by this, because that is what the frame's
   * origin stands for.
   */
  centreX: number;
  centreY: number;
  /**
   * The middle of the cloud's own upright extent, in the same axes and
   * units. It is what the landmark table is written against: the brow
   * sits so many spans above *this*, not above the box's centre, which a
   * tilted head puts somewhere else entirely.
   */
  uprightY: number;
  /**
   * The scales that carry the cloud's units into the box's — one per
   * axis, because they are not the same number. A tracker may report its
   * points as fractions of a view that is twice as tall as it is wide
   * while reporting its box in that view's own points; averaging the two
   * ratios is then wrong on both axes at once.
   */
  sx: number;
  sy: number;
  /** The rotation of the head's upright axes. */
  cos: number;
  sin: number;
};

/**
 * Which kind of cloud this is, and what it is NOT allowed to depend on.
 *
 * It is a fact about the tracker, so the tracker states it: a face
 * anchor's geometry is the shell of a face at every pose it will ever
 * report, and the drawn stand-in is always a whole head. A cloud that is
 * a whole head from some other tracker says so on the mesh itself.
 *
 * Nothing about the pose enters into it, and that is the point. The two
 * tables put the crown, the ear line and the brow in very different
 * places; anything that re-decided between them frame by frame — a share
 * of points reported turned away, say, which climbs with yaw and with
 * pitch — would move the cap most of a head's height in a single frame
 * somewhere mid-turn, which on a phone is the mesh coming off the head.
 * The kinds of cloud cannot be told apart from the geometry reliably
 * enough to risk that, so this does not try.
 */
function kindOf(face: CapSource): CloudKind {
  if (face.source === 'sample') return CAP_MESH.head;
  if (face.mesh !== undefined && face.mesh.closed === true) return CAP_MESH.head;
  return CAP_MESH.shell;
}

/**
 * Reads a cloud's size, kind and placement in one pass.
 *
 * The cloud is mapped onto the face box rather than used raw, so the cap
 * comes out in the same points as everything else whether the tracker
 * reports view fractions or view points. Returns null — and the caller
 * falls back — when the reading is too thin or too broken to loft
 * anything from.
 */
function readCloud(face: CapSource): Cloud | null {
  const mesh = face.mesh;
  if (face.hasMesh !== true || mesh === undefined) return null;
  const pts = mesh.points;
  const facings = mesh.facing;
  const n = Math.min(Math.floor(pts.length / 2), facings.length);
  if (n < CAP_MESH.minPoints) return null;
  if (!Number.isFinite(face.cx + face.cy + face.width + face.height)) return null;
  if (!(face.width > 0) || !(face.height > 0)) return null;

  const rollDeg = face.roll !== undefined && Number.isFinite(face.roll) ? face.roll : 0;
  const cos = Math.cos((rollDeg * Math.PI) / 180);
  const sin = Math.sin((rollDeg * Math.PI) / 180);

  let count = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i += 1) {
    const x = pts[2 * i];
    const y = pts[2 * i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    count += 1;
  }
  if (count < CAP_MESH.minPoints) return null;

  // The cloud's box carries the face box, so the cap lands in the same
  // points as the rest of the reading whatever units the tracker used.
  // Both boxes are measured the same way round — square to the screen,
  // as a tracker reports its bounds — because a tilted head's upright
  // box and its screen box are different sizes, and dividing one by the
  // other would grow the cap with the tilt.
  //
  // ONE SCALE PER AXIS, and this is not fussiness. ARKit's points arrive
  // as fractions of the rendered view and its box arrives in the view's
  // own points, so across is divided by the view's width and down by its
  // height — two very different numbers on a phone. An averaged single
  // scale is then correct on neither axis: measured on a 430×932
  // preview it made the cap half again too wide and a quarter too short,
  // which is a squat dome sitting off the head. Where the tracker's units
  // are already square — preview points, the drawn stand-in — the two
  // come out equal and nothing changes.
  const boxWidth = maxX - minX;
  const boxHeight = maxY - minY;
  if (!(boxWidth > 0) || !(boxHeight > 0)) return null;
  const sx = face.width / boxWidth;
  const sy = face.height / boxHeight;
  if (!Number.isFinite(sx) || !(sx > 0) || !Number.isFinite(sy) || !(sy > 0)) return null;

  // The upright extent is measured on the SCALED cloud: scaling by two
  // different numbers and then turning is not the same as turning and
  // then scaling, and it is the scaled shape the cap is lofted from.
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i += 1) {
    const x = pts[2 * i];
    const y = pts[2 * i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const u = x * sx * cos + y * sy * sin;
    const v = -(x * sx) * sin + y * sy * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const rawWidth = maxU - minU;
  const rawHeight = maxV - minV;
  if (!(rawWidth > 0) || !(rawHeight > 0)) return null;

  const boxCx = (minX + maxX) * 0.5 * sx;
  const boxCy = (minY + maxY) * 0.5 * sy;

  const kind = kindOf(face);

  // A head has depth, so a turned one's cloud narrows far less than the
  // cosine of its angle: only part of the foreshortening comes back out.
  const spread = (value: number | undefined, max: number, gain: number) => {
    const c = Math.max(CAP_MESH.minCos, Math.abs(Math.cos((degrees(value, max) * Math.PI) / 180)));
    return Math.pow(c, gain);
  };

  return {
    kind,
    halfWidth: Math.max(1, rawWidth / 2 / spread(face.yaw, CAP_MESH.yawMax, kind.turnGain)),
    span: Math.max(1, rawHeight / spread(face.pitch, CAP_MESH.pitchMax, kind.tiltGain)),
    rawHeight,
    // The origin everything is measured from is the face box's centre,
    // which is the cloud's box square to the screen — so that is the
    // point carried into the upright axes, not the upright box's own
    // middle, which a tilted head puts somewhere else.
    centreX: boxCx * cos + boxCy * sin,
    centreY: -boxCx * sin + boxCy * cos,
    uprightY: (minV + maxV) * 0.5,
    sx,
    sy,
    cos,
    sin,
  };
}

/**
 * The dome a tracked cloud asks for: lofted off the cloud's own size,
 * turned by the anchor's own pose, and pinned to the brow.
 *
 * The pin is the brow point on the meridian that faces the camera. Which
 * meridian that is comes from the cloud itself — a band of its points
 * weighted by how squarely each faces the phone is centred on exactly
 * that meridian, whatever the head has been turned to, and pinning the
 * front centre instead would fight the measurement at every angle but
 * square on, which is what made the old cap swim.
 *
 * How high the pin sits does *not* come from the band. It is the cloud's
 * own centre — a whole-cloud reading, which no tracker's choice of which
 * points to send can shift — plus the brow's height above that centre,
 * which is head proportions and arithmetic. Reading the height off the
 * band as well would tie it to how the tracker happens to sample its
 * rows, and would step as points crossed the band's edge between frames.
 */
function meshDome(face: CapSource, cloud: Cloud): Dome | null {
  const { kind, span } = cloud;
  const frame: Frame = {
    ox: face.cx,
    oy: face.cy,
    rx: cloud.cos,
    ry: cloud.sin,
    dx: -cloud.sin,
    dy: cloud.cos,
  };

  const ax = cloud.halfWidth * kind.widen;
  const ay = Math.max(1, (kind.ear - kind.apex) * span);
  const az = ax * CAP.depth;
  const phiBrow = Math.asin(clamp((kind.ear - kind.brow) / (kind.ear - kind.apex), 0, 0.95));
  const thetaBrow = Math.asin(clamp(CAP_MESH.browSpan / Math.cos(phiBrow), 0.3, 0.95));
  const psi = radians(face.yaw, CAP_MESH.yawMax, CAP_MESH.yawGain);
  const alpha = radians(face.pitch, CAP_MESH.pitchMax, CAP_MESH.pitchGain);

  // Where the brow sits on the picture, measured from the cloud's own
  // centre: the pin's height less the cloud centre's, both turned by the
  // pose. A face shell's centre stands out in front of the head's axis,
  // so lowering the head slides it down the picture — which is why a
  // lowered head's brow is looked for lower down the cloud rather than
  // at the same fraction of it.
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  const cosPsi = Math.cos(psi);
  const sinPsi = Math.sin(psi);
  const cosPhi = Math.cos(phiBrow);
  const sinPhi = Math.sin(phiBrow);
  const pinY = -ay * sinPhi * cosA - az * cosPhi * cosPsi * sinA;
  const centreY = -kind.ear * span * cosA - kind.depth * span * sinA;
  const level = pinY - centreY;

  // Where the pin and the cloud's centre stand across the picture, from
  // the same rotation the vertices get: the anchor the geometry alone
  // asks for, and what stands in when there are no points to measure.
  const pinX = -ax * cosPhi * sinPsi * cosPsi + (-ay * sinPhi * sinA + az * cosPhi * cosPsi * cosA) * sinPsi;
  const centreX = (-kind.ear * span * sinA + kind.sway * span * cosA) * sinPsi;
  const across = bandAnchor(face, cloud, level);
  const anchor = {
    x: across === null ? pinX - centreX : across,
    y: level + cloud.uprightY - cloud.centreY,
  };
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null;

  return {
    frame,
    anchorX: anchor.x,
    anchorY: anchor.y,
    ax,
    ay,
    az,
    phiBrow,
    thetaBrow,
    pinTheta: -psi,
    psi,
    alpha,
  };
}

/**
 * Where the brow band sits across the picture: the cloud's own points at
 * the brow's height, weighted by how squarely each faces the camera, so
 * the reading is the meridian turned towards the phone rather than the
 * average of everything still in view. A tracker that reports no facings
 * at all falls back to the plain middle of the band. Null when the band
 * caught nothing — then the geometry's own pin stands in.
 */
function bandAnchor(face: CapSource, cloud: Cloud, level: number): number | null {
  const mesh = face.mesh;
  if (mesh === undefined) return null;
  const pts = mesh.points;
  const facings = mesh.facing;
  const n = Math.min(Math.floor(pts.length / 2), facings.length);
  const reach = CAP_MESH.band * cloud.rawHeight;
  const target = cloud.uprightY + level;

  let weight = 0;
  let wx = 0;
  let plain = 0;
  let px = 0;
  for (let i = 0; i < n; i += 1) {
    const x = pts[2 * i];
    const y = pts[2 * i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const u = x * cloud.sx * cloud.cos + y * cloud.sy * cloud.sin;
    const v = -(x * cloud.sx) * cloud.sin + y * cloud.sy * cloud.cos;
    // A soft edge, not a cutoff. A point at the band's rim counts for
    // nothing and arrives at nothing, so a head turning past a row of
    // the cloud does not hand the reading a step: with a hard edge the
    // mean jumps the moment a row crosses in, and a mesh that steps
    // sideways every few degrees is exactly what "not sticky" looks like.
    const off = (v - target) / reach;
    if (!(off > -1 && off < 1)) continue;
    const near = 1 - off * off;
    const kernel = near * near;
    plain += kernel;
    px += u * kernel;
    const f = facings[i];
    if (!Number.isFinite(f) || !(f > 0)) continue;
    // Squared, so the band's middle is the meridian squarest to the
    // camera rather than the average of everything still in view: the
    // far half of a turned head drags the plain mean off the head.
    const w = f * f * kernel;
    weight += w;
    wx += u * w;
  }
  if (!(plain > 0)) return null;
  const x = weight > 0 ? wx / weight : px / plain;
  if (!Number.isFinite(x)) return null;
  return x - cloud.centreX;
}

/**
 * The cloud a tracker's own box stands for when its points did not come.
 *
 * A face anchor drops frames: it reports the pose and clears the mesh
 * while it re-finds the face. Sent down the detector's road those frames
 * would build a cap from a fabricated oval and a guessed brow — a
 * different head, a fifth of a face box away — and the mesh would be
 * seen jumping there and back. So the box is read as the cloud's own
 * box instead: the same landmarks, the same turn, the same road, with
 * the anchor coming from the geometry rather than from the points. The
 * cap loses its stickiness for those frames and keeps its place.
 */
function boxCloud(face: CapSource, kind: CloudKind): Cloud | null {
  if (!Number.isFinite(face.cx + face.cy + face.width + face.height)) return null;
  if (!(face.width > 0) || !(face.height > 0)) return null;
  const rollDeg = face.roll !== undefined && Number.isFinite(face.roll) ? face.roll : 0;
  const spread = (value: number | undefined, max: number, gain: number) => {
    const c = Math.max(CAP_MESH.minCos, Math.abs(Math.cos((degrees(value, max) * Math.PI) / 180)));
    return Math.pow(c, gain);
  };

  // A box square to the screen around a tilted head is bigger than the
  // head's own upright box, and it is the upright one the landmarks are
  // written against. Undo the tilt: a box of w by h, turned, measures
  // w·cos + h·sin across and w·sin + h·cos down, which inverts as long
  // as the tilt is well short of a diagonal.
  const c = Math.abs(Math.cos((rollDeg * Math.PI) / 180));
  const sn = Math.abs(Math.sin((rollDeg * Math.PI) / 180));
  const det = c * c - sn * sn;
  const upright =
    det > 0.3
      ? {
          width: Math.max(1, (c * face.width - sn * face.height) / det),
          height: Math.max(1, (c * face.height - sn * face.width) / det),
        }
      : { width: face.width, height: face.height };

  return {
    kind,
    halfWidth: Math.max(1, upright.width / 2 / spread(face.yaw, CAP_MESH.yawMax, kind.turnGain)),
    span: Math.max(1, upright.height / spread(face.pitch, CAP_MESH.pitchMax, kind.tiltGain)),
    rawHeight: upright.height,
    centreX: 0,
    centreY: 0,
    uprightY: 0,
    sx: 1,
    sy: 1,
    cos: Math.cos((rollDeg * Math.PI) / 180),
    sin: Math.sin((rollDeg * Math.PI) / 180),
  };
}

/** Whether the detector gave an outline worth building an oval from. */
function hasOutline(face: CapSource): boolean {
  const oval = face.contours.FACE;
  if (oval !== undefined && oval.length >= 8) return true;
  const left = face.contours.LEFT_EYEBROW_TOP;
  const right = face.contours.RIGHT_EYEBROW_TOP;
  return (left !== undefined && left.length > 0) || (right !== undefined && right.length > 0);
}

/* --------------------------- the detector's oval ------------------------- */

/** The dome a face oval and a brow ask for. Null when the reading is unusable. */
function ovalDome(face: CapSource): Dome | null {
  const rawOval = face.contours.FACE;
  const drawn = rawOval === undefined || rawOval.length < 8;
  const oval = drawn ? ovalFromBounds(face.cx, face.cy, face.width, face.height) : rawOval;
  const read = faceFrame(oval, face.contours);
  // A drawn oval is a circle drawn level and has no tilt of its own, and
  // without eyes there is nothing else to read one from. A tracker that
  // reports its own roll is believed instead, so a tilted head does not
  // straighten up the moment the contours stop arriving.
  const eyes = face.contours.LEFT_EYE;
  const otherEye = face.contours.RIGHT_EYE;
  const sawEyes =
    eyes !== undefined && eyes.length > 0 && otherEye !== undefined && otherEye.length > 0;
  const rollDeg = face.roll !== undefined && Number.isFinite(face.roll) ? face.roll : 0;
  const rolled = drawn && !sawEyes && rollDeg !== 0;
  const rx = rolled ? Math.cos((rollDeg * Math.PI) / 180) : read.rx;
  const ry = rolled ? Math.sin((rollDeg * Math.PI) / 180) : read.ry;
  const frame: Frame = { ox: read.ox, oy: read.oy, rx, ry, dx: -ry, dy: rx };
  const local = oval.map((p) => toLocal(frame, p));

  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let leftmost = Number.POSITIVE_INFINITY;
  let rightmost = Number.NEGATIVE_INFINITY;
  for (const p of local) {
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
    if (p.x < leftmost) leftmost = p.x;
    if (p.x > rightmost) rightmost = p.x;
  }
  if (!Number.isFinite(top + bottom + leftmost + rightmost)) return null;
  const height = Math.max(1, bottom - top);
  const halfWidth = Math.max(1, (rightmost - leftmost) / 2);
  const fallback = {
    cx: (leftmost + rightmost) / 2,
    cy: (top + bottom) / 2,
    a: halfWidth,
    b: height / 2,
  };

  // The brow line: just above the eyebrows when they were seen. The same
  // rule the lattice used, so the cap's base is where the brow row was.
  let brow = top + CAP.browGuess * height;
  const brows = [
    ...(face.contours.LEFT_EYEBROW_TOP ?? []),
    ...(face.contours.RIGHT_EYEBROW_TOP ?? []),
  ];
  if (brows.length > 0) {
    let sum = 0;
    for (const p of brows) sum += toLocal(frame, p).y;
    brow = sum / brows.length - 0.05 * height;
  }
  brow = clamp(brow, top + 0.08 * height, top + 0.5 * height);
  const browEdges = edgesAt(local, brow, fallback);
  const browMid = (browEdges.left + browEdges.right) / 2;
  const browHw = Math.max(1, ((browEdges.right - browEdges.left) / 2) * 0.97);

  // The pose. A turned face is read narrower than it is; widen the head
  // back, within reason, so the cap does not shrink as the head turns.
  const seen = Math.max(0.8, Math.cos((degrees(face.yaw, CAP.yawMax) * Math.PI) / 180));

  // The ellipsoid, in the face's frame, centred on the ear line.
  const ax = (halfWidth * CAP.widen) / seen;
  const earY = top + CAP.earLevel * height;
  const apexY = top - CAP.rise * height;
  const ay = Math.max(1, earY - apexY);
  const az = ax * CAP.depth;

  // The base: the brow line across the front, to where it meets the
  // oval's edge, then down to ear level at the sides.
  const phiBrow = Math.asin(clamp((earY - brow) / ay, 0, 0.95));
  const thetaBrow = Math.asin(clamp(browHw / (ax * Math.cos(phiBrow)), 0.3, 0.95));

  return {
    frame,
    anchorX: browMid,
    anchorY: brow,
    ax,
    ay,
    az,
    phiBrow,
    thetaBrow,
    pinTheta: 0,
    psi: radians(face.yaw, CAP.yawMax, CAP.yawGain),
    alpha: radians(face.pitch, CAP.pitchMax, CAP.pitchGain),
  };
}

/**
 * What to build when no cloud arrived.
 *
 * A tracker that works in 3D but has nothing to give this frame — an
 * anchor between faces, a still taken from one — stays on the mesh road,
 * driven by its box alone, because the two roads do not put the head in
 * the same place and swapping between them frame to frame is what the
 * eye reads as the mesh coming unstuck. The detector's oval is for
 * readings that actually have an outline to build one from.
 */
function fallbackDome(face: CapSource): Dome | null {
  const tracksIn3D =
    face.source === 'arkit' || face.source === 'sample' || face.mesh !== undefined;
  if (tracksIn3D && !hasOutline(face)) {
    const cloud = boxCloud(face, kindOf(face));
    if (cloud !== null) {
      const dome = meshDome(face, cloud);
      if (dome !== null) return dome;
    }
  }
  return ovalDome(face);
}

/**
 * Builds the cap for one face: `CAP_LENGTH` numbers — x, y, facing per
 * vertex — in the same points the face is in, every one of them finite.
 *
 * A face carrying a tracked 3D mesh is lofted off that; anything else
 * falls back. Deterministic and allocation-light; called once per
 * tracker frame on the JS thread, and once per still.
 *
 * `fit` is how far the dome is stretched to reach the hair — see the
 * hair fit below. Left out, the cap carries `CAP_FIT_DEFAULT`, the
 * standing allowance, so a phone with no segmenter still draws a mesh
 * that clears a head of hair rather than one glued to the skull. Pass
 * `CAP_FIT_IDENTITY` for the bare geometry with no allowance at all.
 *
 * ── Units ─────────────────────────────────────────────────────────────
 * The cap comes out in whatever units `cx`, `cy`, `width` and `height`
 * are in, and nothing else. A face box in view *fractions* therefore
 * builds a cap in view fractions — a whole head inside a one-by-one
 * square — which is not what an SVG in view points can draw. A tracker
 * reporting fractions must be multiplied by the preview's size before it
 * gets here; the cloud's own points may stay in either, since they are
 * mapped onto the box.
 */
export function buildHeadCap(face: CapSource, fit?: CapFit): number[] {
  const out = new Array<number>(CAP_LENGTH).fill(0);
  const dome = domeOf(face);
  if (dome === null) return out;
  return writeDome(out, fitted(dome, fit === undefined ? CAP_FIT_DEFAULT : fit));
}

/** The dome one reading asks for, whichever road it comes down. */
function domeOf(face: CapSource): Dome | null {
  const cloud = readCloud(face);
  return (cloud === null ? null : meshDome(face, cloud)) ?? fallbackDome(face);
}

/* ------------------------------ the hair fit ----------------------------- */

/**
 * Sitting the cap ON THE HAIR.
 *
 * Everything above lofts a dome off a FACE. A face tracker sees a face:
 * it has nothing to say about the twelve centimetres of hair standing up
 * off the skull, so the dome is drawn to a bare head and a person with
 * any volume at all watches the mesh cut through their hair. That is the
 * standing complaint, and this is the answer to it.
 *
 * The segmenter (src/features/assessment/hair-segmenter.ts) knows where
 * the hair is. It is not cheap — six to sixteen milliseconds at 512²,
 * which is a fifth of a frame — so it does not run per frame. It runs a
 * few times a second, and what comes back is a *silhouette*: the outline
 * of what was called hair, in the same units as the face box. This fits
 * the dome to it.
 *
 * ── What a fit is ─────────────────────────────────────────────────────
 * Three dimensionless numbers, and deliberately only three:
 *
 *   lift   how much taller the dome has to be to reach the top of the
 *          hair, as a multiple of its own rise above the brow
 *   widen  the same for its half-width across the sides
 *   shift  how far the hair's middle stands off the cap's, as a share
 *          of that half-width — a side parting sweeps the volume over
 *
 * Dimensionless on purpose: the person leaning in doubles every length
 * in the picture and changes none of these, so a fit taken a second ago
 * is still the right fit now. And only three, because three is what a
 * silhouette honestly carries. Anything finer would be reading detail
 * out of an outline that is not in it.
 *
 * ── What a fit is NOT ─────────────────────────────────────────────────
 * Not a measurement, and it is never shown as one. It moves a wireframe
 * so the wireframe lands on the hair. Nothing here is displayed, nothing
 * is stored, nothing is compared across scans, and no number this
 * produces reaches a word of copy. The measurement engine reads the
 * pixels; this reads them only to know where to draw.
 *
 * ── Why it never jumps ────────────────────────────────────────────────
 * A fit arrives a few times a second and the cap is drawn sixty times a
 * second, so a fit applied the moment it lands would step the mesh
 * several times a second — which is exactly the thing this is trying to
 * cure. `blendCapFit` walks the drawn fit towards the newest one; the
 * mesh calls it every reading, and the cap grows into the hair over
 * about half a second instead of snapping to it.
 *
 * ── When there is no mask ─────────────────────────────────────────────
 * Every one of these is optional, everywhere. No Nitro, the Android
 * fallback, the simulator, a mask too broken to trace: `fitHairCap`
 * returns null and the cap is drawn to `CAP_FIT_DEFAULT` — the standing
 * allowance below, which is the bare dome plus a hand's breadth of hair.
 * The scan works either way; that is the point of keeping the fit a
 * separate three numbers rather than a different road through the
 * geometry.
 *
 * ── When the readings stop ────────────────────────────────────────────
 * A segmenter is a classifier looking at a moving head, and it will
 * refuse — a frame where the trace shatters, a head tipped past the top
 * gate, a face lost for an instant. A refusal must NOT be read as "there
 * is no hair": collapsing the fit on one bad frame deflates the cap onto
 * the skull and re-inflates it a third of a second later, which is the
 * popping this whole section exists to prevent. `nextCapFit` is the
 * rule: a refusal holds the fit the cap already has, and only a long run
 * of them — `CAP_FIT.hold` in a row, a couple of seconds — lets go back
 * to the standing allowance.
 */

/** The outline of what the segmenter called hair, in the face box's units. */
export type HairSilhouette = {
  /** x then y per point. Order does not matter; only the extent is read. */
  points: readonly number[];
};

/** How far the dome is stretched to reach the hair. All three dimensionless. */
export type CapFit = {
  /** The dome's rise above the brow, as a multiple of the bare head's. */
  lift: number;
  /** Its half-width, likewise. */
  widen: number;
  /** The hair's middle off the cap's, as a share of that half-width. */
  shift: number;
};

/** The bare head: the dome with no allowance for hair at all. */
export const CAP_FIT_IDENTITY: CapFit = { lift: 1, widen: 1, shift: 0 };

/**
 * The standing hair allowance: what the cap is drawn to when no mask has
 * said anything.
 *
 * Everything above this line lofts the dome off a FACE, and the tests
 * hold it to a bare model skull to within a twelfth. That is correct
 * geometry and it is exactly the complaint: a face tracker has nothing
 * to say about the hair standing off the skull, so on a phone with no
 * segmenter — which today is every phone, because nothing calls
 * `fitHairCap` yet — the mesh is drawn to the scalp and anybody with
 * volume watches it cut through their hair.
 *
 * So the dome the scan actually draws carries an allowance: a tenth
 * taller above the brow and a sixteenth wider. It is the same three
 * numbers a measured fit is, applied the same way, and a measured fit
 * simply replaces it — `fitHairCap` refines from whatever the cap is
 * already wearing, so the allowance is a starting guess and never an
 * addition to a real reading.
 *
 * ── What it is and is not ─────────────────────────────────────────────
 * It is a DRAWING default, of exactly the kind `CAP.rise` and
 * `CAP.widen` already are: a statement about where to put a wireframe so
 * it lands on a head of hair rather than on a skull. It is not a
 * measurement, it is never shown, and nothing reads it back — a shaved
 * head simply gets a mesh sitting a centimetre clear, which reads as a
 * loose wireframe and not as a claim.
 *
 * One constant, on purpose. Set it to `CAP_FIT_IDENTITY` and every cap
 * in the app is byte-identical to the bare dome again.
 */
export const CAP_FIT_DEFAULT: CapFit = { lift: 1.12, widen: 1.06, shift: 0 };

/**
 * The limits, and what the reading is made of.
 *
 * The clamps are not politeness. A silhouette can be nonsense — a dark
 * doorway behind the head, a hood, a hand — and an unclamped fit would
 * then throw the mesh off the person entirely. Inside these bounds the
 * worst a bad mask can do is a cap a third too big, which reads as a
 * loose mesh rather than as a broken one.
 */
export const CAP_FIT = {
  /** A shaved head to a big afro, near enough. */
  lift: { min: 0.85, max: 1.55 },
  widen: { min: 0.85, max: 1.35 },
  /** How far off centre the hair's middle may pull the cap. */
  shift: 0.16,
  /** Fewest silhouette points before the reading is ignored. */
  minPoints: 12,
  /**
   * Refinement passes. The fit is the ratio of two projections, and a
   * projection is not linear in the dome's axes once the head is
   * turned or lowered — so the first pass overshoots or undershoots at
   * a pose, and the second, measured against the already-fitted dome,
   * takes the rest out. Two is enough; a third moves nothing.
   */
  passes: 2,
  /** How near the middle the top is looked for, as a share of the cap's half-width. */
  topGate: 0.7,
  /** The band the widths are compared in, as shares of the cap's rise above the brow. */
  band: { lo: 0.15, hi: 0.85 },
  /**
   * Consecutive refusals before the cap lets go of the fit it is wearing
   * and eases back to the standing allowance. At the three or four
   * readings a second a segmenter can manage, eight is about two
   * seconds: long enough that a shattered frame, a head tipped past the
   * gate or a face lost for an instant costs nothing at all, short
   * enough that a hat coming off, or a segmenter that has genuinely
   * stopped working, does not leave a stretched cap on the head.
   */
  hold: 8,
  /**
   * How much a new reading has to differ before the cap re-aims at it.
   *
   * A classifier's answer jitters a percent or two between frames on a
   * head that has not moved, and each jitter is a shape the cap would
   * ease towards — a slow breathing that is worse than being slightly
   * wrong. Inside this, the newest reading is treated as the reading the
   * cap already has.
   */
  deadband: 0.02,
} as const;

function clampFit(fit: CapFit): CapFit {
  const lift = Number.isFinite(fit.lift) ? fit.lift : 1;
  const widen = Number.isFinite(fit.widen) ? fit.widen : 1;
  const shift = Number.isFinite(fit.shift) ? fit.shift : 0;
  return {
    lift: clamp(lift, CAP_FIT.lift.min, CAP_FIT.lift.max),
    widen: clamp(widen, CAP_FIT.widen.min, CAP_FIT.widen.max),
    shift: clamp(shift, -CAP_FIT.shift, CAP_FIT.shift),
  };
}

/**
 * The dome a fit asks for.
 *
 * The base is re-pinned to the brow inside `writeDome`, from this
 * dome's own axes, so stretching cannot walk the cap off the eyebrows:
 * whatever `lift` and `widen` do to the shape, the middle of the base
 * row still lands where the brow was, plus the deliberate `shift`.
 * The depth follows the width, because they are the same half-width
 * seen from two sides of the head.
 */
function fitted(dome: Dome, fit: CapFit): Dome {
  const { lift, widen, shift } = clampFit(fit);
  const ax = dome.ax * widen;
  return {
    ...dome,
    ax,
    az: dome.az * widen,
    ay: dome.ay * lift,
    anchorX: dome.anchorX + shift * ax,
  };
}

/** A silhouette's reach above the brow, and how wide it is in a band of that reach. */
type Shape = { halfWidth: number; mid: number };

/**
 * How far a silhouette rises above the brow, measured only near the
 * middle so that a curtain of hair down one side is not mistaken for
 * the top of the head.
 */
function riseOf(local: readonly number[], anchorX: number, anchorY: number, gate: number): number {
  let top = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < local.length; i += 2) {
    const x = local[i];
    const y = local[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(x - anchorX) > gate) continue;
    if (y < top) top = y;
  }
  const rise = anchorY - top;
  return Number.isFinite(rise) && rise > 0 ? rise : 0;
}

/**
 * How wide a silhouette is between two heights, and where its middle
 * sits. The heights are the CAP's, for both readings, so the two widths
 * are the same slice of the picture and their ratio means something.
 */
function spanOf(local: readonly number[], lo: number, hi: number): Shape | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (let i = 0; i + 1 < local.length; i += 2) {
    const x = local[i];
    const y = local[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (y < lo || y > hi) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    count += 1;
  }
  if (count < 2) return null;
  const halfWidth = (maxX - minX) / 2;
  if (!(halfWidth > 0)) return null;
  return { halfWidth, mid: (minX + maxX) / 2 };
}

/** A flat list of view points, in the head's own upright axes. */
function localPairs(points: readonly number[], frame: Frame): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const p = toLocal(frame, { x: points[i], y: points[i + 1] });
    out.push(p.x, p.y);
  }
  return out;
}

/** The drawn cap's vertices, in the same axes. Reads x and y, drops the facing. */
function capPairs(pts: readonly number[], frame: Frame): number[] {
  const out: number[] = [];
  for (let v = 0; v < CAP_POINTS; v += 1) {
    const k = v * CAP_STRIDE;
    const p = toLocal(frame, { x: pts[k], y: pts[k + 1] });
    out.push(p.x, p.y);
  }
  return out;
}

/**
 * The fit one hair silhouette asks for, or null when the reading gives
 * no honest answer — too few points, nothing above the brow, a
 * silhouette with no width. Null means "draw the bare dome", which is
 * what every phone without a segmenter draws anyway.
 *
 * Pure, allocation-modest and deterministic — and NOT as cheap as it
 * looks, which matters because the number decides how often it may be
 * called. Counted honestly, one call is:
 *
 *   • `domeOf(face)`, once. On the tracked road that is THREE walks of
 *     the whole point cloud — `readCloud`'s bounds pass, its upright
 *     extent pass, and `bandAnchor` — so on a face anchor of about
 *     1,200 points it is roughly 3,600 point transforms before any cap
 *     exists. On the detector road it is one walk of the oval instead,
 *     which is nothing.
 *   • then `CAP_FIT.passes` — two — refinement passes, each of which is
 *     one `writeDome` over the 191 vertices plus `capPairs`, `riseOf`
 *     and `spanOf` over the same 191 (four walks), and `localPairs`,
 *     `riseOf` and `spanOf` over the silhouette's own points (three
 *     walks of however many the trace carries).
 *
 * So: three walks of the cloud, two dome writes, eight walks of 191, and
 * six walks of the silhouette. Fine a few times a second on the JS
 * thread; NEVER per frame, and worth measuring on a device before it is
 * put anywhere near a 60 Hz tracker.
 *
 * `from` is the fit currently drawn: passing it starts the refinement
 * where the cap already is, so a steady head converges to a steady
 * answer instead of re-deriving it each time. Left out it starts from
 * the standing allowance, which is what the cap is wearing anyway.
 *
 * `face` must be the face the MASK belongs to, not the newest tracked
 * one. A silhouette comes back from an async pass over a frame that is
 * by then several frames old, and through this choreography the head is
 * turning for most of the scan: `widen` is read across the picture and
 * is precisely the number a few degrees of stale yaw corrupts. Fitting a
 * mask against a head that has since moved is a fit of the wrong shape.
 */
export function fitHairCap(face: CapSource, hair: HairSilhouette, from?: CapFit): CapFit | null {
  if (hair.points.length < CAP_FIT.minPoints * 2) return null;
  const dome = domeOf(face);
  if (dome === null) return null;

  let fit = from === undefined ? CAP_FIT_DEFAULT : clampFit(from);
  let answered = false;
  const scratch = new Array<number>(CAP_LENGTH).fill(0);

  for (let pass = 0; pass < CAP_FIT.passes; pass += 1) {
    const d = fitted(dome, fit);
    writeDome(scratch, d);
    const cap = capPairs(scratch, d.frame);
    const strands = localPairs(hair.points, d.frame);
    const gate = CAP_FIT.topGate * d.ax;

    const capRise = riseOf(cap, d.anchorX, d.anchorY, gate);
    const hairRise = riseOf(strands, d.anchorX, d.anchorY, gate);
    if (!(capRise > 0) || !(hairRise > 0)) break;

    // One band, the cap's, for both readings.
    const lo = d.anchorY - CAP_FIT.band.hi * capRise;
    const hi = d.anchorY - CAP_FIT.band.lo * capRise;
    const capSpan = spanOf(cap, lo, hi);
    const hairSpan = spanOf(strands, lo, hi);
    if (capSpan === null || hairSpan === null) break;
    if (!(d.ax > 0)) break;

    fit = clampFit({
      lift: fit.lift * (hairRise / capRise),
      widen: fit.widen * (hairSpan.halfWidth / capSpan.halfWidth),
      shift: fit.shift + (hairSpan.mid - capSpan.mid) / d.ax,
    });
    answered = true;
  }

  return answered ? fit : null;
}

/**
 * The drawn fit, walked towards the newest one.
 *
 * `t` is how much of the way to go this reading — the mesh derives it
 * from the time since the last one, so the cap grows into the hair over
 * about half a second whatever rate the tracker runs at. At 0 nothing
 * moves; at 1 the new fit is taken whole.
 */
export function blendCapFit(from: CapFit, to: CapFit, t: number): CapFit {
  const k = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  const a = clampFit(from);
  const b = clampFit(to);
  return {
    lift: a.lift + (b.lift - a.lift) * k,
    widen: a.widen + (b.widen - a.widen) * k,
    shift: a.shift + (b.shift - a.shift) * k,
  };
}

/**
 * What the cap is aiming at, and how many readings have said nothing.
 *
 * Kept by whoever feeds the segmenter's silhouettes in, and moved only
 * by `nextCapFit`. `wanted` is the shape the drawn fit is easing
 * towards; `misses` counts the run of readings that had no honest answer.
 */
export type CapFitState = {
  wanted: CapFit;
  misses: number;
};

/** Nothing has been read yet: the standing allowance, no refusals. */
export const CAP_FIT_START: CapFitState = { wanted: CAP_FIT_DEFAULT, misses: 0 };

/** Whether two fits are the same reading, within `CAP_FIT.deadband`. */
function sameFit(a: CapFit, b: CapFit): boolean {
  return (
    Math.abs(a.lift - b.lift) < CAP_FIT.deadband &&
    Math.abs(a.widen - b.widen) < CAP_FIT.deadband &&
    Math.abs(a.shift - b.shift) < CAP_FIT.deadband
  );
}

/**
 * The fit the cap should be heading for after one reading.
 *
 * `fit` is what `fitHairCap` returned — a shape, or null for a reading
 * that had no honest answer in it. The three rules, in order:
 *
 *   • A reading within the deadband of the one the cap is already aiming
 *     at IS that reading. A classifier jitters a percent or two on a
 *     head that has not moved, and a cap that eased towards every jitter
 *     would breathe.
 *   • A refusal HOLDS. One shattered mask, one head tipped past the top
 *     gate, one frame with the face briefly lost: none of those is a
 *     statement that the hair went away, and treating them as one
 *     deflates the cap onto the skull and re-inflates it a third of a
 *     second later. That pop is the single thing this file is for.
 *   • Only a run of `CAP_FIT.hold` refusals lets go, back to the
 *     standing allowance — a hat coming off, a segmenter that has
 *     genuinely stopped, a different person in the frame.
 *
 * Pure, so the rule can be tested without a camera. Nothing it returns
 * is displayed, stored or compared: it decides where a wireframe is
 * drawn and nothing else.
 */
export function nextCapFit(state: CapFitState, fit: CapFit | null): CapFitState {
  const held = clampFit(state.wanted);
  const misses = Number.isFinite(state.misses) ? Math.max(0, Math.floor(state.misses)) : 0;
  if (fit === null) {
    const next = misses + 1;
    if (next < CAP_FIT.hold) return { wanted: held, misses: next };
    return { wanted: CAP_FIT_DEFAULT, misses: next };
  }
  const wanted = clampFit(fit);
  return { wanted: sameFit(wanted, held) ? held : wanted, misses: 0 };
}
