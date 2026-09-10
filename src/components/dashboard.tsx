/**
 * Dashboard pieces.
 *
 * Split out of the Home screen because each of these is a distinct visual
 * component with its own rules, and Home was becoming one long file where
 * the structure of the page was hard to see.
 */

import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './ui/icon';
import { PressableScale } from './ui/pressable-scale';
import { ProgressRing, Sparkline } from './ui/ring';
import { AnimatedNumber } from './ui/stat';
import { Text } from './ui/text';
import { useTheme } from '@/theme';

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
 * One dashboard metric.
 *
 * The (i) is not decoration: every number here is derived, and a derived
 * number the user cannot interrogate is one they will either over-trust or
 * ignore. Tapping it explains exactly how the figure was computed.
 */
export function MetricTile({
  icon,
  label,
  value,
  unit,
  suffix,
  delta,
  deltaSuffix = '%',
  ring,
  history,
  footer,
  onPress,
  onExplain,
}: {
  icon: IconName;
  label: string;
  value: number;
  unit?: string;
  suffix?: string;
  delta?: number | null;
  deltaSuffix?: string;
  /** 0-1, drives the arc around the icon. */
  ring: number;
  history?: number[];
  /** Replaces the sparkline, for the photo tile. */
  footer?: ReactNode;
  onPress: () => void;
  onExplain: () => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${suffix ?? ''}${unit ? ` ${unit}` : ''}`}
      style={[
        {
          flex: 1,
          padding: spacing.md,
          paddingBottom: spacing.sm,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
        },
        shadow.soft,
      ]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}>
        <ProgressRing progress={ring} size={44}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.accentSoft,
            }}>
            <Icon name={icon} size={16} color={colors.text} />
          </View>
        </ProgressRing>

        <PressableScale
          onPress={onExplain}
          haptic="none"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`How ${label} is calculated`}>
          <Icon name="info" size={15} color={colors.textTertiary} />
        </PressableScale>
      </View>

      <Text variant="subhead" color="textSecondary" style={{ marginTop: spacing.md }}>
        {label}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <AnimatedNumber value={value} suffix={suffix} />
        {unit ? (
          <Text variant="footnote" color="textSecondary">
            {unit}
          </Text>
        ) : null}
        {typeof delta === 'number' && delta !== 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
            <Icon
              name={delta > 0 ? 'arrowUpRight' : 'arrowDownRight'}
              size={11}
              color={delta > 0 ? colors.accent : colors.textTertiary}
            />
            <Text variant="caption" color={delta > 0 ? 'accent' : 'textTertiary'}>
              {delta > 0 ? '+' : ''}
              {delta}
              {deltaSuffix}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ height: 34, justifyContent: 'flex-end', marginTop: spacing.xs }}>
        {footer ?? (history && history.length > 1 ? (
          <Sparkline values={history} width={96} height={28} />
        ) : (
          <Text variant="caption" color="textTertiary">
            Not enough history yet
          </Text>
        ))}
      </View>
    </PressableScale>
  );
}

/** The photo tile's footer: a stack of recent thumbnails plus a count. */
export function PhotoStack({
  uris,
  remaining,
}: {
  uris: string[];
  remaining: number;
}) {
  const { colors, spacing, radius } = useTheme();

  if (uris.length === 0) {
    return (
      <Text variant="caption" color="textTertiary">
        None yet
      </Text>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {uris.map((uri, i) => (
        <Image
          key={uri}
          source={{ uri }}
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 2,
            borderColor: colors.surface,
            backgroundColor: colors.fill,
            marginLeft: i === 0 ? 0 : -8,
          }}
          contentFit="cover"
          accessible={false}
        />
      ))}
      {remaining > 0 ? (
        <View
          style={{
            marginLeft: spacing.xs,
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
            borderRadius: radius.pill,
            backgroundColor: colors.accentSoft,
          }}>
          <Text variant="caption" color="accent">
            +{remaining}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ----------------------------- learn card ----------------------------- */

export function LearnCard({
  onPress,
  style,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel="Learn and grow. Opens the library."
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
          padding: spacing.lg,
          borderRadius: radius.section,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        shadow.soft,
        style,
      ]}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.backgroundSubtle,
        }}>
        <Icon name="idea" size={20} color={colors.text} />
      </View>

      <View style={{ flex: 1 }}>
        <Text variant="title3">Learn &amp; Grow</Text>
        <Text variant="footnote" color="textSecondary" style={{ marginTop: 3 }}>
          Evidence-based guides on how hair changes, and how to read your own
          timeline.
        </Text>
      </View>

      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
        <Icon name="arrowRight" size={16} color={colors.text} />
      </View>
    </PressableScale>
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
