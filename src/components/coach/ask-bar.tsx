/**
 * The Report tab's way in to Ask Tress.
 *
 * A pill drawn as an inert input, so it reads as "type here" before it is
 * tapped, plus three questions the record can answer today. The pill
 * opens the sheet empty; a chip opens it and asks that question at once.
 * The bar shows whether or not there is a record yet, because the
 * suggestions already change shape with what has been recorded.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { ASK_BAR_PLACEHOLDER, suggestedQuestions } from '@/features/coach';
import { useAppStore } from '@/store/app-store';
import { iconSize, useTheme } from '@/theme';

import { ChipRow } from './chip-row';

export function AskBar() {
  const { colors, spacing, radius, shadow } = useTheme();
  const router = useRouter();
  const { data } = useAppStore();

  const chips = useMemo(() => suggestedQuestions(data), [data]);

  return (
    <View>
      <PressableScale
        onPress={() => router.push('/ask')}
        accessibilityRole="button"
        accessibilityLabel="Ask Tress about your record"
        style={[
          {
            marginTop: spacing.sm,
            height: 52,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingLeft: spacing.lg,
            paddingRight: spacing.xs,
          },
          shadow.soft,
        ]}>
        <Icon name="comment" size={iconSize.md} color={colors.textSecondary} />
        <Text variant="callout" color="textTertiary" numberOfLines={1} style={{ flex: 1 }}>
          {ASK_BAR_PLACEHOLDER}
        </Text>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="arrowRight" size={iconSize.sm} color={colors.accent} />
        </View>
      </PressableScale>

      <View style={{ marginTop: spacing.sm }}>
        <ChipRow
          chips={chips}
          bleed={spacing.lg}
          onPick={(chip) => router.push({ pathname: '/ask', params: { q: chip.label } })}
        />
      </View>
    </View>
  );
}
