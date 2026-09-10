import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { ProgressDots } from './ui/option-card';
import { PressableScale } from './ui/pressable-scale';
import { Text } from './ui/text';
import { useTheme } from '@/theme';

export const ONBOARDING_STEPS = 4;

/**
 * Shared frame for every onboarding question: back affordance, progress,
 * a large title, the answer area, and one pinned primary action.
 */
export function OnboardingStep({
  stepIndex,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  footnote,
}: {
  stepIndex: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  footnote?: string;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
        }}>
        {router.canGoBack() ? (
          <PressableScale
            onPress={() => router.back()}
            haptic="none"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.fill,
            }}>
            <Icon name="chevronLeft" size={17} color={colors.text} />
          </PressableScale>
        ) : (
          <View style={{ width: 36, height: 36 }} />
        )}

        <ProgressDots total={ONBOARDING_STEPS} index={stepIndex} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xxl,
          paddingBottom: spacing.xxl,
        }}
        keyboardShouldPersistTaps="handled">
        <Text variant="title1" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="callout"
            color="textSecondary"
            style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
            {subtitle}
          </Text>
        ) : (
          <View style={{ height: spacing.xl }} />
        )}

        {children}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
          paddingTop: spacing.sm,
          gap: spacing.sm,
          backgroundColor: colors.background,
        }}>
        <Button
          label={primaryLabel}
          onPress={onPrimary}
          disabled={primaryDisabled}
        />
        {footnote ? (
          <Text variant="caption" color="textTertiary" center>
            {footnote}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
