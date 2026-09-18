/**
 * The instruction sheet's thumbnails — the scanner, in miniature.
 *
 * Each row of the sheet shows the state of the scanner the row is about,
 * and the three states are the three the scan actually has now:
 *
 *   1. a head with glasses on, softly struck through;
 *   2. a head straight on inside the four corner brackets, the Start
 *      disc waiting beneath it and one arrow at the side — press Start,
 *      look straight, then follow the arrow;
 *   3. the same brackets round a head tipped down, the crown marked and
 *      the arrow pointing the way — the last step.
 *
 * Until frames from a real phone exist these are drawn from the
 * scanner's own parts, so what a person is shown here is what they will
 * meet a second later: brackets and an arrow, around a neutral
 * silhouette rather than a photograph nobody took.
 *
 * These two tiles used to hold the real `ScanRing`, sized down — a dial
 * filling by sector, which was the old two-beat choreography. That
 * choreography is gone, and a sheet promising a dial nobody will ever
 * see is worse than no sheet: it was the first thing on screen and the
 * only thing on screen still describing the previous build.
 *
 * Nothing moves, so there is no animation to gate behind Reduce Motion.
 *
 * When real thumbnails are captured (the owner will take them from the
 * scanner on a device build), pass them as `image` and the drawing steps
 * aside: the frame, radius and size stay the same, so the sheet does not
 * need to change.
 *
 * ── The video slot ──────────────────────────────────────────────────
 * The owner wants each row to hold a short silent loop of the real
 * scanner rather than a frozen frame, so `video` is part of the tile's
 * shape now and the footage can be dropped in the moment it is filmed.
 * It does not play yet, and the tile says so rather than pretending:
 * this build has no video player in it — neither `expo-video` nor the
 * older `expo-av` is a dependency (checked against package.json), and a
 * lane that may not install packages cannot add one. Until one is
 * added, a tile handed a `video` and nothing else keeps showing the
 * drawing, and a tile handed both shows the `image` as the loop's still
 * first frame.
 *
 * To finish it: add `expo-video`, then render a `VideoView` here with
 * `useVideoPlayer(video, (p) => { p.loop = true; p.muted = true;
 * p.play(); })`, `contentFit="cover"` and no controls, at the tile's own
 * width and height, paused under Reduce Motion with the `image` (or the
 * drawing) shown in its place. Nothing else in the sheet changes.
 */

import { Image, type ImageSource } from 'expo-image';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path } from 'react-native-svg';

import { darkColors, radius } from '@/theme';

/** The three steps of the sheet, in order. */
export type InstructionStep = 0 | 1 | 2;

/** A portrait tile, 4:5, the proportion of the scanner's own video window. */
export const INSTRUCTION_THUMB_WIDTH = 80;
export const INSTRUCTION_THUMB_HEIGHT = 100;

/** The window the head sits in, inside the tile, and the brackets round it. */
const WINDOW_W = 68;
const WINDOW_H = 88;
/** How far each bracket reaches along its two edges, and how heavy it is drawn. */
const BRACKET_ARM = 9;
const BRACKET_WEIGHT = 2;
/** One chevron of the arrow: half its width, half its height, and the gap between three. */
const CHEVRON_HALF_W = 3.5;
const CHEVRON_HALF_H = 5;
const CHEVRON_GAP = 5.5;

/** How a head sits in a tile. */
type HeadPose = 'straight' | 'down';

export type InstructionThumbProps = {
  step: InstructionStep;
  /**
   * A real thumbnail of the scanner in this state, captured on a device.
   * When present it fills the tile and nothing is drawn. Accepts whatever
   * `expo-image` accepts: a `require()`d asset or a `{ uri }`.
   */
  image?: ImageSource | number;
  /**
   * A `require()`d short loop of the scanner in this state — silent,
   * a second or two, filmed on a device. Accepted now so the footage has
   * somewhere to go; not played until this build has a video player in
   * it. See the video-slot note at the top of the file.
   */
  video?: number;
};

/*
  `video` is deliberately not read here: there is no player in this
  build, so a tile handed one shows its `image`, or the drawing, exactly
  as it did before. The prop is part of the shape so the footage has
  somewhere to arrive; the note at the top says what turns it on.
*/
export function InstructionThumb({ step, image }: InstructionThumbProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: INSTRUCTION_THUMB_WIDTH,
        height: INSTRUCTION_THUMB_HEIGHT,
        borderRadius: radius.md,
        backgroundColor: darkColors.background,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      {image !== undefined ? (
        <Image
          source={image}
          contentFit="cover"
          style={{ width: INSTRUCTION_THUMB_WIDTH, height: INSTRUCTION_THUMB_HEIGHT }}
        />
      ) : step === 0 ? (
        <GlassesOffThumb />
      ) : step === 1 ? (
        <FrameThumb pose="straight" />
      ) : (
        <FrameThumb pose="down" />
      )}
    </View>
  );
}

/* --------------------------------- head ---------------------------------- */

