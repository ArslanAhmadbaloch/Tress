/**
 * The ring for one continuous turn, as eight arcs around the head.
 *
 * The five-angle `CaptureRing` counts photographs: one arc per angle, the
 * ones behind you filled. This ring counts something else — where the
 * head has been, and whether the frames it gave from there were worth
 * anything. Each of the eight arcs holds the time spent inside its slice
 * of the turn while the framing held, so an arc that is full says "there
 * were usable frames here" and a half arc says "you came through too
 * fast". It is a readout of a gesture, never a reading of hair.
 *
 * Nothing here decides anything. The screen owns the pose maths and
 * writes three values at camera rate — the eight fills, the cursor, and
 * the lock the FaceFrame already writes — and the ring reads them. That
 * is why there is no React state in this file and no re-render per
 * frame: the arcs move on the UI thread and the component above stays
 * still.
 *
 * Three marks sit outside the stroke, one per angle the turn can reach.
 * With a previous set to match they stand where those photographs were
 * taken, so the marks are last month's front and temples and the turn is
 * simply asked to pass through them again. They differ in shape as well
 * as colour — hollow while open, solid once a photograph has landed — so
 * the state survives a reading that has no colour in it at all.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { SEGMENT_DEG, SWEEP_SEGMENTS, theta } from '@/features/capture/sweep';
import { motion, useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

/** Gap between segments, in degrees — the same gap the five-angle ring cuts. */
const GAP = 5;

/** How wide the cap riding at the head's position is, in degrees. */
const CURSOR_DEG = 10;

/**
 * Room kept between the stroke and the edge of the component's box, so
 * the three marks sit outside the arcs rather than on top of them.
 *
 * It is exported because the collapse depends on it: the five-angle ring
 * this one hands over to should be mounted at `size - 2 * SWEEP_RING_INSET`
 * for the two strokes to share a radius and the cross-fade to read as one
 * circle becoming another rather than as two circles swapping.
 */
export const SWEEP_RING_INSET = 12;

/** The marks: radius of one, and its distance beyond the stroke. */
const MARK_R = 3.5;
const MARK_GAP = 6;

/*
 * Chrome over a live camera, which is real black rather than a themed
 * surface — so the track, the filled arcs and the marks' outline are
 * stated in white directly, exactly as the five-angle ring states its
 * own. The accent is not: sage is a brand colour and comes from the
 * theme.
 */
const TRACK = 'rgba(255,255,255,0.22)';
const DONE = 'rgba(255,255,255,0.9)';
const MARK_LINE = 'rgba(255,255,255,0.75)';

/**
 * How visible the unfilled track is with no head near the ring, and with
 * one sitting in it — the same two numbers the five-angle ring uses, so
 * both rings answer a head with the same firmness.
 */
const WAITING_FAR = 0.6;
const WAITING_LOCKED = 1;
const WAITING_STATIC = 0.75;

/** A mark that has been left behind by a forced finish, still drawn but quiet. */
const ABANDONED = 0.35;

/** Where the turn stands: the ring is inert until the first photograph lands. */
export type SweepStep = 'centre' | 'turning' | 'finishing';

/** What has happened at one of the three positions the turn can reach. */
export type SweepMarkState = 'open' | 'taken' | 'abandoned';

/**
 * One mark on the ring.
 *
 * `yaw` is the well's own target — last month's yaw where there is a set
 * to match, and the generic target where there is not — so the caller
 * hands over the number it already holds and the ring places it. The
 * conversion is the sweep's own `theta`, signed and never wrapped, so
 * there is no long way round to take.
 */
export type SweepMark = {
  key: string;
  yaw: number;
  state: SweepMarkState;
};

/**
 * Where one arc sits on the ring, and how long a full one is.
 *
 * The same construction the five-angle ring uses, so an arc always lands
 * on the slice it belongs to rather than near it.
 */
function arcOf(circumference: number, segment: number, index: number) {
  const sweep = segment - GAP;
  return {
    full: (sweep / 360) * circumference,
    offset: -((index * segment + GAP / 2) / 360) * circumference,
  };
}

