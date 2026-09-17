/**
 * The page and its furniture.
 *
 *   FunnelPage   the cream ground with the faint sage light top-left
 *                where the orb sits, safe areas, a scroll, the round
 *                back button and a slot for the bottom bar
 *   BackButton   a round white button holding a chevron and nothing else
 *   ContinueBar  the pill at the foot of a page: white and muted until
 *                there is something to continue with, then the accent;
 *                an optional white pill beneath it for the quiet way out
 *
 * There is no progress bar. The reference has none, and a bar counting
 * eighteen questions is a reason to stop answering them.
 *
 * Copy comes in through props; the only words this file owns are what
 * the screen reader calls the back button.
 */

import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { MIN_TOUCH_TARGET, splitAlpha, useTheme, withZeroAlpha } from '@/theme';

/** The round back button. */
const BACK = MIN_TOUCH_TARGET;
/** The primary pill. Room above and below the label, not just a hit target. */
const BAR_HEIGHT = 56;
/** The fade above the bottom bar, so content scrolling under it goes quiet. */
const FADE = 44;

/* ------------------------------- back button ------------------------------ */

export function BackButton({
  onPress,
  accessibilityLabel = 'Back',
}: {
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors, shadow } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={[
        {
          width: BACK,
          height: BACK,
          borderRadius: BACK / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
        },
        shadow.soft,
      ]}>
      <Icon name="chevronLeft" size={17} color={colors.text} />
    </PressableScale>
  );
}

/* ------------------------------- continue bar ----------------------------- */

export function ContinueBar({
  label,
  enabled,
  onPress,
  secondary,
  accessibilityHint,
}: {
  label: string;
  enabled: boolean;
  onPress: () => void;
  secondary?: { label: string; onPress: () => void };
  accessibilityHint?: string;
}) {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      {/*
        Not `disabled`: PressableScale dims a disabled control to forty
        percent, and the reference's greyed pill is a white pill at full
        strength with a muted label. So the press, its haptic and its
        shrink are switched off by hand until there is something to
        continue with, and the screen reader is told the same.
      */}
      <PressableScale
        onPress={enabled ? onPress : undefined}
        haptic={enabled ? 'light' : 'none'}
        scaleTo={enabled ? 0.975 : 1}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !enabled }}
        style={[
          {
            height: BAR_HEIGHT,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.xxl,
            backgroundColor: enabled ? colors.accent : colors.surface,
          },
          enabled ? null : shadow.soft,
        ]}>
        <Text variant="headline" color={enabled ? 'textOnAccent' : 'textTertiary'}>
          {label}
        </Text>
      </PressableScale>

      {secondary ? (
        <PressableScale
          onPress={secondary.onPress}
          scaleTo={0.975}
          accessibilityRole="button"
          accessibilityLabel={secondary.label}
          style={[
            {
              height: BAR_HEIGHT,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: spacing.xxl,
              backgroundColor: colors.surface,
            },
            shadow.soft,
          ]}>
          <Text variant="headline">{secondary.label}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/* --------------------------------- page ---------------------------------- */

/**
 * The faint light in the top-left corner, where the orb sits beside its
 * bubble. Barely there: it is what makes the corner feel inhabited
 * rather than a decoration in its own right.
 */
function CornerGlow() {
  const { colors } = useTheme();
  const near = splitAlpha(colors.tabGlow);
  const far = splitAlpha(colors.accentSoft);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="xMidYMin slice">
        <Defs>
          <RadialGradient id="funnelCorner" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={near.color} stopOpacity={0.55 * near.opacity} />
            <Stop offset="0.5" stopColor={far.color} stopOpacity={0.35 * far.opacity} />
            <Stop offset="1" stopColor={far.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={8} cy={40} r={58} fill="url(#funnelCorner)" />
      </Svg>
    </View>
  );
}

export function FunnelPage({
  children,
  back,
  bottom,
  centred = false,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  /** Shows the round back button when given. */
  back?: () => void;
  /** Pinned beneath the content — usually a ContinueBar. */
  bottom?: ReactNode;
  /** Centres the content vertically, for the pages between questions. */
  centred?: boolean;
  /** Off for a page that lays itself out to the viewport. */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const content = [
    {
      paddingTop: insets.top + (back ? BACK + spacing.xxl + spacing.lg : spacing.huge),
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxxl,
      gap: spacing.md,
    },
    centred ? { flexGrow: 1, justifyContent: 'center' as const } : null,
    contentStyle,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <CornerGlow />

      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content]}>{children}</View>
      )}

      {back ? (
        <View
          style={{
            position: 'absolute',
            top: insets.top + spacing.md,
            left: spacing.xl,
          }}>
          <BackButton onPress={back} />
        </View>
      ) : null}

      {bottom ? (
        <View>
          <LinearGradient
            pointerEvents="none"
            colors={[withZeroAlpha(colors.background), colors.background]}
            style={{ position: 'absolute', top: -FADE, left: 0, right: 0, height: FADE }}
          />
          <View
            style={{
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.sm,
              paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xs,
              backgroundColor: colors.background,
            }}>
            {bottom}
          </View>
        </View>
      ) : null}
    </View>
  );
}
