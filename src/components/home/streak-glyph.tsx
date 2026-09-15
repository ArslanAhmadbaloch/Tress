/**
 * The flame on the Streak tile.
 *
 * It used to be sage whenever the streak was alive, which made it the odd
 * one out beside the ink-black strand and camera glyphs. It is now ink
 * like its neighbours, and it earns colour only at the moment the day is
 * actually finished: every item in today's stack ticked off.
 *
 * That is the whole point of the amber. A tile that is coloured all the
 * time says nothing; a tile that changes the instant you finish is the
 * only reward this app offers for turning up, so it is worth animating
 * properly — a short spring, a halo that blooms and settles, and then
 * stillness. Not a loop that pulses at somebody forever.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme';

export function StreakGlyph({ complete }: { complete: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  // Drives the ink → amber crossfade and the halo.
  const lit = useSharedValue(complete ? 1 : 0);
  // Drives the one-off pop, separately, so the colour can settle while the
  // scale is still returning.
  const pop = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      lit.set(withTiming(complete ? 1 : 0, { duration: 200 }));
      pop.set(0);
      return;
    }
    lit.set(withTiming(complete ? 1 : 0, {
      duration: complete ? 420 : 260,
      easing: Easing.out(Easing.quad),
    }));
    if (complete) {
      pop.set(
        withSequence(
          withSpring(1, { damping: 9, stiffness: 190 }),
          withDelay(90, withSpring(0, { damping: 14, stiffness: 150 })),
        ),
      );
    } else {
      pop.set(withTiming(0, { duration: 180 }));
    }
  }, [complete, reduced, lit, pop]);

  const container = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.get() * 0.34 }, { rotate: `${pop.get() * 4}deg` }],
  }));

  const amber = useAnimatedStyle(() => ({ opacity: lit.get() }));
  const ink = useAnimatedStyle(() => ({ opacity: 1 - lit.get() }));

  const halo = useAnimatedStyle(() => ({
    opacity: lit.get() * (0.20 + pop.get() * 0.30),
    transform: [{ scale: 0.9 + lit.get() * 0.35 + pop.get() * 0.4 }],
  }));

  return (
    <Animated.View style={[{ width: 18, height: 18 }, container]}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: -9, right: -9, top: -9, bottom: -9,
            borderRadius: 18,
            backgroundColor: colors.warning,
          },
          halo,
        ]}
      />
      {/*
        Two glyphs crossfaded rather than one glyph with an animated
        colour: `Icon` takes a plain colour prop, and animating a colour
        string across the bridge is neither smooth nor cheap.
      */}
      <Animated.View style={[{ position: 'absolute' }, ink]}>
        <Icon name="flame" size={18} color={colors.text} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute' }, amber]}>
        <Icon name="flame" size={18} color={colors.warning} />
      </Animated.View>
      <View />
    </Animated.View>
  );
}