export function SweepRing({
  size,
  /**
   * Time held in each of the eight slices, 0-1 each, written by the
   * screen at camera rate. Read here and nowhere else; the ring never
   * eases it, because it arrives already eased and easing it twice would
   * put the arc behind the head it is reporting.
   */
  fills,
  /**
   * Where the head is on the ring, in signed degrees. Null while no face
   * is being tracked, and then the cap is not drawn at all rather than
   * parked at the top pretending to be somewhere.
   */
  cursor,
  /**
   * 0-1 while the first photograph's hold runs, drawn around the whole
   * circumference because at that moment the ring is one target rather
   * than eight. Null once the turn has started.
   */
  hold,
  /**
   * 0-1, how close this is to a usable frame: the same value the
   * FaceFrame glows on. The unfilled track firms up with it, so the ring
   * answers the head rather than waiting to be aligned with. It says
   * nothing about the hair.
   */
  lock,
  step,
  marks,
  /**
   * Bumped to run one circuit of the ring: once when the first
   * photograph lands and the ring opens, once when the last arc fills.
   * Two facts, one beat each.
   */
  beat = 0,
  stroke = 3,
}: {
  size: number;
  fills: SharedValue<number[]>;
  cursor?: SharedValue<number> | null;
  hold?: SharedValue<number> | null;
  lock?: SharedValue<number> | null;
  step: SweepStep;
  marks: SweepMark[];
  beat?: number;
  stroke?: number;
}) {
  const { colors } = useTheme();
  const centre = size / 2;
  const radius = (size - stroke) / 2 - SWEEP_RING_INSET;
  const circumference = 2 * Math.PI * radius;
  const markRadius = radius + stroke / 2 + MARK_GAP;

  const segments = Array.from({ length: SWEEP_SEGMENTS }, (_, i) => ({
    index: i,
    ...arcOf(circumference, SEGMENT_DEG, i),
  }));
  const holdArc = arcOf(circumference, 360, 0);

  return (
    <View
      style={{ width: size, height: size }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size}>
        {/* Rotated so the first slice starts at the top. */}
        <G rotation={-90} origin={`${centre}, ${centre}`}>
          {/*
            The unfilled ring, as one group: a single animated property
            carries all eight, so it firms up as one object rather than
            as eight arcs each answering separately.
          */}
          <WaitingTrack
            centre={centre}
            radius={radius}
            circumference={circumference}
            stroke={stroke}
            segments={segments}
            lock={lock ?? null}
          />

          {step === 'centre'
            ? null
            : segments.map((s) => (
                <SegmentFill
                  key={s.index}
                  centre={centre}
                  radius={radius}
                  circumference={circumference}
                  stroke={stroke}
                  index={s.index}
                  full={s.full}
                  offset={s.offset}
                  fills={fills}
                />
              ))}

          {hold ? (
            <HoldArc
              centre={centre}
              radius={radius}
              circumference={circumference}
              stroke={stroke + 1}
              full={holdArc.full}
              offset={holdArc.offset}
              progress={hold}
            />
          ) : null}

          <Circuit
            centre={centre}
            radius={radius}
            circumference={circumference}
            stroke={stroke + 1}
            color={colors.accent}
            beat={beat}
          />
        </G>

        {/*
          The cap riding at the head's position, in its own frame: this
          one starts at six o'clock, which is where the two halves of the
          turn meet, so the arc it draws is continuous across the whole
          signed range and never has a seam to jump.
        */}
        {cursor && step !== 'centre' ? (
          <G rotation={90} origin={`${centre}, ${centre}`}>
            <Cursor
              centre={centre}
              radius={radius}
              circumference={circumference}
              stroke={stroke + 1}
              color={colors.accent}
              theta={cursor}
            />
          </G>
        ) : null}

        {marks.map((mark) => (
          <WellMark
            key={mark.key}
            x={centre + markRadius * Math.sin((theta(mark.yaw) * Math.PI) / 180)}
            y={centre - markRadius * Math.cos((theta(mark.yaw) * Math.PI) / 180)}
            state={mark.state}
            color={colors.accent}
            breathing={step === 'finishing' && mark.state === 'open'}
          />
        ))}
      </Svg>
    </View>
  );
}

/** One arc's place on the ring. */
type Segment = {
  index: number;
  full: number;
  offset: number;
};

