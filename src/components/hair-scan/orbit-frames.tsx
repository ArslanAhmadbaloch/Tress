/**
 * The captured frames, in orbit around the main one.
 *
 * When the first bar fills, the other curated frames fade in at the
 * centre, scale up and glide out to their places on a ring around the
 * main frame, settle, and each receives a tick once the device has a
 * reading for it. At the end they glide back in and hand the screen to
 * the report. Slow enough to read, spatial, never wild: everything is one
 * eased glide plus a soft spring on the scale, and the only thing that
 * repeats is a drift of a few points so the ring does not look pinned.
 *
 * The ring's geometry and its timing are pure functions that live in
 * `features/hair-scan/analysis.ts`, next to the runner they are timed
 * against, so the tests can hold them without a renderer. They are
 * re-exported here under the same names for the screen.
 *
 * A frame that carries the mesh the live camera had at its shutter shows
 * it faintly — the outline, the cap and the features, not the face grid,
 * which at this size is a haze — laid into the thumbnail by the same
 * cover-fit rule the picture is drawn by. No lit points: at a thumbnail
 * they would clutter, and the main still already has them.
 *
 * Nothing here is a photograph the person is asked to look at. These are
 * the frames the scan kept, shown as objects the device is working on.
 * A tick means "measured": the device has a reading for the frame. A
 * frame the device finished with and could not read gets no tick, dims a
 * little, and says so to a screen reader. Neither says anything about
 * the hair.
 *
 * Reduced Motion: frames appear in place with a short fade, the tick
 * appears rather than springs, and nothing drifts.
 */

import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Icon } from '@/components/ui/icon';
import {
  ORBIT_CONVERGE_MS,
  ORBIT_CONVERGE_STAGGER_MS,
  ORBIT_ENTER_MS,
  ORBIT_FRAME_MAX,
  ORBIT_STAGGER_MS,
  orbitFrameSize,
  orbitPositions,
  type OrbitPosition,
} from '@/features/hair-scan/analysis';
import { meshInBox } from '@/features/hair-scan/engine';
import type { StillMesh } from '@/features/hair-scan/types';
import { darkColors, motion, radius, splitAlpha } from '@/theme';

import { StaticHairMesh } from './hair-mesh';

export {
  HANDOFF_HOLD_MS,
  ORBIT_CONVERGE_MS,
  ORBIT_CONVERGE_STAGGER_MS,
  ORBIT_ENTER_MS,
  ORBIT_FRAME_MAX,
  ORBIT_FRAME_MIN,
  ORBIT_SETTLE_HOLD_MS,
  ORBIT_STAGGER_MS,
  handoffSchedule,
  orbitConvergeMs,
  orbitFrameSize,
  orbitPositions,
  orbitReadyMs,
  orbitSettleMs,
  type OrbitPosition,
} from '@/features/hair-scan/analysis';

/* ------------------------------ metrics ------------------------------- */

/** The widest a frame in orbit is drawn; the screen sizes its ring from this. */
export const ORBIT_FRAME_W = ORBIT_FRAME_MAX;
export const ORBIT_FRAME_H = ORBIT_FRAME_MAX;

/** The slow drift each settled frame makes, in points and per half-cycle. */
const DRIFT_PX = 3;
const DRIFT_MS = 2600;

/** Where a frame starts and ends: a little inside the centre, small. */
const CENTRE_SCALE = 0.35;

/** The room the light needs around a frame, as a fraction of its side. */
const FRAME_HALO_RATIO = 0.55;
/** The tick badge beneath a frame, and the gap between them. */
const TICK = 24;
const TICK_GAP = 6;
/** A frame the device finished with and could not read sits back a little. */
const UNREAD_OPACITY = 0.55;
/** How strongly the mesh is drawn on a frame in orbit: a trace, not a feature. */
const THUMB_MESH_STRENGTH = 0.6;

/* -------------------------------- halo -------------------------------- */

/**
 * A soft white light behind a frame or the disc.
 *
 * Drawn rather than a shadow, because Android's elevation shadow is
 * black and iOS's white shadow does not read on black. A radial gradient
 * from a faint white to nothing is the same light on both.
 */
