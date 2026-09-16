/**
 * The ring's response to the head.
 *
 * There used to be two round things on the capture screen: the fixed
 * CaptureRing, and an oval drawn around the detected face that moved
 * with it. Two circles, nearly the same size, near enough concentric —
 * and nobody was ever told that the task was to bring one into the
 * other. People worked it out by tilting the phone until the shapes
 * agreed, which is a puzzle, not an instruction.
 *
 * So there is one target now. The ring is it, and this is what the ring
 * does when a head approaches it: the world outside it dims, its edge
 * thickens and warms from ink-white towards sage, and a soft halo blooms
 * behind it. All three run off one number — how close the head is to
 * sitting in the ring — so the screen moves continuously from off-target
 * through approaching to locked rather than flipping between states.
 * Nothing here draws an outline around the face any more; where the head
 * is, the person can see, because the camera is showing it to them.
 *
 * That number is in two parts and neither of them is a switch. Geometry
 * carries it as far as APPROACH_CEILING — how close the head is to
 * sitting in the ring, on a slope tied to the very thresholds
 * head-guidance judges framing by. The hold closes whatever gap is left:
 * once the pose is held, the ring fills the rest of the way over the same
 * 600 ms the shutter is waiting on, so the last of the light arrives
 * exactly as the photograph does and a broken hold takes it back down
 * rather than switching it off. Nowhere in it does a value jump.
 *
 * It comes in two pieces on purpose, because they belong at different
 * depths. `RingScrim` is the dimming and goes low — under the ghost of
 * last month's photograph and under the shutter flash, both of which it
 * would otherwise veil. `FaceFrame` is the ring's own light and goes
 * high, on top of everything, against the camera it is describing.
 *
 * It is still driven imperatively. Faces arrive at camera rate, and a
 * React render per frame would redraw the whole capture screen thirty
 * times a second.
 *
 * The number this writes is the same one the CaptureRing reads, so the
 * ring's own segments firm up on exactly the beat this glow does. It is
 * about geometry only — where the head is and how big it is against the
 * ring — and never about hair, which the detector cannot see.
 *
 * Colours come from the theme, so the overlay reads as part of the app
 * rather than as a scanner bolted onto it.
 */