/**
 * The ring underneath everything, brightening as a head approaches it.
 *
 * With nothing tracking — a build with no detector, a simulator — it is
 * a plain group at its resting strength and no animation runs at all.
 */
function WaitingTrack({
  centre,
  radius,
  circumference,
  stroke,
  segments,
  lock,
}: {
  centre: number;
  radius: number;
  circumference: number;
  stroke: number;
  segments: Segment[];
  lock: SharedValue<number> | null;
}) {
  const animated = useAnimatedProps(() => {
    const value = lock ? lock.get() : 0;
    const level = value < 0 ? 0 : value > 1 ? 1 : value;
    return { opacity: WAITING_FAR + (WAITING_LOCKED - WAITING_FAR) * level };
  });

  const arcs = segments.map((s) => (
    <Circle
      key={s.index}
      cx={centre}
      cy={centre}
      r={radius}
      stroke={TRACK}
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
      strokeDasharray={`${s.full} ${circumference}`}
      strokeDashoffset={s.offset}
    />
  ));

  if (!lock) return <G opacity={WAITING_STATIC}>{arcs}</G>;

  return <AnimatedG animatedProps={animated}>{arcs}</AnimatedG>;
}

/**
 * One slice, filling with the time held inside it.
 *
 * Its own component so the animated property belongs to one arc, and
 * because the value it reads is one number out of an array the screen
 * rewrites in place: eight small reads on the UI thread, no timings, no
 * allocation per frame.
 *
 * White rather than sage: this is the state a person has to be able to
 * read, and luminance carries it where a hue alone would not.
 */
function SegmentFill({
  centre,
  radius,
  circumference,
  stroke,
  index,
  full,
  offset,
  fills,
}: {
  centre: number;
  radius: number;
  circumference: number;
  stroke: number;
  index: number;
  full: number;
  offset: number;
  fills: SharedValue<number[]>;
}) {
  const animated = useAnimatedProps(() => {
    const value = fills.get()[index] ?? 0;
    const level = value < 0 ? 0 : value > 1 ? 1 : value;
    return { strokeDasharray: [full * level, circumference] };
  });

  return (
    <AnimatedCircle
      cx={centre}
      cy={centre}
      r={radius}
      stroke={DONE}
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
      strokeDashoffset={offset}
      animatedProps={animated}
    />
  );
}

/**
 * The whole circumference, filling while the first pose is held.
 *
 * Before the turn starts there is one target and the ring is it, so the
 * hold is drawn around everything rather than inside a slice. It applies
 * no easing of its own for the reason the five-angle ring gives: the
 * value arrives already eased.
 */
function HoldArc({
  centre,
  radius,
  circumference,
  stroke,
  full,
  offset,
  progress,
}: {
  centre: number;
  radius: number;
  circumference: number;
  stroke: number;
  full: number;
  offset: number;
  progress: SharedValue<number>;
}) {
  const animated = useAnimatedProps(() => ({
    strokeDasharray: [full * progress.get(), circumference],
  }));

  return (
    <AnimatedCircle
      cx={centre}
      cy={centre}
      r={radius}
      stroke={DONE}
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
      strokeDashoffset={offset}
      animatedProps={animated}
    />
  );
}

/**
 * The cap that follows the head.
 *
 * Drawn from a frame whose start sits at six o'clock, so the whole
 * signed range [-180, +180] maps onto the path in one piece and the cap
 * can be placed by arithmetic alone — no modulo, no wrap, nothing to
 * jump across. It is clamped at the two ends rather than allowed to run
 * off the path, which is also what the head is doing at that point.
 */
function Cursor({
  centre,
  radius,
  circumference,
  stroke,
  color,
  theta,
}: {
  centre: number;
  radius: number;
  circumference: number;
  stroke: number;
  color: string;
  theta: SharedValue<number>;
}) {
  const cap = (CURSOR_DEG / 360) * circumference;

  const animated = useAnimatedProps(() => {
    const angle = theta.get();
    const bounded = angle < -180 ? -180 : angle > 180 ? 180 : angle;
    const along = ((bounded + 180) / 360) * circumference - cap / 2;
    const start = along < 0 ? 0 : along > circumference - cap ? circumference - cap : along;
    return { strokeDashoffset: -start };
  });

  return (
    <AnimatedCircle
      cx={centre}
      cy={centre}
      r={radius}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
      strokeDasharray={`${cap} ${circumference}`}
      animatedProps={animated}
    />
  );
}

