/**
 * The honest state: the analysis did not run on this scan.
 *
 * The model's line, and a way to take another scan. No figure, no bar,
 * no observation, no paragraph from the coach — because there is nothing
 * behind any of them. The failure modes are real and ordinary: a build
 * with no segmenter in it, a turn that kept too few frames, a face the
 * tracker never held. What none of them licenses is a report that looks
 * like the measured one with the numbers left out, or a sentence about
 * which part of the machinery did not start. A reader is owed the fact
 * and the next step; the diagnostics belong in the log.
 *
 * The screen draws this in place of the whole measured half — the
 * assessment, the map, the cards, the comparison — never beside it.
 */

import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { iconSize, useTheme } from '@/theme';

export function UnavailableBlock({
  unavailable,
  onRescan,
}: {
  /** The model's own words for a scan it could not read. */
  unavailable: { title: string; body: string; cta: string };
  onRescan?: () => void;
}) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        gap: spacing.sm,
      }}>
      <Icon name="info" size={iconSize.xl} color={colors.textTertiary} />
      <Text variant="title3" center accessibilityRole="header">
        {unavailable.title}
      </Text>
      <Text variant="footnote" color="textSecondary" center>
        {unavailable.body}
      </Text>
      {onRescan ? (
        <Button
          label={unavailable.cta}
          variant="secondary"
          size="md"
          icon="retake"
          onPress={onRescan}
          style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
        />
      ) : null}
    </View>
  );
}
