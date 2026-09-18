/**
 * The Plus button's chooser: two ways to add a picture.
 *
 * ── Why the door is back ──────────────────────────────────────────────
 * The centre "+" used to open the scanner directly, and the comment in
 * tab-bar.tsx said why: there is no *scanner* choice — a scan is a scan.
 * That is still true. This is not a choice between two scanners; it is a
 * choice between scanning and not scanning. The owner's call: "the plus
 * button at the centre will have 2 features, scanner and camera to take
 * photos like simple photos."
 *
 * ── Why it looks like this ────────────────────────────────────────────
 * Two cards side by side over a blurred view of whatever was showing,
 * each carrying a picture, a badge and a sentence. The owner asked for
 * the shape after seeing it elsewhere, and it earns its keep: a person
 * choosing between a guided scan and a snapshot is choosing between two
 * *experiences*, and a picture says which is which faster than a row of
 * text. The badge says what each costs, because learning that at the
 * paywall — after choosing — is the version of this that wastes time.
 *
 * ── Why it replaces itself rather than pushing ────────────────────────
 * Both destinations end by leaving: the scanner's report replaces itself
 * with the journal, and the plain camera replaces itself with the update
 * it just saved. If this screen were still underneath, that replace
 * would pop the destination and strand the person on a chooser they had
 * already answered.
 *
 * The blur is the system's own, so it matches whatever is behind it, and
 * a scrim underneath keeps the white cards legible over a bright screen
 * as well as a dark one. Everything below the title scrolls: `Text` does
 * not cap Dynamic Type, and at the largest accessibility sizes two cards
 * and a close button are taller than a phone.
 */

import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { hairContent } from '@/features/content/hair-content';
import { PHOTO_COPY } from '@/features/photo/copy';
import { usePremium } from '@/features/subscription/provider';
import { useAppStore } from '@/store/app-store';
import { MIN_TOUCH_TARGET, iconSize, motion, radius, shadow, spacing, useTheme } from '@/theme';
import { isScanSession } from '@/types/domain';

/** The picture on a card, square, so the two read as a pair. */
const CARD_IMAGE = 116;

export default function NewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { data } = useAppStore();
  const { isPremium } = usePremium();
  const copy = PHOTO_COPY.chooser;

  /*
    The scan's badge is the free-baseline rule, read back before the
    choice instead of after it: the first scan is free to everybody, and
    the screen that enforces that reads the same question — has a scan
    been taken — so the badge cannot drift from what the scanner does.
  */
  const hasScanned = data.sessions.some(isScanSession);
  const scanBadge = isPremium
    ? copy.badge.unlimited
    : hasScanned
      ? copy.badge.premium
      : copy.badge.firstFree;

  const content = hairContent(data.profile?.gender);
  const close = () => router.back();

  return (
    <View style={{ flex: 1 }}>
      <BlurView intensity={40} tint="systemChromeMaterial" style={StyleSheet.absoluteFill} />
      {/*
        The scrim. The blur alone leaves a bright screen bright, and a
        white card on a white blur has no edge; this puts a consistent
        ground under both cards whatever was showing.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.close}
        onPress={close}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
      />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
          paddingTop: insets.top + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.base)}>
          <Text variant="title2" center accessibilityRole="header" style={{ marginBottom: spacing.xs }}>
            {copy.title}
          </Text>
          <Text variant="subhead" center color="textSecondary" style={{ marginBottom: spacing.xl }}>
            {copy.subtitle}
          </Text>
        </Animated.View>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Choice
            badge={scanBadge}
            image={content.angles.front.example}
            label={copy.scan.label}
            description={copy.scan.description}
            delay={0}
            onPress={() => router.replace('/hair-scan')}
          />
          <Choice
            badge={copy.badge.free}
            image={content.portrait}
            label={copy.photo.label}
            description={copy.photo.description}
            delay={60}
            onPress={() => router.replace('/photo')}
          />
        </View>

        <Text variant="footnote" center color="textTertiary" style={{ marginTop: spacing.lg }}>
          {PHOTO_COPY.privacy}
        </Text>

        <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
          <PressableScale
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={copy.close}
            style={{
              width: MIN_TOUCH_TARGET,
              height: MIN_TOUCH_TARGET,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              ...shadow.soft,
            }}>
            <Icon name="close" size={iconSize.md} color={colors.text} />
          </PressableScale>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * One door: a badge saying what it costs, a picture of what it is, its
 * name and one sentence. The two cards share every measurement so
 * neither reads as the recommended one — the choice is the person's.
 */
function Choice({
  badge,
  image,
  label,
  description,
  delay,
  onPress,
}: {
  badge: string;
  image: number;
  label: string;
  description: string;
  delay: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      style={{ flex: 1 }}
      entering={reduceMotion ? undefined : FadeInUp.delay(delay).duration(motion.duration.base)}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${description}. ${badge}.`}
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.md,
          alignItems: 'center',
          ...shadow.lifted,
        }}>
        <View
          style={{
            backgroundColor: colors.accentSoft,
            borderRadius: radius.pill,
            paddingVertical: spacing.xxs,
            paddingHorizontal: spacing.md,
            marginBottom: spacing.md,
          }}>
          <Text variant="caption" color="accent">
            {badge}
          </Text>
        </View>

        <Image
          source={image}
          style={{
            width: CARD_IMAGE,
            height: CARD_IMAGE,
            borderRadius: radius.lg,
            marginBottom: spacing.md,
          }}
          contentFit="cover"
          accessible={false}
        />

        <Text variant="headline" center style={{ marginBottom: spacing.xxs }}>
          {label}
        </Text>
        <Text variant="footnote" center color="textSecondary">
          {description}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}
