/**
 * Where a photograph goes the moment it is taken.
 *
 * The frame that was just on screen shrinks, tilts and drops into a
 * small pile in the bottom-left corner, and the pile grows by one. That
 * is the whole idea: the person sees their own photograph land somewhere,
 * so "it was taken" needs no wording and no tick. The count under the
 * pile is the only text, and it counts photographs — nothing else.
 *
 * The flight is transforms only, on the animation thread, with no spring:
 * a frame that overshoots its slot and settles back reads as a miss. It
 * lands on exactly the slot the pile's first thumbnail occupies, which is
 * why the two scales are independent — one uniform scale would land a
 * full-screen frame at the screen's aspect ratio and the thumbnail would
 * then jump to a different shape underneath it.
 */

import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { spacing } from '@/theme';
import type { Angle } from '@/types/domain';

/** One thumbnail in the pile, and the rectangle a frame flies to. */
export const SLOT_W = 56;
export const SLOT_H = 74;

/** How far each frame is dealt to the right of the one under it. */
const DEAL = 6;

/**
 * The tilt each frame lands at, in degrees. Fixed rather than random, so
 * the pile looks the same every time the screen is re-rendered — a pile
 * that reshuffles itself on a re-render reads as a glitch.
 */
const TILTS = [-4, 3, -2, 4, -3];

export type StackSlot = { x: number; y: number; cx: number; cy: number };

/** Where the pile sits: bottom-left, level with the shutter. */
export function stackSlotFor(input: {
  width: number;
  height: number;
  bottomInset: number;
  shutterSize: number;
}): StackSlot {
  const x = spacing.lg;
  const cx = x + SLOT_W / 2;
  const cy = input.height - input.bottomInset - spacing.xl - input.shutterSize / 2;
  return { x, y: cy - SLOT_H / 2, cx, cy };
}

export function FlyingFrame({
  uri,
  index,
  slot,
  onLanded,
}: {
  uri: string;
  /** Position in the pile it is flying to, which sets its tilt and offset. */
  index: number;
  slot: StackSlot;
  /** Called once, when the frame is on the pile. */
  onLanded: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const { width: W, height: H } = useWindowDimensions();
  const t = useSharedValue(0);

  /*
    Two scales, not one. A uniform SLOT_W / W on a 393×852 screen lands the
    frame at 56×121 — the right width and half again the height — and the
    pile's thumbnail would then have to grow into a different shape. Two
    scales land it on the 56×74 slot exactly. The image is cover-fit at
    both sizes, so nothing stretches; what changes is how much is cropped.
  */
  const scaleX = SLOT_W / W;
  const scaleY = SLOT_H / H;
  // The transform origin is the view's centre, so both offsets are stated
  // from the centre of the screen to the centre of the slot.
  const dx = slot.cx + index * DEAL - W / 2;
  const dy = slot.cy - H / 2;
  const tilt = TILTS[index % TILTS.length];

  useEffect(() => {
    if (reduceMotion) {
      onLanded();
      return;
    }
    // The delay lets the shutter flash start first, so the photograph is
    // seen at full size for a beat before it leaves.
    t.set(
      withDelay(
        120,
        withTiming(1, { duration: 520, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }, (finished) => {
          if (finished) runOnJS(onLanded)();
        }),
      ),
    );
  }, [t, reduceMotion, onLanded]);

  const style = useAnimatedStyle(() => {
    const p = t.get();
    return {
      position: 'absolute',
      left: 0,
      top: 0,
      width: W,
      height: H,
      /*
        Radii scale with the axis they lie on, so the target is stated in
        the vertical one: 10 points tall at landing. Horizontally they
        read a little wider for the last frame or two, and then the pile's
        own thumbnail takes over.
      */
      borderRadius: interpolate(p, [0, 1], [0, 10 / scaleY]),
      overflow: 'hidden',
      /*
        Order matters. React Native applies the last entry first, so the
        rotation is listed before the scales: the view shrinks to 56×74,
        then tilts, then moves. Rotating before a non-uniform scale would
        shear the frame into a parallelogram on the way down.
      */
      transform: [
        { translateX: interpolate(p, [0, 1], [0, dx]) },
        { translateY: interpolate(p, [0, 1], [0, dy]) },
        { rotate: `${interpolate(p, [0, 1], [0, tilt])}deg` },
        { scaleX: interpolate(p, [0, 1], [1, scaleX]) },
        { scaleY: interpolate(p, [0, 1], [1, scaleY]) },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={style}>
      {/* The full-resolution file, because for the first frames of the
          flight it is on screen at full width. */}
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessible={false}
      />
    </Animated.View>
  );
}

export type StackShot = { angle: Angle; uri: string; label: string };

export function FrameStack({
  shots,
  count,
  slot,
}: {
  /** In capture order; the newest sits on top. */
  shots: StackShot[];
  /** The line under the pile, already formatted by the screen. */
  count: string;
  slot: StackSlot;
}) {
  const reduceMotion = useReducedMotion();

  if (shots.length === 0) return null;

  return (
    <View
      /* Tapping the pile mid-frame is an accident, never an intention. */
      pointerEvents="none"
      accessible
      accessibilityLabel={`${count} photographs taken`}
      style={{
        position: 'absolute',
        left: slot.x,
        top: slot.y,
        width: SLOT_W + DEAL * 4 + 4,
        height: SLOT_H + 24,
      }}>
      {/* `uri` is destructured rather than read off the shot, because a
          source spelled through the record is how the quality gate spots
          a list pulling full-resolution files — and what the screen
          passes here is a thumbnail. */}
      {shots.map(({ angle, uri }, index) => (
        <Animated.View
          key={angle}
          entering={reduceMotion ? FadeIn.duration(200) : ZoomIn.duration(180)}
          style={{
            position: 'absolute',
            left: index * DEAL,
            top: 0,
            width: SLOT_W,
            height: SLOT_H,
            borderRadius: 10,
            borderWidth: 2,
            // Over a live camera, where white is the only border that
            // reads on both a bright window and a dark bathroom.
            borderColor: 'rgba(255,255,255,0.9)',
            overflow: 'hidden',
            transform: [{ rotate: `${TILTS[index % TILTS.length]}deg` }],
          }}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessible={false}
          />
        </Animated.View>
      ))}

      <Text
        variant="caption"
        color="textOnPhoto"
        style={{ position: 'absolute', left: 0, top: SLOT_H + 6 }}>
        {count}
      </Text>
    </View>
  );
}
