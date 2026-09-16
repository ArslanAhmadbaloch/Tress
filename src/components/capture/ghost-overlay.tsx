/**
 * Last time's photograph, faint, under this time's preview.
 *
 * The one thing that makes two photographs a month apart comparable is
 * that they were taken from the same place. Nobody can hold that in their
 * head, so the app holds it for them: the previous shot of this same
 * angle, at a third of its opacity, to line the new one up against.
 *
 * It is their own photograph and it is labelled as their own — "Last
 * time", with the date. Never "Before", which is half of a before-and-
 * after and would be promising the other half.
 *
 * No horizontal flip. Both cameras already mirror the file they save to
 * match the preview that composed it, so last month's file and this
 * month's preview are already in the same orientation; flipping here
 * would put them back out of step.
 */

import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

export function GhostOverlay({
  uri,
  visible,
  label,
  topInset,
}: {
  /** The previous photograph of this angle; a thumbnail is fine. */
  uri: string | null;
  visible: boolean;
  label: string;
  /** Where the label pill sits, under the top bar. */
  topInset: number;
}) {
  const { colors, radius, spacing } = useTheme();

  if (!uri || !visible) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* The opacity lives on the wrapper rather than on the image, so the
          fade and the ghost's own translucency compose instead of
          fighting over the same property. */}
      <Animated.View
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(160)}
        style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={false}
        />
      </Animated.View>

      <View
        style={{
          position: 'absolute',
          top: topInset,
          left: spacing.lg,
          paddingVertical: spacing.xs + 1,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          backgroundColor: colors.photoScrim,
        }}>
        <Text variant="caption" color="textOnPhoto">
          {label}
        </Text>
      </View>
    </View>
  );
}