import { useCallback, useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { motion, useTheme } from '@/theme';

import type { FaceObservation, GuideTarget } from './head-guidance';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/*
 * The same geometry head-guidance.ts judges framing by, restated here
 * because it keeps its thresholds private and this needs a slope rather
 * than the three verdicts it returns. They are fractions of the ring's
 * diameter, so they hold at any screen size.
 *
 * FACE_DROP: the face box sits low in the head — the ring holds the hair
 * above it too — so a well-placed face centre is a little below the
 * ring's. FILL_IDEAL is where a well-framed face actually sits, and it is
 * not the middle of the accepted band: head-guidance says in its own
 * words that the ring is meant to hold the whole head, hair included, so
 * a good face fills a little over half of it. FILL_FAR, FILL_NEAR and
 * CENTRE_TOLERANCE are the edges of what that module will still accept.
 */
const FACE_DROP = 0.08;
const FILL_IDEAL = 0.57;
const FILL_FAR = 0.5;
const FILL_NEAR = 1.05;
const CENTRE_TOLERANCE = 0.14;

/**
 * How much of the slope the accepted band is allowed to spend, and how
 * far past its edge counts as nowhere near.
 *
 * The band is lopsided — a face may be twice the ideal width and still
 * pass, but barely a tenth under it — so a slope measured in raw ring
 * diameters would light up for one kind of mistake and go dark for the
 * other. Measuring each side against its own limit instead puts both
 * edges of "still acceptable" at the same brightness, and everything
 * inside the band above it. What the ring says and what the guidance
 * line says are then the same thing twice rather than two opinions.
 */
const BAND_COST = 0.5;
const FILL_BEYOND = 0.35;
const OFFSET_BEYOND = 0.2;

/**
 * How high geometry alone can take the ring.
 *
 * Full lock is not geometry's to declare: the reducer decides when a pose
 * is actually held, and it weighs things no distance can — the turn of
 * the head, the phone's own stillness. So geometry gets the ring as far
 * as it can and the hold closes whatever gap is left, whether that is the
 * last quarter for a well-framed head or two thirds for one sitting at
 * the very edge of what the app will accept. Everybody's ring arrives
 * full at the same moment: the one the shutter fires on.
 */
const APPROACH_CEILING = 0.72;

/** How much the world outside the ring is dimmed, off-target and locked. */
const SCRIM_FAR = 0.62;
const SCRIM_LOCKED = 0.3;

/** The ring's edge, in points: its resting weight and how much it gains. */
const EDGE_STROKE = 3;
const EDGE_GAIN = 3;

/**
 * The beat at the shutter, as weight and light rather than size.
 *
 * Nothing here scales a radius. A ring that swells past the segments
 * drawn on top of it is two rings again for as long as it takes to
 * settle, which is the one thing this screen exists to avoid — so the
 * beat thickens the edge about its own centre line and brightens the
 * halo, and the circle stays exactly where it was.
 */
const EDGE_BEAT = 2.5;
const HALO_STROKE = 12;
const HALO_OPACITY = 0.26;
const HALO_BEAT = 0.22;
const EDGE_BEAT_LIGHT = 0.3;

/**
 * How much of a new sighting counts, and what is not worth a write.
 *
 * The detector jitters by a percent or two while a head sits perfectly
 * still. A spring absorbs that; under Reduce Motion there is no spring,
 * and the value goes straight to a screen-wide dimming layer — so the
 * jitter is taken out before it gets there, by a running average and a
 * coarser step. An average of past readings is not an animation: nothing
 * moves unless the head does.
 */
const SMOOTHING = 0.35;
const EPSILON = 0.01;
const EPSILON_STILL = 0.04;

function clamp01(value: number): number {
  'worklet';
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * One way of being wrong, as a cost from 0 (right) to 1 (nowhere near).
 *
 * `accepted` is how far out head-guidance still calls the framing good
 * and `beyond` is how much further counts as hopeless. The edge of the
 * accepted band always costs BAND_COST, whichever side of the ideal it
 * is on and however lopsided the band, and the line carries on at a
 * shallower rate from there.
 */
function cost(distance: number, accepted: number, beyond: number): number {
  if (accepted <= 0) return distance > 0 ? 1 : 0;
  if (distance <= accepted) return BAND_COST * (distance / accepted);
  return Math.min(1, BAND_COST + ((distance - accepted) / beyond) * (1 - BAND_COST));
}

/**
 * How close a head is to sitting in the ring: 0 nowhere near, 1 in it.
 *
 * Position and size are read separately and the worse of the two wins,
 * because a head in the right place at the wrong distance is not nearly
 * there — it is wrong in one way instead of two, and the ring should say
 * so rather than averaging the mistake away.
 */
export function headProximity(face: FaceObservation, target: GuideTarget): number {
  const dx = (face.cx - target.cx) / target.diameter;
  const dy = (face.cy - (target.cy + target.diameter * FACE_DROP)) / target.diameter;
  const offset = cost(Math.hypot(dx, dy), CENTRE_TOLERANCE, OFFSET_BEYOND);

  const fill = face.width / target.diameter;
  const size =
    fill < FILL_IDEAL
      ? cost(FILL_IDEAL - fill, FILL_IDEAL - FILL_FAR, FILL_BEYOND)
      : cost(fill - FILL_IDEAL, FILL_NEAR - FILL_IDEAL, FILL_BEYOND);

  return clamp01(1 - Math.max(offset, size));
}

/**
 * Everything on screen except the ring, as one path.
 *
 * The screen rectangle and the ring's circle in a single `evenodd` fill:
 * the circle punches a hole rather than being painted over, so the camera
 * inside the ring is never dimmed.
 */
function outsideRing(width: number, height: number, target: GuideTarget): string {
  const r = target.diameter / 2;
  return [
    `M0 0H${width}V${height}H0Z`,
    `M${target.cx - r} ${target.cy}`,
    `a${r} ${r} 0 1 0 ${r * 2} 0`,
    `a${r} ${r} 0 1 0 ${-r * 2} 0`,
    'Z',
  ].join(' ');
}

/**
 * The world outside the ring, dimmed — and nothing else.
 *
 * Its own component because of where it has to sit: directly on the
 * camera, under the ghost of last month's photograph and under the
 * shutter flash. Layered above either one it would dim them too, and
 * both of them are things the person is meant to see clearly.
 */
export function RingScrim({
  target,
  lock,
}: {
  target: GuideTarget;
  /** The shared approach the FaceFrame publishes; read, never written. */
  lock: SharedValue<number>;
}) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();

  /*
    Off-target the world outside the ring is dimmed hardest: with nothing
    else on screen to look at, the lit circle is the instruction. It lifts
    as the head arrives, so a locked shot is framed against what is
    actually there rather than through a veil.
  */
  const scrimProps = useAnimatedProps(() => ({
    opacity: SCRIM_FAR - (SCRIM_FAR - SCRIM_LOCKED) * clamp01(lock.get()),
  }));

  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      accessible={false}>
      <AnimatedPath
        d={outsideRing(width, height, target)}
        fill={colors.photoScrim}
        fillRule="evenodd"
        animatedProps={scrimProps}
      />
    </Svg>
  );
}

