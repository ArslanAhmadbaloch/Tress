/**
 * Dashboard pieces.
 *
 * Split out of the Home screen because each of these is a distinct visual
 * component with its own rules, and Home was becoming one long file where
 * the structure of the page was hard to see.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassOrb } from './ui/glass-orb';
import { LeafShadow } from './ui/leaf-shadow';
import { BulbGlyph } from './ui/tab-glyphs';
import { Icon } from './ui/icon';
import { PressableScale } from './ui/pressable-scale';
import { placeholderSeries, Sparkline } from './ui/ring';
import { AnimatedNumber } from './ui/stat';
import { Text } from './ui/text';
import { ARTICLES } from '@/features/learn/library';
import { spacing, useTheme, withZeroAlpha } from '@/theme';

/* --------------------------- header actions --------------------------- */

/**
 * The bell and avatar pair.
 *
 * The bell's dot only appears when there is genuinely something waiting —
 * a decorative badge that is always lit trains people to ignore it.
 */
export function HeaderActions({
  initial,
  avatarUri,
  hasAlert,
  onNotifications,
  onProfile,
}: {
  initial: string;
  avatarUri?: string;
  hasAlert: boolean;
  onNotifications: () => void;
  onProfile: () => void;
}) {
  const { colors, spacing, shadow } = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
      <PressableScale
        onPress={onNotifications}
        accessibilityRole="button"
        accessibilityLabel={
          hasAlert ? 'Notifications, one waiting' : 'Notifications'
        }
        style={[
          {
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
          },
          shadow.soft,
        ]}>
        <Icon name="bell" size={19} color={colors.text} />
        {hasAlert ? (
          <View
            style={{
              position: 'absolute',
              top: 9,
              right: 11,
              width: 9,
              height: 9,
              borderRadius: 5,
              backgroundColor: colors.accent,
              borderWidth: 1.5,
              borderColor: colors.surface,
            }}
          />
        ) : null}
      </PressableScale>

      <PressableScale
        onPress={onProfile}
        accessibilityRole="button"
        accessibilityLabel="Your profile"
        style={[
          {
            width: 46,
            height: 46,
            borderRadius: 23,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.fillSelected,
          },
          shadow.soft,
        ]}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={{ width: 46, height: 46 }} contentFit="cover" />
        ) : (
          <Text variant="headline" color="textSecondary">
            {initial}
          </Text>
        )}
      </PressableScale>
    </View>
  );
}

/* ---------------------------- progress card --------------------------- */

/**
 * Hair progress.
 *
 * The largest surface on the screen, because the photographs are the
 * product. The handle between the frames is an affordance, not a control:
 * it signals that tapping opens the real comparison, where dragging works.
 */
