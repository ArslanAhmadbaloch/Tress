/**
 * The instruction sheet's thumbnails — the scanner, in miniature.
 *
 * Each row of the sheet shows the state of the scanner the row is about:
 * a head with glasses on, softly struck through; the ring at rest around
 * a straight head with the Start disc waiting beneath; and the ring with
 * every sector lit. Until frames from a real phone exist these are drawn
 * from the scanner's own parts — the second and third tiles hold the real
 * `ScanRing`, sized down, so the dial the person is about to fill is the
 * dial they have already seen — around a neutral silhouette rather than a
 * photograph nobody took.
 *
 * Nothing moves. The ring reads its coverage from a shared value that is
 * written once, so there is no animation to gate behind Reduce Motion.
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
import { useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path } from 'react-native-svg';

import { darkColors, radius } from '@/theme';

import { SCAN_SECTORS, ScanRing, emptyCoverage, scanRingMargin } from './scan-ring';

/** The three steps of the sheet, in order. */
export type InstructionStep = 0 | 1 | 2;

/** A portrait tile, 4:5, the proportion of the scanner's own video window. */
export const INSTRUCTION_THUMB_WIDTH = 80;
export const INSTRUCTION_THUMB_HEIGHT = 100;

/** The miniature ring's box, inside the tile, and the tick that suits it. */
const RING_W = 68;
const RING_H = 88;
const RING_TICK = 3;
const RING_STROKE = 1;
const RING_MARGIN = scanRingMargin(RING_TICK);

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
        <RingThumb lit={false} turned={false} />
      ) : (
        <RingThumb lit turned />
      )}
    </View>
  );
}

/* --------------------------------- head ---------------------------------- */

/**
 * A neutral head and shoulders, drawn once for every tile. `turned` slides
 * the head a little to the side and narrows it, the way a head reads
 * three-quarters on, so the last tile shows a person mid-turn rather than
 * the same face as the second.
 */
function Silhouette({
  cx,
  cy,
  turned,
  opacity,
}: {
  cx: number;
  cy: number;
  turned: boolean;
  opacity: number;
}) {
  const headRx = turned ? 10 : 12;
  const headCx = turned ? cx + 3 : cx;
  return (
    <>
      <Ellipse
        cx={headCx}
        cy={cy - 6}
        rx={headRx}
        ry={15}
        fill={darkColors.textOnPhoto}
        fillOpacity={opacity}
      />
      {/* Shoulders: a wide arc rising from the bottom of the window. */}
      <Path
        d={`M ${cx - 26} ${cy + 40} C ${cx - 26} ${cy + 18}, ${cx - 12} ${cy + 12}, ${cx} ${cy + 12} C ${cx + 12} ${cy + 12}, ${cx + 26} ${cy + 18}, ${cx + 26} ${cy + 40} Z`}
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
      <Silhouette cx={cx} cy={cy} turned={false} opacity={0.85} />
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

/* --------------------------- steps 2 and 3: the ring --------------------------- */

/**
 * The real ring, sized down, around a head. At rest the dial is quiet
 * white and the Start disc waits beneath; lit, every sector's coverage
 * is written as 1 and the ring holds green with no sweep, because the
 * sheet is a picture of the end state, not a re-run of reaching it.
 */
function RingThumb({ lit, turned }: { lit: boolean; turned: boolean }) {
  const coverage = useSharedValue(
    lit ? Array.from({ length: SCAN_SECTORS }, () => 1) : emptyCoverage(),
  );
  const cx = INSTRUCTION_THUMB_WIDTH / 2;
  const ringTop = lit ? (INSTRUCTION_THUMB_HEIGHT - RING_H) / 2 : 2;
  const cy = ringTop + RING_H / 2;
  /* Two tiles share one sheet, so each clip path carries its own id. */
  const clipId = lit ? 'scan-thumb-window-lit' : 'scan-thumb-window-rest';

  return (
    <View style={{ width: INSTRUCTION_THUMB_WIDTH, height: INSTRUCTION_THUMB_HEIGHT }}>
      <Svg
        width={INSTRUCTION_THUMB_WIDTH}
        height={INSTRUCTION_THUMB_HEIGHT}
        style={{ position: 'absolute' }}>
        <Defs>
          <ClipPath id={clipId}>
            <Ellipse cx={cx} cy={cy} rx={RING_W / 2 - RING_MARGIN} ry={RING_H / 2 - RING_MARGIN} />
          </ClipPath>
        </Defs>
        {/* The video window: the oval the ring's ticks radiate from. */}
        <Ellipse
          cx={cx}
          cy={cy}
          rx={RING_W / 2 - RING_MARGIN}
          ry={RING_H / 2 - RING_MARGIN}
          fill={darkColors.surfaceElevated}
        />
        <G clipPath={`url(#${clipId})`}>
          <Silhouette cx={cx} cy={cy} turned={turned} opacity={0.8} />
        </G>
        {lit ? null : (
          <>
            {/* The Start disc and its two rings, tucked under the oval. */}
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
      <ScanRing
        width={RING_W}
        height={RING_H}
        coverage={coverage}
        active={lit}
        complete={false}
        tickLength={RING_TICK}
        stroke={RING_STROKE}
        style={{ position: 'absolute', left: (INSTRUCTION_THUMB_WIDTH - RING_W) / 2, top: ringTop }}
      />
    </View>
  );
}