export type FaceFrameHandle = {
  /** The latest face, or null when there is none. Cheap; call per frame. */
  update(face: FaceObservation | null): void;
  /** Whether the pose is held. Pins the approach while the hold runs. */
  setAligned(aligned: boolean): void;
  /** One beat on the ring, for the moment a frame is taken. */
  pulse(): void;
};

export function FaceFrame({
  ref,
  target,
  ringStroke = 3,
  lock,
  hold,
}: {
  ref?: Ref<FaceFrameHandle>;
  /** The ring: where the head goes, in the camera preview's coordinates. */
  target: GuideTarget;
  /**
   * The weight of the CaptureRing's own track, so this draws on the ring
   * rather than beside it. The two have to agree to the point: a circle
   * a point and a half out from the track is a second ring, which is the
   * whole of what went wrong before.
   */
  ringStroke?: number;
  /**
   * Where the approach is published, so the ring itself can answer on the
   * same beat. Shared rather than lifted into state: it is written at
   * camera rate. Its own when the caller does not care.
   */
  lock?: SharedValue<number> | null;
  /**
   * How far through the 600 ms hold the pose is, 0 to 1 — the same value
   * the ring's hold arc fills on. It carries the light the last of the
   * way, so arriving at lock is a rise rather than a switch. Without it
   * the component finishes the ring on `setAligned` alone.
   */
  hold?: SharedValue<number> | null;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const ownLock = useSharedValue(0);
  /** What the whole screen reads: the approach and the hold, together. */
  const level = lock ?? ownLock;
  /** Geometry's share, on a spring of its own. */
  const approach = useSharedValue(0);
  /** Whether the pose is held, for the case where there is no hold to read. */
  const held = useSharedValue(0);
  /** A single beat at the shutter, in weight and light, never in size. */
  const beat = useSharedValue(0);

  /*
    The two halves of the answer, kept on the JS side because they arrive
    from two different callbacks and each needs the other to write a value.
    `floor` is the framing that earned the hold, kept for as long as it
    lasts.
  */
  const latest = useRef({ proximity: 0, aligned: false, floor: 0, written: 0 });

  const write = useCallback(() => {
    const { proximity, aligned, floor } = latest.current;
    // A head the reducer has accepted does not dim because the detector
    // shrugged mid-hold: the framing that earned the hold is the floor
    // until the hold ends.
    const to = (aligned ? Math.max(proximity, floor) : proximity) * APPROACH_CEILING;
    const step = reduceMotion ? EPSILON_STILL : EPSILON;
    if (Math.abs(to - latest.current.written) < step) return;
    latest.current.written = to;
    // A spring rather than a timing: observations arrive unevenly, and a
    // spring retargeted mid-flight keeps its momentum where a timing curve
    // would restart on every frame and judder.
    approach.set(reduceMotion ? to : withSpring(to, motion.spring.snappy));
  }, [approach, reduceMotion]);

  /*
    The two halves, into the one number the rest of the screen reads.

    The hold closes the gap rather than adding to it, so wherever geometry
    got to, the ring finishes full — and the further through the hold it
    is, the less the head's own wobble can move it. Done here rather than
    in each reader so there is a single answer to "how lit is the ring",
    and the CaptureRing's segments and this glow can never disagree.

    Under Reduce Motion the hold is read as the switch it also is, not as
    a rise. The caller writes its hold value from a 60 ms timer and sets
    it raw for exactly these people, so reading it continuously would ramp
    a full-screen dimming layer through ten steps on every hold — screen
    -wide luminance movement asked for by nobody. Smoothing the geometry
    alone (SMOOTHING, EPSILON_STILL) does not cover this half.
  */
  useAnimatedReaction(
    () => {
      const base = clamp01(approach.get());
      const share = clamp01(hold && !reduceMotion ? hold.get() : held.get());
      return base + (1 - base) * share;
    },
    (next) => {
      level.set(next);
    },
    [approach, hold, held, level, reduceMotion],
  );

  useImperativeHandle(
    ref,
    () => ({
      update(face) {
        const seen = face ? headProximity(face, target) : 0;
        // A face that has gone clears the guide at once; a face that is
        // there is averaged with the ones before it, so a detector
        // wobbling by a percent does not move anything.
        latest.current.proximity = face
          ? latest.current.proximity + (seen - latest.current.proximity) * SMOOTHING
          : 0;
        write();
      },
      setAligned(aligned) {
        if (aligned === latest.current.aligned) return;
        latest.current.aligned = aligned;
        latest.current.floor = aligned ? latest.current.proximity : 0;
        // Only read when the caller has no hold to give: then this is the
        // whole of the last stretch, and it is a switch rather than a rise.
        held.set(aligned ? 1 : 0);
        write();
      },
      pulse() {
        if (reduceMotion) return;
        beat.set(1);
        beat.set(withTiming(0, { duration: motion.duration.slow }));
      },
    }),
    [target, write, beat, held, reduceMotion],
  );

  const neutral = colors.textOnPhoto;
  const accent = colors.accent;
  /** The CaptureRing's own circle, to the point: this draws on that. */
  const ringRadius = (target.diameter - ringStroke) / 2;

  /* A soft bloom behind the ring, gathering as the head comes in. */
  const haloProps = useAnimatedProps(() => ({
    opacity: clamp01(clamp01(level.get()) * HALO_OPACITY + beat.get() * HALO_BEAT),
  }));

  /*
    The ring's own edge, thickening and warming towards sage. Drawn on
    exactly the circle the CaptureRing's track sits on, and growing about
    that same centre line, so what the eye reads is one ring getting
    stronger — not a second one arriving.
  */
  const edgeProps = useAnimatedProps(() => {
    const l = clamp01(level.get());
    const b = beat.get();
    return {
      stroke: interpolateColor(l, [0, 1], [neutral, accent]),
      strokeWidth: EDGE_STROKE + l * EDGE_GAIN + b * EDGE_BEAT,
      opacity: clamp01(l + b * EDGE_BEAT_LIGHT),
    };
  });

  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      accessible={false}>
      <AnimatedCircle
        cx={target.cx}
        cy={target.cy}
        r={ringRadius + 3}
        stroke={accent}
        strokeWidth={HALO_STROKE}
        fill="none"
        animatedProps={haloProps}
      />
      <AnimatedCircle
        cx={target.cx}
        cy={target.cy}
        r={ringRadius}
        fill="none"
        strokeLinecap="round"
        animatedProps={edgeProps}
      />
    </Svg>
  );
}
