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

import { LinearGradient } from 'expo-linear-gradient';

import { Ground, type GroundVariant } from './ground';
import { Icon, type IconName } from './icon';
import { Sprout } from './motion';
import { PressableScale } from './pressable-scale';
import { Text } from './text';
import { Wordmark } from './wordmark';
import { useTheme, withZeroAlpha } from '@/theme';

/** Height the tab bar occupies, so scroll views can clear it. */
const TAB_BAR_CLEARANCE = 106;

/** Extra room a floating control bar needs above the tab bar. */
const FLOATING_BAR_CLEARANCE = 78;

export function Screen({
  children,
  style,
  edges = ['top'],
  ground = 'stone',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom')[];
  /** Which background plate this screen sits on. */
  ground?: GroundVariant;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Ground variant={ground}>
      <View
        style={[
          {
            flex: 1,
            paddingTop: edges.includes('top') ? insets.top : 0,
            paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
          },
          style,
        ]}>
        {children}
      </View>
    </Ground>
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
  clearsFloatingBar = false,
  ...rest
}: ScrollViewProps & {
  children: ReactNode;
  clearsTabBar?: boolean;
  /** Reserve room for a FloatingBar so content can scroll clear of it. */
  clearsFloatingBar?: boolean;
}) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const bottom = clearsTabBar
    ? TAB_BAR_CLEARANCE + insets.bottom + (clearsFloatingBar ? FLOATING_BAR_CLEARANCE : 0)
    : spacing.xxl;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      {...rest}
      contentContainerStyle={[
        { paddingHorizontal: spacing.lg, paddingBottom: bottom },
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
      {/*
        Title-style capitalisation, not all-caps. The system refresh moved
        list and form section headers to title case for legibility, and a
        screen that keeps shouting its headers reads as pre-refresh.
      */}
      {/*
        Ink, not grey. A section header is a heading — it names the block
        under it — and a grey heading reads as a caption about the block
        instead. The muted tone belongs to supporting copy, not structure.
      */}
      <Text
        variant="headline"
        accessibilityRole="header"
        numberOfLines={1}
        style={{ flexShrink: 1, marginRight: spacing.md }}>
        {title}
      </Text>

      {action && onAction ? (
        <PressableScale
          onPress={onAction}
          haptic="none"
          accessibilityRole="button"
          accessibilityLabel={action}
          style={{ flexShrink: 0 }}>
          <Text variant="subhead" color="accent">
            {action}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/**
 * Editorial page title.
 *
 * `eyebrow` is the small tracked label above; `title` and `titleMuted` set
 * the two-tone headline, where the second line drops to grey so the phrase
 * reads as one sentence with an emphasis rather than two headings. `script`
 * is the decorative accent, capped at one per screen.
 */
export function ScreenTitle({
  eyebrow,
  eyebrowTone = 'muted',
  title,
  titleMuted,
  subtitle,
  script,
  trailing,
}: {
  eyebrow?: string;
  /** 'brand' renders the animated sage wordmark instead of a grey label. */
  eyebrowTone?: 'muted' | 'brand';
  title: string;
  titleMuted?: string;
  subtitle?: string;
  script?: string;
  trailing?: ReactNode;
}) {
  const { spacing } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: subtitle ? spacing.xs : spacing.sm,
      }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          eyebrowTone === 'brand' ? (
            <Wordmark label={eyebrow} />
          ) : (
            <Text
              variant="caption"
              color="textTertiary"
              style={{ letterSpacing: 2, marginBottom: spacing.xs }}>
              {eyebrow.toUpperCase()}
            </Text>
          )
        ) : null}

        {/*
          Two single-line texts rather than one two-line text. On iOS a
          wrapping text wraps before it shrinks, so a long first line broke
          mid-phrase and pushed the muted line out; a single line shrinks
          reliably. VoiceOver hears the pair as one heading.
        */}
        <Text
          variant="title1"
          accessibilityRole="header"
          accessibilityLabel={titleMuted ? `${title} ${titleMuted}` : undefined}
          adjustsFontSizeToFit
          minimumFontScale={0.66}
          numberOfLines={1}>
          {title}
        </Text>
        {titleMuted ? (
          <Text
            variant="title1"
            color="textTertiary"
            accessible={false}
            adjustsFontSizeToFit
            minimumFontScale={0.66}
            numberOfLines={1}>
            {titleMuted}
          </Text>
        ) : null}

        {subtitle ? (
          <Text
            variant="callout"
            color="textSecondary"
            style={{ marginTop: spacing.sm }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/*
        Actions and the script accent share one right-hand column, stacked:
        side by side they squeeze the headline until it breaks mid-word.
      */}
      {trailing || script ? (
        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          {trailing}
          {script ? (
            <Text
              variant="script"
              color="textSecondary"
              accessible={false}
              numberOfLines={2}
              style={{
                transform: [{ rotate: '-6deg' }],
                marginTop: trailing ? spacing.xl : spacing.lg,
                // Wide enough for the brand line to break where it is
                // written to break — after "Better Hair." and nowhere else.
                width: 140,
                textAlign: 'right',
              }}>
              {script}
            </Text>
          ) : null}
        </View>
      ) : null}
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
      {/*
        An empty screen is the one place with nothing else to say, so the
        seedling grows on arrival rather than sitting there. Screens that
        name a specific action keep their glyph; the rest get the sprout.
      */}
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
        {icon === 'sparkle' ? (
          <Sprout size={40} />
        ) : (
          <Icon name={icon} size={28} color={colors.accent} />
        )}
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
export function Separator({
  inset = 0,
  insetEnd = 0,
}: {
  inset?: number;
  insetEnd?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: 1,
        backgroundColor: colors.separator,
        marginLeft: inset,
        marginRight: insetEnd,
      }}
    />
  );
}

/**
 * Scroll edge effect.
 *
 * Content scrolling beneath fixed chrome has to be obscured, or text
 * passing under a translucent bar turns to mush. System bars do this for
 * free; any custom bar has to opt in — which is what this is. It fades
 * the app background out over the content immediately below (or above) the
 * bar, so the boundary reads as depth rather than as a hard seam.
 */
export function ScrollEdgeEffect({
  edge = 'top',
  height,
}: {
  edge?: 'top' | 'bottom';
  height?: number;
}) {
  const { colors, metrics } = useTheme();
  const h = height ?? metrics.scrollEdgeHeight;

  // Fully opaque against the bar, transparent against the content.
  const solid = colors.background;
  const clear = withZeroAlpha(solid);

  return (
    <LinearGradient
      pointerEvents="none"
      colors={edge === 'top' ? [solid, clear] : [clear, solid]}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height: h,
        ...(edge === 'top' ? { top: 0 } : { bottom: 0 }),
      }}
    />
  );
}


/**
 * A primary control floating above the content.
 *
 * Deliberately *not* a glass surface wrapping a solid button: that stacks
 * two materials, which the guidance rules out, and on a platform without a
 * real backdrop blur it degrades to an opaque slab sitting on top of text.
 *
 * Instead the control itself is the floating element, and a scroll edge
 * effect underneath dissolves content before it reaches the control. That
 * is what makes the content read as passing *beneath* the layer rather
 * than being covered by it — the same job the system does for its own bars.
 */
export function FloatingBar({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { spacing, metrics, shadow } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        // NativeTabs reports the tab bar through the bottom safe-area
        // inset, so this is measured from the top of the tab bar.
        bottom: insets.bottom,
        alignItems: 'stretch',
      }}>
      <ScrollEdgeEffect edge="bottom" height={FLOATING_BAR_CLEARANCE} />
      <View
        style={[
          {
            paddingHorizontal: metrics.floatingInset,
            paddingBottom: spacing.md,
          },
          shadow.lifted,
          style,
        ]}>
        {children}
      </View>
    </View>
  );
}

export { TAB_BAR_CLEARANCE, FLOATING_BAR_CLEARANCE };
