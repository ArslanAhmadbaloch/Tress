/**
 * The cue line — one sentence near the bottom of the video.
 *
 * The engine decides what a person should do next: come closer, hold
 * still, find more light. This shows that one sentence on a dark plate,
 * cross-fading when it changes so the plate reads as a single voice
 * changing its mind rather than a stack of notices. While the scan runs
 * the voice says one thing only — move slowly — because the ring is
 * already saying everything else.
 *
 * Nothing here decides anything and nothing here counts anything; it is
 * a caption on an instrument.
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { HAIR_SCAN_COPY } from '@/features/hair-scan/copy';
import { darkColors, motion, radius, spacing } from '@/theme';

export type GuidanceProps = {
  /**
   * The cue to show, from `HAIR_SCAN_COPY.cue`. `null` hides the plate
   * before the scan — a screen with nothing to ask should not show an
   * empty plate asking it — and during the scan lets the plate fall back
   * to the scanning line.
   */
  cue: string | null;
  /** True while the machine runs: with no cue, the plate holds the scanning line. */
  scanning: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Guidance({ cue, scanning, style }: GuidanceProps) {
  const line = cue ?? (scanning ? HAIR_SCAN_COPY.scanning.hint : null);

  return (
    <View
      pointerEvents="none"
      style={[{ alignItems: 'center', minHeight: 64, justifyContent: 'center' }, style]}>
      {line ? (
        <Animated.View
          key={line}
          entering={FadeIn.duration(motion.duration.base)}
          exiting={FadeOut.duration(motion.duration.fast)}
          layout={LinearTransition.springify().damping(24).stiffness(220)}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          style={{
            backgroundColor: darkColors.photoScrim,
            borderRadius: radius.lg,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            maxWidth: 320,
          }}>
          <Text variant="headline" center style={{ color: darkColors.textOnPhoto }}>
            {line}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