export function Halo({
  size,
  strength = 1,
}: {
  size: number;
  /** 0–1, scales the light's peak alpha. */
  strength?: number;
}) {
  const glint = splitAlpha(darkColors.orbGlint);
  const half = size / 2;
  return (
    <Svg width={size} height={size} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={glint.color} stopOpacity={glint.opacity * strength} />
          <Stop offset="45%" stopColor={glint.color} stopOpacity={glint.opacity * strength * 0.45} />
          <Stop offset="100%" stopColor={glint.color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={half} cy={half} r={half} fill="url(#halo)" />
    </Svg>
  );
}

/* -------------------------------- frames ------------------------------ */

export type OrbitFrame = {
  id: string;
  /** The captured file. Decoded at thumbnail size by expo-image. */
  uri: string;
  /** Read to screen readers; never drawn. */
  label: string;
  /** The mesh the live camera had at this frame's shutter, drawn faintly over it. */
  mesh?: StillMesh;
};

export type OrbitPhase =
  /** Before the first bar has filled: nothing drawn. */
  | 'hidden'
  /** Frames glide out and hold. */
  | 'orbit'
  /** Frames glide back into the centre. */
  | 'converge';

/** What the device has to say about one frame in orbit. */
type FrameStanding =
  /** Still being read, or not yet reached. */
  | 'pending'
  /** Finished with, and it carries a reading: the tick. */
  | 'measured'
  /** Finished with, and it could not be read: no tick, said out loud. */
  | 'unread';

function OrbitFrameView({
  frame,
  index,
  position,
  size,
  phase,
  standing,
  leadMs,
}: {
  frame: OrbitFrame;
  index: number;
  position: OrbitPosition;
  size: number;
  phase: OrbitPhase;
  standing: FrameStanding;
  leadMs: number;
}) {
  const reduceMotion = useReducedMotion();
  /** 0 at the centre, 1 in orbit. */
  const enter = useSharedValue(0);
  /** The frame's own size; springs so the arrival settles. */
  const scale = useSharedValue(CENTRE_SCALE);
  const opacity = useSharedValue(0);
  /** 0 → 1 → 0 → …, the slow drift once settled. */
  const drift = useSharedValue(0);
  const tick = useSharedValue(0);
  /** 1 while the device may still read it; lower once it could not. */
  const presence = useSharedValue(1);

  useEffect(() => {
    if (phase === 'hidden') return;
    if (phase === 'orbit') {
      if (reduceMotion) {
        enter.set(1);
        scale.set(1);
        opacity.set(withTiming(1, { duration: motion.duration.base }));
        return;
      }
      const delay = leadMs + index * ORBIT_STAGGER_MS;
      enter.set(
        withDelay(delay, withTiming(1, { duration: ORBIT_ENTER_MS, easing: Easing.out(Easing.cubic) })),
      );
      scale.set(withDelay(delay, withSpring(1, motion.spring.gentle)));
      opacity.set(withDelay(delay, withTiming(1, { duration: ORBIT_ENTER_MS * 0.55 })));
      drift.set(
        withDelay(
          delay + ORBIT_ENTER_MS,
          withRepeat(withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.sin) }), -1, true),
        ),
      );
      return;
    }
    // Converge. Together rather than one by one, so it reads as a gather.
    const delay = reduceMotion ? 0 : index * ORBIT_CONVERGE_STAGGER_MS;
    drift.set(0);
    if (reduceMotion) {
      opacity.set(withTiming(0, { duration: motion.duration.base }));
      return;
    }
    enter.set(
      withDelay(delay, withTiming(0, { duration: ORBIT_CONVERGE_MS, easing: Easing.in(Easing.cubic) })),
    );
    scale.set(withDelay(delay, withTiming(CENTRE_SCALE, { duration: ORBIT_CONVERGE_MS })));
    opacity.set(withDelay(delay + ORBIT_CONVERGE_MS * 0.4, withTiming(0, { duration: ORBIT_CONVERGE_MS * 0.6 })));
  }, [phase, index, leadMs, reduceMotion, enter, scale, opacity, drift]);

  useEffect(() => {
    if (standing === 'pending') return;
    // The mark waits for the frame to arrive: a mark landing on a frame
    // still in flight reads as a mistake. A frame that has not left the
    // centre yet is still waiting out its lead and stagger.
    const t = enter.get();
    const wait = reduceMotion
      ? 0
      : (t === 0 ? leadMs + index * ORBIT_STAGGER_MS : 0) + Math.max(0, (1 - t) * ORBIT_ENTER_MS) + 120;
    if (standing === 'measured') {
      tick.set(
        reduceMotion
          ? withTiming(1, { duration: motion.duration.fast })
          : withDelay(wait, withSpring(1, motion.spring.bouncy)),
      );
      return;
    }
    presence.set(withDelay(wait, withTiming(UNREAD_OPACITY, { duration: motion.duration.slow })));
  }, [standing, reduceMotion, tick, presence, enter, leadMs, index]);

  const style = useAnimatedStyle(() => {
    const t = enter.get();
    const dy = interpolate(drift.get(), [0, 1], [-DRIFT_PX, DRIFT_PX]);
    return {
      opacity: opacity.get() * presence.get(),
      transform: [
        { translateX: position.x * t },
        { translateY: position.y * t + dy },
        { scale: scale.get() },
      ],
    };
  });

  const tickStyle = useAnimatedStyle(() => ({
    opacity: tick.get(),
    transform: [{ scale: tick.get() }],
  }));

  const halo = Math.round(size * FRAME_HALO_RATIO);
  const box = size + halo * 2;
  const { uri, mesh } = frame;
  const meshFace = useMemo(
    () => (mesh ? meshInBox(mesh.face, mesh.still, { width: size, height: size }) : null),
    [mesh, size],
  );
  const spoken =
    standing === 'measured'
      ? `${frame.label}, measured`
      : standing === 'unread'
        ? `${frame.label}, no reading`
        : frame.label;

  return (
    <Animated.View
      pointerEvents="none"
      accessible
      accessibilityLabel={spoken}
      style={[
        {
          position: 'absolute',
          left: -box / 2,
          top: -box / 2,
          width: box,
          height: box,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      <Halo size={box} strength={0.7} />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: darkColors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: darkColors.glassBorder,
        }}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        {meshFace !== null ? (
          <StaticHairMesh
            face={meshFace}
            width={size}
            height={size}
            strength={THUMB_MESH_STRENGTH}
            sparse
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </View>
      {/* The tick sits beneath the frame, centred, as a badge of its own. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: (box - TICK) / 2,
            top: (box + size) / 2 + TICK_GAP,
            width: TICK,
            height: TICK,
            borderRadius: TICK / 2,
            backgroundColor: darkColors.success,
            alignItems: 'center',
            justifyContent: 'center',
          },
          tickStyle,
        ]}>
        <Icon name="check" size={13} color={darkColors.textOnAccent} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The ring. Renders nothing while hidden, so the first bar's screen pays
 * nothing for it; mounts the frames when the orbit begins and keeps them
 * mounted through the converge so their exit is theirs to animate.
 *
 * Place this inside a zero-size view at the ring's centre.
 */
export function OrbitFrames({
  frames,
  radius: ringRadius,
  phase,
  tickedIds,
  finishedIds = tickedIds,
  leadMs = 0,
}: {
  /** Every curated frame except the main one, in reading order. */
  frames: readonly OrbitFrame[];
  radius: number;
  phase: OrbitPhase;
  /** Frames the device has a reading for. These get the tick. */
  tickedIds: readonly string[];
  /**
   * Frames the device has finished with, readable or not. One in here
   * and not in `tickedIds` could not be read, and is shown as such.
   * Defaults to `tickedIds`, so a caller that tracks only readings is
   * not wrong, merely less informative.
   */
  finishedIds?: readonly string[];
  /** How long the first frame waits before leaving the centre. */
  leadMs?: number;
}) {
  if (phase === 'hidden' || frames.length === 0) return null;
  const positions = orbitPositions(frames.length, ringRadius);
  const size = orbitFrameSize(frames.length, ringRadius);
  return (
    <View pointerEvents="none" style={{ width: 0, height: 0 }}>
      {frames.map((frame, index) => (
        <OrbitFrameView
          key={frame.id}
          frame={frame}
          index={index}
          position={positions[index]}
          size={size}
          phase={phase}
          standing={
            tickedIds.includes(frame.id) ? 'measured' : finishedIds.includes(frame.id) ? 'unread' : 'pending'
          }
          leadMs={leadMs}
        />
      ))}
    </View>
  );
}
