/**
 * One suggestion: the catalogue's drawing, the cut's name, the lengths
 * it is cut at, and the one line about it. A held card (a free reader,
 * past the first) blurs the drawing and shows shapes where the line
 * would be; the name stays, because a name is not a finding.
 *
 * Static apart from its arrival, which is a short rise gated on Reduce
 * Motion. The drawing is a bundled asset, never a frame from the scan.
 */

import { Image } from 'expo-image';
import { View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { HAIRSTYLE_COPY, type Hairstyle } from '@/features/hairstyles';
import { useTheme } from '@/theme';

import { HeldNote } from './held';

/** The drawing's side, in points. */
const ART = 112;
/** How far a held drawing is blurred; enough that the cut cannot be read. */
export const HELD_BLUR = 14;
/** The stagger between cards arriving together. */
const STAGGER_MS = 60;

/** "Short · Medium", from the catalogue's tags. */
export function lengthsLabel(style: Pick<Hairstyle, 'lengths'>): string {
  return style.lengths.map((l) => HAIRSTYLE_COPY.lengths[l]).join(' · ');
}

export function StyleCard({ style, held = false, order = 0 }: { style: Hairstyle; held?: boolean; order?: number }) {
  const { colors, radius, spacing, shadow } = useTheme();
  const reduceMotion = useReducedMotion();
  const lengths = lengthsLabel(style);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(360).delay(order * STAGGER_MS)}
      accessible
      accessibilityLabel={held ? HAIRSTYLE_COPY.a11y.held(style.name) : HAIRSTYLE_COPY.a11y.card(style.name, lengths, style.note)}
      style={[
        {
          flexDirection: 'row',
          gap: spacing.lg,
          padding: spacing.md,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
        },
        shadow.soft,
      ]}>
      <View
        style={{
          width: ART,
          height: ART,
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: colors.backgroundSubtle,
        }}>
        <Image
          source={style.image}
          contentFit="cover"
          transition={160}
          blurRadius={held ? HELD_BLUR : 0}
          accessible={false}
          style={{ width: '100%', height: '100%' }}
        />
        {held ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: spacing.sm,
              bottom: spacing.sm,
              width: 28,
              height: 28,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="lock" size={13} color={colors.textSecondary} />
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', gap: spacing.xs }}>
        <Text variant="headline">{style.name}</Text>
        <Text variant="caption" color="textTertiary">
          {lengths}
        </Text>
        {held ? (
          <HeldNote style={{ marginTop: spacing.xs }} />
        ) : (
          <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.xxs }}>
            {style.note}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
