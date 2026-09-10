/**
 * Screen scaffolding, section headers and empty states — the pieces that
 * repeat on every screen and must not drift apart.
 */

import type { ReactNode } from 'react';
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';
import { Text } from './text';
import { useTheme } from '@/theme';

/** Height the tab bar occupies, so scroll views can clear it. */
const TAB_BAR_CLEARANCE = 96;

export function Screen({
  children,
  style,
  edges = ['top'],
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom')[];
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/**
 * Scrolling screen body. Adds bottom clearance for the floating tab bar
 * so the last card is never trapped underneath it.
 */
export function ScreenScroll({
  children,
  contentContainerStyle,
  clearsTabBar = true,
  ...rest
}: ScrollViewProps & { children: ReactNode; clearsTabBar?: boolean }) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      {...rest}
      contentContainerStyle={[
        {
          paddingHorizontal: spacing.lg,
          paddingBottom: clearsTabBar
            ? TAB_BAR_CLEARANCE + insets.bottom
            : spacing.xxl,
        },
        contentContainerStyle,
      ]}>
      {children}
    </ScrollView>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { spacing } = useTheme();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: spacing.xxl,
          marginBottom: spacing.md,
        },
        style,
      ]}>
      <Text
        variant="overline"
        color="textTertiary"
        accessibilityRole="header"
        style={{ textTransform: 'uppercase' }}>
        {title}
      </Text>

      {action && onAction ? (
        <PressableScale
          onPress={onAction}
          haptic="none"
          accessibilityRole="button"
          accessibilityLabel={action}>
          <Text variant="subhead" color="accent">
            {action}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** Large screen title, used at the top of each tab. */
export function ScreenTitle({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  const { spacing } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.lg,
        paddingTop: spacing.sm,
        paddingBottom: subtitle ? spacing.xs : spacing.sm,
      }}>
      <View style={{ flex: 1 }}>
        <Text variant="title1" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" color="textSecondary" style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: spacing.giant,
        paddingHorizontal: spacing.xl,
      }}>
      <View
        style={{
          width: 68,
          height: 68,
          borderRadius: radius.lg,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.lg,
        }}>
        <Icon name={icon} size={28} color={colors.accent} />
      </View>

      <Text variant="title3" center>
        {title}
      </Text>
      <Text
        variant="callout"
        color="textSecondary"
        center
        style={{ marginTop: spacing.sm, maxWidth: 300 }}>
        {body}
      </Text>

      {actionLabel && onAction ? (
        <PressableScale
          onPress={onAction}
          style={{
            marginTop: spacing.xl,
            paddingHorizontal: spacing.xxl,
            paddingVertical: spacing.md,
            borderRadius: 999,
            backgroundColor: colors.accent,
          }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}>
          <Text variant="headline" color="textOnAccent">
            {actionLabel}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** Divider used inside grouped lists. */
export function Separator({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: 1,
        backgroundColor: colors.separator,
        marginLeft: inset,
      }}
    />
  );
}

export { TAB_BAR_CLEARANCE };