/**
 * One mark, at one of the three positions the turn can reach.
 *
 * Hollow while the position is still open, solid once a photograph has
 * been taken there, and back to hollow over a quarter of a second if
 * that photograph is dropped — slow enough to read as something that
 * happened rather than as a flicker. While the turn is being asked for
 * the last of them, an open mark breathes.
 */
function WellMark({
  x,
  y,
  state,
  color,
  breathing,
}: {
  x: number;
  y: number;
  state: SweepMarkState;
  color: string;
  breathing: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const taken = useSharedValue(state === 'taken' ? 1 : 0);
  const scale = useSharedValue(state === 'taken' ? 1 : 0.6);
  const breath = useSharedValue(1);

  useEffect(() => {
    const filled = state === 'taken';
    if (reduceMotion) {
      taken.set(filled ? 1 : 0);
      scale.set(filled ? 1 : 0.6);
      return;
    }
    if (filled) {
      taken.set(withTiming(1, { duration: 220 }));
      scale.set(withSpring(1, motion.spring.bouncy));
      return;
    }
    taken.set(withTiming(0, { duration: 260 }));
    scale.set(withTiming(0.6, { duration: 260 }));
  }, [state, reduceMotion, taken, scale]);

  useEffect(() => {
    // A position the turn never reached is still drawn — a forced finish
    // leaves it for next time rather than pretending it was never asked
    // for — but it stops asking for attention.
    if (state === 'abandoned') {
      cancelAnimation(breath);
      breath.set(reduceMotion ? ABANDONED : withTiming(ABANDONED, { duration: 260 }));
      return;
    }
    if (!breathing) {
      cancelAnimation(breath);
      breath.set(reduceMotion ? 1 : withTiming(1, { duration: 200 }));
      return;
    }
    if (reduceMotion) {
      // Somebody who has asked for less movement still gets the signal:
      // the mark sits a shade back instead of breathing.
      breath.set(0.85);
      return;
    }
    breath.set(1);
    breath.set(
      withRepeat(withTiming(0.6, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
  }, [breathing, state, reduceMotion, breath]);

  const group = useAnimatedProps(() => ({ opacity: breath.get() }));
  const solid = useAnimatedProps(() => ({
    opacity: taken.get(),
    r: MARK_R * scale.get(),
  }));

  return (
    <AnimatedG animatedProps={group}>
      <Circle cx={x} cy={y} r={MARK_R} stroke={MARK_LINE} strokeWidth={1.5} fill="none" />
      <AnimatedCircle cx={x} cy={y} fill={color} animatedProps={solid} />
    </AnimatedG>
  );
}

/**
 * One sage circuit of the ring, run on a beat.
 *
 * Mounted always and invisible between beats, so neither the ring
 * opening nor the ring closing needs a state change here: the effect
 * writes two values and the circuit ends at zero, leaving the arcs to
 * say the rest.
 */
function Circuit({
  centre,
  radius,
  circumference,
  stroke,
  color,
  beat,
}: {
  centre: number;
  radius: number;
  circumference: number;
  stroke: number;
  color: string;
  beat: number;
}) {
  const reduceMotion = useReducedMotion();
  const sweepT = useSharedValue(0);
  const sweepOpacity = useSharedValue(0);

  useEffect(() => {
    if (beat < 1 || reduceMotion) {
      sweepT.set(0);
      sweepOpacity.set(0);
      return;
    }
    sweepT.set(0);
    sweepT.set(withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    sweepOpacity.set(
      withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 240 })),
    );
  }, [beat, reduceMotion, sweepT, sweepOpacity]);

  const animated = useAnimatedProps(() => ({
    strokeDasharray: [circumference * sweepT.get(), circumference],
    opacity: sweepOpacity.get(),
  }));

  return (
    <AnimatedCircle
      cx={centre}
      cy={centre}
      r={radius}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
      animatedProps={animated}
    />
  );
}
