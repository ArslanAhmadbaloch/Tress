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

import { Button } from './button';
import { Ground, type GroundVariant } from './ground';
import { Icon, type IconName } from './icon';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

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
          /*
            Thirty-two above, twelve below. The gap above a header is what
            separates one block from the last; the gap below only has to
            attach the header to its own content. Equal gaps made every
            screen read as one continuous list.
          */
          marginTop: spacing.xxxl,
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
      {/*
        title3, the same size the screens already use for the headings
        they draw by hand, so a section named through this component and
        one named inline are the same weight of thing.
      */}
      <Text
        variant="title3"
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
  reveal = false,
  title,
  titleMuted,
  subtitle,
  script,
  trailing,
}: {
  eyebrow?: string;
  /** 'brand' renders the animated sage wordmark instead of a grey label. */
  eyebrowTone?: 'muted' | 'brand';
  /**
   * Staggers the header's arrival on mount: eyebrow, then headline, then
   * subtitle, then the actions. The reference's home header is a
   * four-second reveal of its parts in sequence rather than a static
   * frame, and it is the one place that kind of entrance earns its
   * time — the first thing seen each launch. Off by default, because a
   * header that re-performs itself on every tab switch is a tic.
   */
  reveal?: boolean;
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
        paddingTop: spacing.md,
        paddingBottom: subtitle ? spacing.sm : spacing.md,
      }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Animated.View entering={reveal ? FadeInDown.duration(480).springify().damping(20) : undefined}>
          {eyebrow ? (
            eyebrowTone === 'brand' ? (
              <Wordmark label={eyebrow} />
            ) : (
              /*
                Written as given, in the quiet grey of supporting copy.
                It was tracked-out capitals, which is the one typographic
                habit that most reliably dates an interface: a label that
                has to shout to be noticed is a label in the wrong place.
                Set small and calm above the headline it is noticed anyway.
              */
              <Text
                variant="subhead"
                color="textSecondary"
                style={{ marginBottom: spacing.xs }}>
                {eyebrow}
              </Text>
            )
          ) : null}
        </Animated.View>

        {/*
          Two single-line texts rather than one two-line text. On iOS a
          wrapping text wraps before it shrinks, so a long first line broke
          mid-phrase and pushed the muted line out; a single line shrinks
          reliably. VoiceOver hears the pair as one heading.
        */}
        <Animated.View
          entering={reveal ? FadeInDown.delay(130).duration(520).springify().damping(20) : undefined}>
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
        </Animated.View>

        {subtitle ? (
          <Animated.View entering={reveal ? FadeIn.delay(260).duration(480) : undefined}>
            <Text
              variant="callout"
              color="textSecondary"
              style={{ marginTop: spacing.sm }}>
              {subtitle}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      {/*
        Actions and the script accent share one right-hand column, stacked:
        side by side they squeeze the headline until it breaks mid-word.
      */}
      {trailing || script ? (
        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          <Animated.View entering={reveal ? FadeIn.delay(320).duration(520) : undefined}>
            {trailing}
          </Animated.View>
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

      {/*
        The app's own button, not a hand-drawn pill. An empty state is
        often the first screen someone sees, and the action on it should
        be the same height and weight as every other primary action they
        will meet — anything smaller reads as an afterthought.
      */}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          block={false}
          // A non-block button hugs the leading edge; this one sits
          // under centred copy and has to sit centred with it.
          style={{ marginTop: spacing.xl, alignSelf: 'center' }}
        />
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
