/**
 * What the funnel sits in.
 *
 * It used to be drifting palm fronds — pretty, and wrong for the job. A
 * question screen is a sentence somebody is reading and a set of options
 * they are weighing, and anything moving behind that is something to look
 * at instead. The apps that do this well in this category all sit their
 * funnels on near-flat ground for exactly that reason.
 *
 * So: a still, very soft vertical wash, warm at the top where the heading
 * sits and settling to the page colour by the middle. It gives the screen
 * somewhere to start without giving the eye anywhere to wander.
 *
 * The colour is Tress's own cream and sage, not borrowed. The stillness
 * is the part that was borrowed.
 *
 * Nothing here is interactive and nothing announces itself.
 */

import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme, withZeroAlpha } from '@/theme';

export function FunnelAmbience() {
  const { colors } = useTheme();

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/*
        Two washes rather than one. A single gradient over the whole
        screen leaves a visible band where it ends; a warm one falling
        away by 45% and a faint sage one rising from the bottom meet in
        the middle with nothing to see.
      */}
      <LinearGradient
        colors={[colors.accentSoft, withZeroAlpha(colors.accentSoft)]}
        locations={[0, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%' }}
      />
      <LinearGradient
        colors={[withZeroAlpha(colors.accentSoft), colors.accentSoft]}
        locations={[0, 1]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28%', opacity: 0.6 }}
      />
    </View>
  );
}
