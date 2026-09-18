/**
 * The Plus button's chooser: two ways to add a picture.
 *
 * ── Why the door is back ──────────────────────────────────────────────
 * The centre "+" used to open the scanner directly, and the comment in
 * tab-bar.tsx said why: there is no *scanner* choice — a scan is a scan.
 * That is still true. This is not a choice between two scanners; it is a
 * choice between scanning and not scanning. The owner's call: "the plus
 * button at the centre will have 2 features, scanner and camera to take
 * photos like simple photos. Just an option for if they don't choose
 * scanner to save their photos."
 *
 * So: two rows, no default, no persuasion. The guided scan is named
 * first because it is the one that produces a reading; the plain camera
 * is named second and described as exactly what it is.
 *
 * ── Why it replaces itself rather than pushing ────────────────────────
 * Both destinations end by leaving: the scanner's report replaces itself
 * with the journal, and the plain camera replaces itself with the update
 * it just saved. If this screen were still underneath, that replace
 * would pop the destination and strand the person on a chooser sheet
 * they had already answered. A chooser is a fork in the road, not a
 * place to come back to, so it hands the stack over instead of sitting
 * in it.
 *
 * Presented as a sheet over whatever was showing — see the route note in
 * this lane's hand-off; it is registered in _layout.tsx, which belongs
 * to the integration agent. The detent asked for there is a pair
 * (`[0.5, 1]`) rather than one fixed height, and everything below the
 * header scrolls: `Text` does not cap Dynamic Type, and at the largest
 * accessibility sizes a single short detent would put "Not now" off the
 * bottom of a sheet with no way to scroll to it.
 */

import { useRouter } from 'expo-router';
import { Platform, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { PHOTO_COPY } from '@/features/photo/copy';
import { MIN_TOUCH_TARGET, motion, useTheme } from '@/theme';

/** The round plate each row's glyph sits on. */
const GLYPH_PLATE = 46;
/** The close control in the header. */
const CLOSE_SIZE = 34;

export default function NewScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const copy = PHOTO_COPY.chooser;

  /*
    The rows arrive one after the other rather than all at once, which is
    the app's grammar for a short list that has just appeared. Reduced
    motion removes the entrance entirely: the rows are simply there.
  */
  const entering = (index: number) =>
    reduceMotion ? undefined : FadeInDown.delay(60 + index * 70).duration(motion.duration.slow);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        /*
          A sheet on iOS already clears the status bar; on Android the
          same presentation is full screen, so the inset has to be paid
          for. profile-photo.tsx makes the same allowance.
        */
        paddingTop: Platform.OS === 'ios' ? spacing.lg : insets.top + spacing.sm,
        paddingHorizontal: spacing.xxl,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.xs,
        }}>
        <Text variant="title3" accessibilityRole="header">
          {copy.title}
        </Text>
        <PressableScale
          hitSlop={8}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={copy.close}
          style={{
            width: CLOSE_SIZE,
            height: CLOSE_SIZE,
            borderRadius: CLOSE_SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.fill,
          }}>
          <Icon name="close" size={15} color={colors.textSecondary} />
        </PressableScale>
      </View>

      {/*
        Everything below the header scrolls.

        A sheet is a fixed height — this one asks for a detent a little
        under half the screen — and `Text` deliberately does not cap
        Dynamic Type, so at the largest accessibility sizes the two rows,
        the privacy line and "Not now" are taller than the sheet. Without
        this the cancel control would be off the bottom with no way to
        reach it. `flexGrow: 1` keeps the spacer working at ordinary
        sizes, so the layout is unchanged for almost everybody and
        rescued for the rest. profile-photo.tsx, the model for the inset
        handling above, scrolls for the same reason.
      */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.bottom + spacing.xl,
        }}>
        <Text variant="footnote" color="textSecondary">
          {copy.subtitle}
        </Text>

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <Animated.View entering={entering(0)}>
            <ChooserRow
              glyph="target"
              label={copy.scan.label}
              description={copy.scan.description}
              /*
                Literal hrefs on purpose: the quality gate reads
                navigation out of the source, and a target behind a
                variable is a target it cannot see.
              */
              onPress={() => router.replace('/hair-scan')}
            />
          </Animated.View>

          <Animated.View entering={entering(1)}>
            <ChooserRow
              glyph="camera"
              label={copy.photo.label}
              description={copy.photo.description}
              onPress={() => router.replace('/photo')}
            />
          </Animated.View>
        </View>

        <View style={{ flex: 1, minHeight: spacing.xl }} />

        <Text variant="caption" color="textTertiary" center style={{ marginBottom: spacing.md }}>
          {PHOTO_COPY.privacy}
        </Text>

        <PressableScale
          onPress={() => router.back()}
          scaleTo={0.985}
          accessibilityRole="button"
          accessibilityLabel={copy.cancel}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            paddingVertical: spacing.xs,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text variant="headline" color="textSecondary">
            {copy.cancel}
          </Text>
        </PressableScale>
      </ScrollView>
    </View>
  );
}

/**
 * One door. A glyph on a soft accent plate, the name, the sentence that
 * says what is behind it, and a chevron — the same row the rest of the
 * app uses to mean "this leads somewhere".
 */
function ChooserRow({
  glyph,
  label,
  description,
  onPress,
}: {
  glyph: IconName;
  label: string;
  description: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={description}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
          minHeight: MIN_TOUCH_TARGET + spacing.xxl,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
        },
        shadow.soft,
      ]}>
      <View
        style={{
          width: GLYPH_PLATE,
          height: GLYPH_PLATE,
          borderRadius: GLYPH_PLATE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accentSoft,
        }}>
        <Icon name={glyph} size={20} color={colors.accent} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{label}</Text>
        <Text variant="footnote" color="textSecondary">
          {description}
        </Text>
      </View>

      <Icon name="chevronRight" size={14} color={colors.textTertiary} />
    </PressableScale>
  );
}