/**
 * A neutral head and shoulders, drawn once for every tile.
 *
 * `straight` is a head square to the camera. `down` is the same head
 * tipped forward: wider than it is tall, sitting lower on a shorter
 * neck, with the face gone from the near side — what the camera sees
 * when the crown is turned toward it, which is the second beat.
 */
function Silhouette({
  cx,
  cy,
  pose,
  opacity,
}: {
  cx: number;
  cy: number;
  pose: HeadPose;
  opacity: number;
}) {
  const down = pose === 'down';
  const headCy = down ? cy - 2 : cy - 6;
  const headRx = down ? 13 : 12;
  const headRy = down ? 12 : 15;
  const shoulderTop = down ? cy + 14 : cy + 12;
  return (
    <>
      <Ellipse
        cx={cx}
        cy={headCy}
        rx={headRx}
        ry={headRy}
        fill={darkColors.textOnPhoto}
        fillOpacity={opacity}
      />
      {/*
        On a tipped head the face has gone away from the camera: one soft
        arc across the lower half is as much of it as is left to see.
      */}
      {down ? (
        <Path
          d={`M ${cx - 11} ${headCy + 5} Q ${cx} ${headCy + 12}, ${cx + 11} ${headCy + 5}`}
          stroke={darkColors.background}
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          opacity={0.7}
        />
      ) : null}
      {/* Shoulders: a wide arc rising from the bottom of the window. */}
      <Path
        d={`M ${cx - 26} ${cy + 40} C ${cx - 26} ${shoulderTop + 6}, ${cx - 12} ${shoulderTop}, ${cx} ${shoulderTop} C ${cx + 12} ${shoulderTop}, ${cx + 26} ${shoulderTop + 6}, ${cx + 26} ${cy + 40} Z`}
        fill={darkColors.textOnPhoto}
        fillOpacity={opacity * 0.4}
      />
    </>
  );
}

/* ------------------------------ step 1: glasses ------------------------------ */

/**
 * Glasses on a straight face, with one soft diagonal across them: the
 * thing to take off, marked rather than forbidden.
 */