export function HairProgressCard({
  beforeUri,
  afterUri,
  beforeLabel,
  afterLabel,
  beforeDate,
  afterDate,
  onPress,
}: {
  beforeUri?: string;
  afterUri?: string;
  beforeLabel: string;
  afterLabel: string;
  beforeDate: string;
  afterDate: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`Hair progress, ${beforeLabel} to ${afterLabel}. Opens comparison.`}
      style={[
        {
          marginTop: spacing.lg,
          borderRadius: radius.section,
          backgroundColor: colors.surface,
          padding: spacing.md,
        },
        shadow.soft,
      ]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.sm,
          paddingTop: spacing.xs,
          paddingBottom: spacing.md,
        }}>
        <Text variant="title3">Hair Progress</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              borderRadius: radius.pill,
              backgroundColor: colors.backgroundSubtle,
            }}>
            <Text variant="caption" color="textSecondary">
              {beforeLabel} → {afterLabel}
            </Text>
          </View>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}>
            <Icon name="chevronRight" size={14} color={colors.text} />
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Frame uri={beforeUri} date={beforeDate} label={beforeLabel} align="left" />
        <Frame uri={afterUri} date={afterDate} label={afterLabel} align="right" />
      </View>

      {/* The split handle, centred across the seam. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={[
            {
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 1,
              backgroundColor: colors.surface,
              marginTop: spacing.xxl,
            },
            shadow.lifted,
          ]}>
          <Icon name="chevronLeft" size={12} color={colors.text} />
          <Icon name="chevronRight" size={12} color={colors.text} />
        </View>
      </View>
    </PressableScale>
  );
}

function Frame({
  uri,
  date,
  label,
  align,
}: {
  uri?: string;
  date: string;
  label: string;
  align: 'left' | 'right';
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View style={{ flex: 1, aspectRatio: 0.82 }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: radius.md,
            backgroundColor: colors.fill,
          }}
          contentFit="cover"
          transition={200}
          accessibilityLabel={`${label} photo`}
        />
      ) : (
        <View
          style={{
            width: '100%',
            height: '100%',
            borderRadius: radius.md,
            backgroundColor: colors.backgroundSubtle,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
          }}>
          <Icon name="camera" size={20} color={colors.textTertiary} />
          <Text variant="caption" color="textTertiary">
            No photo
          </Text>
        </View>
      )}

      {uri ? (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            [align]: 0,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderTopLeftRadius: align === 'right' ? radius.sm : 0,
            borderTopRightRadius: align === 'left' ? radius.sm : 0,
            borderBottomLeftRadius: align === 'left' ? radius.md : 0,
            borderBottomRightRadius: align === 'right' ? radius.md : 0,
            backgroundColor: colors.photoScrim,
          }}>
          <Text variant="caption" color="textOnPhoto">
            {date}
          </Text>
          <Text variant="caption" color="textOnPhoto">
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------ metric tile --------------------------- */

/**
 * Weeks of real history needed before a tile's trend line is the user's
 * own data rather than a faded placeholder. Two points only ever draw a
 * straight line, which says nothing about a trend.
 */
const MIN_REAL_POINTS = 3;

/** Weeks of history at which the line reaches full strength. */
const FULL_STRENGTH_POINTS = 8;

const CHART_HEIGHT = 30;

/**
 * One dashboard metric.
 *
 * The (i) is not decoration: every number here is derived, and a derived
 * number the user cannot interrogate is one they will either over-trust or
 * ignore. Tapping it explains exactly how the figure was computed.
 *
 * The trend line always renders, so the tile keeps its shape from day one.
 * Until there is enough real history it draws a seeded placeholder at low
 * strength — visibly faded, and announced as a preview — and it brightens
 * toward the full theme green as the user's own weeks accumulate.
 */
export function MetricTile({
  glyph,
  label,
  value,
  unit,
  suffix,
  delta,
  deltaSuffix = '%',
  ring,
  history = [],
  seed,
  footer,
  onPress,
  onExplain,
}: {
  /** Drawn inside the glass orb. */
  glyph: ReactNode;
  label: string;
  value: number;
  unit?: string;
  suffix?: string;
  delta?: number | null;
  deltaSuffix?: string;
  /** 0-1, drives the arc around the orb. */
  ring: number;
  /** Real weekly history, oldest first. */
  history?: number[];
  /** Keeps each tile's placeholder shape distinct and stable. */
  seed?: string;
  /** Replaces the trend line, for the photo tile once photos exist. */
  footer?: ReactNode;
  onPress: () => void;
  onExplain: () => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const [chartWidth, setChartWidth] = useState(0);

  const isPlaceholder = history.length < MIN_REAL_POINTS;
  const series = isPlaceholder ? placeholderSeries(seed ?? label) : history;
  const strength = isPlaceholder
    ? 0
    : 0.55 +
      0.45 *
        Math.min(
          1,
          (history.length - MIN_REAL_POINTS) /
            (FULL_STRENGTH_POINTS - MIN_REAL_POINTS),
        );

  const showsPreview = !footer && isPlaceholder;
  const hasDelta = typeof delta === 'number' && delta !== 0;

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${suffix ?? ''}${unit ? ` ${unit}` : ''}${
        showsPreview ? '. Trend preview only, not enough history yet.' : ''
      }`}
      style={[
        {
          flex: 1,
          padding: spacing.md,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
        },
        shadow.soft,
      ]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}>
        <GlassOrb size={42} progress={ring}>
          {glyph}
        </GlassOrb>

        <PressableScale
          onPress={onExplain}
          haptic="none"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`How ${label} is calculated`}>
          <Icon name="info" size={17} color={colors.textSecondary} />
        </PressableScale>
      </View>

      <Text
        variant="subhead"
        color="textSecondary"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ marginTop: spacing.sm }}>
        {label}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <AnimatedNumber value={value} suffix={suffix} variant="metric" />
        {unit ? (
          <Text variant="callout" color="textTertiary" numberOfLines={1}>
            {unit}
          </Text>
        ) : null}
        {hasDelta ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 }}>
            <Icon
              name={delta > 0 ? 'arrowUpRight' : 'arrowDownRight'}
              size={12}
              color={delta > 0 ? colors.accent : colors.textTertiary}
            />
            <Text
              variant="footnote"
              color={delta > 0 ? 'accent' : 'textTertiary'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{ fontWeight: '600' }}>
              {delta > 0 ? '+' : ''}
              {delta}
              {deltaSuffix}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        onLayout={(e) => setChartWidth(Math.floor(e.nativeEvent.layout.width))}
        style={{ height: CHART_HEIGHT, marginTop: spacing.xs, justifyContent: 'flex-end' }}>
        {footer ??
          (chartWidth > 0 ? (
            <Sparkline
              values={series}
              width={chartWidth}
              height={CHART_HEIGHT}
              strength={strength}
            />
          ) : null)}
      </View>
    </PressableScale>
  );
}

const THUMB = 24;

/** The photo tile's footer: overlapping recent thumbnails, then a glass count. */
export function PhotoStack({
  uris,
  remaining,
}: {
  uris: string[];
  remaining: number;
}) {
  const { colors, shadow } = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {uris.map((uri, i) => (
        <View
          key={uri}
          style={[
            {
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              padding: 1.5,
              marginLeft: i === 0 ? 0 : -4,
              backgroundColor: colors.surface,
            },
            shadow.soft,
          ]}>
          <Image
            source={{ uri }}
            style={{ flex: 1, borderRadius: THUMB / 2, backgroundColor: colors.fill }}
            contentFit="cover"
            accessible={false}
          />
        </View>
      ))}
      {remaining > 0 ? (
        <GlassOrb size={THUMB + 2} ring={false} style={{ marginLeft: -2 }}>
          <Text
            variant="caption"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ fontWeight: '700' }}>
            {remaining > 99 ? '99+' : `+${remaining}`}
          </Text>
        </GlassOrb>
      ) : null}
    </View>
  );
}

/* ----------------------------- learn card ----------------------------- */

const COVER_W = 56;
const COVER_H = 72;

/** Vertical padding; the cover stack cancels it to reach both edges. */
const LEARN_PAD_V = spacing.sm + spacing.xxs;

/**
 * The route into the library.
 *
 * The fanned covers are not decoration standing in for content: the front
 * one carries the title of the library's featured article, so what the
 * card shows is what the reader will find behind it.
 */
export function LearnCard({
  onPress,
  style,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const featured = ARTICLES.find((a) => a.featured) ?? ARTICLES[0];

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`Learn and grow. Featured: ${featured.title}. Opens the library.`}
      // The shadow lives on the outer view; the inner one clips, so the
      // covers can run off the bottom edge without clipping the shadow.
      style={[{ borderRadius: radius.section, backgroundColor: colors.surface }, shadow.soft, style]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          // Kept as short as the tab bar, like the reference: one title and
          // two lines, with the covers filling the height on the right.
          gap: spacing.sm,
          paddingVertical: LEARN_PAD_V,
          paddingLeft: spacing.lg,
          paddingRight: spacing.md,
          borderRadius: radius.section,
          overflow: 'hidden',
        }}>
        <GlassOrb size={46} ring={false} tone="neutral">
          <BulbGlyph size={23} color={colors.text} />
        </GlassOrb>

        <View style={{ flex: 1, marginLeft: spacing.xs }}>
          <Text
            variant="headline"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={{ fontWeight: '700' }}>
            Learn &amp; Grow
          </Text>
          <Text
            variant="caption"
            color="textSecondary"
            numberOfLines={2}
            style={{ marginTop: 2, fontWeight: '400' }}>
            Science-backed guides on how hair grows.
          </Text>
        </View>

        <CoverStack title={featured.coverTitle ?? featured.title} />

        <View
          style={[
            {
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
            },
            shadow.lifted,
          ]}>
          <Icon name="arrowRight" size={16} color={colors.text} />
        </View>
      </View>
    </PressableScale>
  );
}

/** Three article covers fanned like cards, the front one titled. */
function CoverStack({ title }: { title: string }) {
  const { spacing } = useTheme();

  return (
    <View
      accessible={false}
      // Spans the card's full height so the covers can sit on its bottom
      // edge and run off it, as a stack of printed guides would.
      style={{
        width: COVER_W + 20,
        alignSelf: 'stretch',
        marginVertical: -LEARN_PAD_V,
        // Clear air before the arrow, as in the reference; the back
        // cover's tilt would otherwise lean into it.
        marginRight: spacing.sm,
      }}>
      <Cover rotate="9deg" left={12} bottom={-6} />
      <Cover rotate="3deg" left={6} bottom={-12} />
      <Cover rotate="-6deg" left={0} bottom={-18} title={title} />
    </View>
  );
}

function Cover({
  rotate,
  left,
  bottom,
  title,
}: {
  rotate: string;
  left: number;
  bottom: number;
  title?: string;
}) {
  const { colors, shadow } = useTheme();

  return (
    <View
      style={[
        {
          position: 'absolute',
          left,
          bottom,
          width: COVER_W,
          height: COVER_H,
          borderRadius: 7,
          backgroundColor: colors.surface,
          transform: [{ rotate }],
        },
        shadow.soft,
      ]}>
      <View
        style={{
          flex: 1,
          borderRadius: 7,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        }}>
        {/* A palm frond's shadow on the right third, faded toward the
            title so the text always sits on clean paper. */}
        <View style={{ position: 'absolute', top: -2, bottom: -2, right: -6 }}>
          <LeafShadow width={COVER_W * 0.72} height={COVER_H + 4} />
        </View>
        <LinearGradient
          colors={[colors.surface, withZeroAlpha(colors.surface)]}
          start={{ x: 0.45, y: 0 }}
          end={{ x: 0.85, y: 0 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {title ? (
          <View style={{ padding: 4, paddingTop: 6, width: COVER_W - 2 }}>
            <Text
              variant="caption"
              color="textTertiary"
              numberOfLines={1}
              style={{ fontSize: 5, lineHeight: 7, letterSpacing: 0.6 }}>
              GUIDE
            </Text>
            <Text
              variant="caption"
              numberOfLines={4}
              style={{ fontSize: 8, lineHeight: 10, fontWeight: '700', marginTop: 2 }}>
              {title}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* --------------------------- explanation sheet ------------------------ */

/**
 * Explains a derived number, opened from a tile's (i).
 *
 * Opaque rather than glass, deliberately. Apple's own guidance is that a
 * sheet becomes more opaque as it takes over the screen, and this one is
 * dense explanatory text: on a platform without a real backdrop blur, a
 * translucent panel over a busy dashboard is simply unreadable. Legibility
 * outranks the material here.
 *
 * It is a real Modal so it renders above the tab bar. Rendered inline it
 * sits *inside* the tab navigator, and the floating bar draws over its
 * dismiss button.
 */
export function MetricExplainer({
  title,
  body,
  points,
  onClose,
}: {
  title: string;
  body: string;
  points: string[];
  onClose: () => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // Android's back gesture should dismiss the sheet, not the screen.
      onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: 'flex-end',
        }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

      <View
        accessibilityViewIsModal
        style={[
          {
            margin: spacing.lg,
            marginBottom: insets.bottom + spacing.lg,
            padding: spacing.xl,
            borderRadius: radius.xl,
            backgroundColor: colors.surface,
            // Never taller than two-thirds of the screen; the body scrolls.
            maxHeight: height * 0.66,
          },
          shadow.lifted,
        ]}>
        {/* Grabber, so it reads as a sheet rather than a floating panel. */}
        <View
          style={{
            alignSelf: 'center',
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.fillSelected,
            marginBottom: spacing.lg,
          }}
        />

        <Text variant="title3">{title}</Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ marginTop: spacing.sm }}
          contentContainerStyle={{ paddingBottom: spacing.sm }}>
          <Text variant="callout" color="textSecondary">
            {body}
          </Text>

          <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            {points.map((point) => (
              <View key={point} style={{ flexDirection: 'row', gap: spacing.md }}>
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    marginTop: 8,
                    backgroundColor: colors.accent,
                  }}
                />
                <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
                  {point}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <PressableScale
          onPress={onClose}
          style={{
            marginTop: spacing.lg,
            paddingVertical: spacing.md,
            borderRadius: radius.pill,
            alignItems: 'center',
            backgroundColor: colors.fill,
          }}
          accessibilityRole="button"
          accessibilityLabel="Got it">
          <Text variant="headline">Got it</Text>
        </PressableScale>
        </View>
      </View>
    </Modal>
  );
}
