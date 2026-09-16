/**
 * The guide that follows the head.
 *
 * An oval drawn around the detected face, moving with it, and turning
 * sage the moment the head is framed and still. It is the only element
 * on the capture screen that answers "am I in the right place" — the
 * fixed ring says where to be, this says where you are — so it is kept
 * to one line and one colour change. Anything busier would compete with
 * the face it is meant to sit around.
 *
 * It is driven imperatively. Faces arrive at camera rate, and a React
 * render per frame would redraw the entire capture screen thirty times a
 * second for the sake of moving one ellipse. Instead the screen hands
 * each observation straight to shared values, and only the animation
 * thread does any work.
 *
 * Colours come from the theme — the ink-white for a face that is still
 * being lined up, the accent for one that is ready — so the overlay reads
 * as part of the app rather than as a scanner bolted onto it.
 */

import { useImperativeHandle, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Ellipse } from 'react-native-svg';

import { motion, useTheme } from '@/theme';

import type { FaceObservation, GuideTarget } from './head-guidance';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/**
 * The oval is drawn a little larger than the face box, because the box
 * stops at the brow and the ring is meant to hold the whole head. The
 * lift moves its centre up towards the hairline for the same reason.
 */
const OVAL_WIDTH = 0.64;
const OVAL_HEIGHT = 0.72;
const OVAL_LIFT = 0.06;

export type FaceFrameHandle = {
  /** The latest face, or null when there is none. Cheap; call per frame. */
  update(face: FaceObservation | null): void;
  /** Whether the head is framed and steady. Switches the colour. */
  setAligned(aligned: boolean): void;
  /** One beat of scale 1.06 → 1 on the oval, for the moment a frame is taken. */
  pulse(): void;
};

export function FaceFrame({
  ref,
  target,
}: {
  ref?: Ref<FaceFrameHandle>;
  /** Where the oval rests when no face is in view. */
  target: GuideTarget;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const cx = useSharedValue(target.cx);
  const cy = useSharedValue(target.cy);
  const rx = useSharedValue(target.diameter / 2);
  const ry = useSharedValue(target.diameter / 2);
  /** 0 hidden, 1 shown. */
  const presence = useSharedValue(0);
  /** 0 lining up, 1 aligned. */
  const tone = useSharedValue(0);
  /** A single beat at the shutter, multiplied into the radii below. */
  const pulseScale = useSharedValue(1);

  useImperativeHandle(
    ref,
    () => ({
      update(face) {
        if (face) {
          const toX = face.cx;
          const toY = face.cy - face.height * OVAL_LIFT;
          const toRx = face.width * OVAL_WIDTH;
          const toRy = face.height * OVAL_HEIGHT;
          if (reduceMotion) {
            cx.set(toX);
            cy.set(toY);
            rx.set(toRx);
            ry.set(toRy);
            presence.set(1);
            return;
          }
          // A spring rather than a timing: observations arrive unevenly,
          // and a spring retargeted mid-flight keeps its momentum where a
          // timing curve would restart and judder.
          cx.set(withSpring(toX, motion.spring.snappy));
          cy.set(withSpring(toY, motion.spring.snappy));
          rx.set(withSpring(toRx, motion.spring.snappy));
          ry.set(withSpring(toRy, motion.spring.snappy));
          presence.set(withTiming(1, { duration: motion.duration.fast }));
          return;
        }

        // No face: the oval fades and drifts home to the ring, so when a
        // face next appears it grows out of the place it should be.
        if (reduceMotion) {
          presence.set(0);
          return;
        }
        presence.set(withTiming(0, { duration: motion.duration.base }));
        cx.set(withSpring(target.cx, motion.spring.gentle));
        cy.set(withSpring(target.cy, motion.spring.gentle));
        rx.set(withSpring(target.diameter / 2, motion.spring.gentle));
        ry.set(withSpring(target.diameter / 2, motion.spring.gentle));
      },
      setAligned(aligned) {
        const to = aligned ? 1 : 0;
        tone.set(reduceMotion ? to : withTiming(to, { duration: motion.duration.base }));
      },
      pulse() {
        if (reduceMotion) return;
        pulseScale.set(1.06);
        pulseScale.set(withSpring(1, motion.spring.bouncy));
      },
    }),
    [cx, cy, rx, ry, presence, tone, pulseScale, reduceMotion, target],
  );

  const neutral = colors.textOnPhoto;
  const accent = colors.accent;

  const ovalProps = useAnimatedProps(() => ({
    cx: cx.get(),
    cy: cy.get(),
    // The radii carry the beat rather than a transform on the Svg: a
    // transform scales about the origin and would walk the oval off the
    // face; multiplying the radii keeps it centred where it is.
    rx: rx.get() * pulseScale.get(),
    ry: ry.get() * pulseScale.get(),
    stroke: interpolateColor(tone.get(), [0, 1], [neutral, accent]),
    strokeWidth: 2.5 + tone.get() * 1.5,
    opacity: presence.get() * 0.95,
  }));

  /*
    A soft halo on the fixed ring when everything lines up. It does not
    move; it is the ring acknowledging the head has arrived, which is a
    quieter signal than making the oval itself glow.
  */
  const haloProps = useAnimatedProps(() => ({
    opacity: tone.get() * presence.get() * 0.28,
  }));

  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      accessible={false}>
      <AnimatedEllipse
        cx={target.cx}
        cy={target.cy}
        rx={target.diameter / 2 + 5}
        ry={target.diameter / 2 + 5}
        stroke={accent}
        strokeWidth={12}
        fill="none"
        animatedProps={haloProps}
      />
      <AnimatedEllipse fill="none" strokeLinecap="round" animatedProps={ovalProps} />
    </Svg>
  );
}