function GlassesOffThumb() {
  const cx = INSTRUCTION_THUMB_WIDTH / 2;
  const cy = INSTRUCTION_THUMB_HEIGHT / 2;
  const eyeY = cy - 8;
  const lensR = 5.5;
  const gap = 7;
  return (
    <Svg width={INSTRUCTION_THUMB_WIDTH} height={INSTRUCTION_THUMB_HEIGHT}>
      <Silhouette cx={cx} cy={cy} pose="straight" opacity={0.85} />
      {/* The glasses, in the ground colour so they cut into the face. */}
      <Circle
        cx={cx - gap}
        cy={eyeY}
        r={lensR}
        stroke={darkColors.background}
        strokeWidth={1.75}
        fill="none"
      />
      <Circle
        cx={cx + gap}
        cy={eyeY}
        r={lensR}
        stroke={darkColors.background}
        strokeWidth={1.75}
        fill="none"
      />
      <Line
        x1={cx - gap + lensR}
        y1={eyeY}
        x2={cx + gap - lensR}
        y2={eyeY}
        stroke={darkColors.background}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Line
        x1={cx - gap - lensR}
        y1={eyeY - 1}
        x2={cx - 17}
        y2={eyeY - 3}
        stroke={darkColors.background}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Line
        x1={cx + gap + lensR}
        y1={eyeY - 1}
        x2={cx + 17}
        y2={eyeY - 3}
        stroke={darkColors.background}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      {/* The mark: one stroke, corner to corner across the glasses, soft. */}
      <Line
        x1={cx - 18}
        y1={eyeY + 12}
        x2={cx + 18}
        y2={eyeY - 12}
        stroke={darkColors.danger}
        strokeOpacity={0.9}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/* ------------------------------ the arrow ------------------------------ */

/**
 * The scan's own arrow, in miniature: three chevrons pointing the way
 * the head is being asked to move.
 *
 * The same three the scanner draws over the live video, drawn here at a
 * tile's size and standing still — the sheet is a picture of a step, not
 * a re-run of it. Each is one open corner rather than a filled triangle,
 * so the shape reads at nine points across, and they fade back from the
 * leading one so the eye is given a direction and not a block.
 */
function Chevrons({
  x,
  y,
  direction,
}: {
  x: number;
  y: number;
  direction: 'right' | 'down';
}) {
  const down = direction === 'down';
  return (
    <G>
      {[0, 1, 2].map((i) => {
        const step = i * CHEVRON_GAP;
        const cx = down ? x : x + step;
        const cy = down ? y + step : y;
        const d = down
          ? `M ${cx - CHEVRON_HALF_H} ${cy - CHEVRON_HALF_W} L ${cx} ${cy + CHEVRON_HALF_W} L ${cx + CHEVRON_HALF_H} ${cy - CHEVRON_HALF_W}`
          : `M ${cx - CHEVRON_HALF_W} ${cy - CHEVRON_HALF_H} L ${cx + CHEVRON_HALF_W} ${cy} L ${cx - CHEVRON_HALF_W} ${cy + CHEVRON_HALF_H}`;
        return (
          <Path
            key={i}
            d={d}
            stroke={darkColors.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={1 - i * 0.28}
          />
        );
      })}
    </G>
  );
}

/* ----------------------------- the brackets ----------------------------- */

/**
 * The four corner brackets, round the window the head sits in.
 *
 * The same frame `FrameBrackets` draws round the oval on the scanner,
 * reduced to one path per corner: an arm along each edge meeting at the
 * corner itself. They are drawn quiet here, because in the tile they are
 * a picture of the frame rather than the frame reacting to a head.
 */
function Brackets({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  const right = x + width;
  const bottom = y + height;
  const corners = [
    `M ${x} ${y + BRACKET_ARM} L ${x} ${y} L ${x + BRACKET_ARM} ${y}`,
    `M ${right - BRACKET_ARM} ${y} L ${right} ${y} L ${right} ${y + BRACKET_ARM}`,
    `M ${right} ${bottom - BRACKET_ARM} L ${right} ${bottom} L ${right - BRACKET_ARM} ${bottom}`,
    `M ${x + BRACKET_ARM} ${bottom} L ${x} ${bottom} L ${x} ${bottom - BRACKET_ARM}`,
  ];
  return (
    <G>
      {corners.map((d) => (
        <Path
          key={d}
          d={d}
          stroke={darkColors.textOnPhoto}
          strokeOpacity={0.7}
          strokeWidth={BRACKET_WEIGHT}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </G>
  );
}

/* --------------------------- steps 2 and 3: the scan --------------------------- */

/**
 * The scanner's own frame, sized down, around a head.
 *
 * `straight` is the step everybody starts on: the head square to the
 * camera inside the brackets, the Start disc waiting beneath it, and the
 * arrow at the side saying which way the first turn goes. `down` is the
 * last step: the same brackets round a head tipped forward, the crown
 * marked, and the arrow pointing down.
 *
 * There is no dial in either, because the scan has none. What a person
 * sees here is what they meet a second later.
 */
function FrameThumb({ pose }: { pose: HeadPose }) {
  const down = pose === 'down';
  const cx = INSTRUCTION_THUMB_WIDTH / 2;
  const frameTop = down ? (INSTRUCTION_THUMB_HEIGHT - WINDOW_H) / 2 : 2;
  const cy = frameTop + WINDOW_H / 2;
  const frameLeft = (INSTRUCTION_THUMB_WIDTH - WINDOW_W) / 2;
  /* Two tiles share one sheet, so each clip path carries its own id. */
  const clipId = `scan-thumb-window-${pose}`;

  return (
    <View style={{ width: INSTRUCTION_THUMB_WIDTH, height: INSTRUCTION_THUMB_HEIGHT }}>
      <Svg
        width={INSTRUCTION_THUMB_WIDTH}
        height={INSTRUCTION_THUMB_HEIGHT}
        style={{ position: 'absolute' }}>
        <Defs>
          <ClipPath id={clipId}>
            <Ellipse cx={cx} cy={cy} rx={WINDOW_W / 2} ry={WINDOW_H / 2} />
          </ClipPath>
        </Defs>
        {/* The video window: the oval the live camera shows through. */}
        <Ellipse
          cx={cx}
          cy={cy}
          rx={WINDOW_W / 2}
          ry={WINDOW_H / 2}
          fill={darkColors.surfaceElevated}
        />
        <G clipPath={`url(#${clipId})`}>
          <Silhouette cx={cx} cy={cy} pose={pose} opacity={0.8} />
          {/*
            The crown, marked: one arc over the top of the tipped head,
            in the scan's own green, so the last row says where the last
            step is looking.
          */}
          {down ? (
            <Path
              d={`M ${cx - 13} ${cy - 3} Q ${cx} ${cy - 20}, ${cx + 13} ${cy - 3}`}
              stroke={darkColors.success}
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
            />
          ) : null}
          {/*
            The arrow, inside the window and off to the side the head is
            asked to move — the same place it sits on the scanner.
          */}
          {down ? (
            <Chevrons x={cx} y={cy + 16} direction="down" />
          ) : (
            <Chevrons x={cx + 17} y={cy - 4} direction="right" />
          )}
        </G>
        <Brackets x={frameLeft} y={frameTop} width={WINDOW_W} height={WINDOW_H} />
        {down ? null : (
          <>
            {/* The Start disc and its two rings, tucked under the window. */}
            <Circle
              cx={cx}
              cy={INSTRUCTION_THUMB_HEIGHT - 4}
              r={13}
              fill={darkColors.textOnPhoto}
              fillOpacity={0.18}
            />
            <Circle
              cx={cx}
              cy={INSTRUCTION_THUMB_HEIGHT - 4}
              r={9.5}
              fill={darkColors.textOnPhoto}
              fillOpacity={0.26}
            />
            <Circle cx={cx} cy={INSTRUCTION_THUMB_HEIGHT - 4} r={6} fill={darkColors.textOnPhoto} />
          </>
        )}
      </Svg>
    </View>
  );
}
