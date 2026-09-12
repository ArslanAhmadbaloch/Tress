/**
 * The card, floating.
 *
 * Tapping the card on the profile brings it here, and finishing onboarding
 * lands here directly — the one thing a person has at the end of setting
 * up, before they have taken a single photo.
 *
 * It is also where the card is captured. The capture target is a wrapper
 * with its own opaque field behind it, because the card is translucent and
 * a PNG of it alone would be a pane of nothing.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { CardFloat, MemberCard } from '@/components/member-card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { useAppStore } from '@/store/app-store';
import { consistencyScore } from '@/store/selectors';
import { motion, useTheme } from '@/theme';
import { HAIR_GOAL_LABELS } from '@/types/domain';

/**
 * Widest the card is drawn here.
 *
 * Deliberately narrower than the screen: the card has to read as an object
 * lifted off the page, and something that fills the frame edge to edge
 * reads as the page itself.
 */
const MAX_CARD_WIDTH = 300;
/** Field around the card in the exported image. */
const EXPORT_MARGIN = 26;

/**
 * What the file is called in the share sheet and wherever it lands.
 *
 * view-shot writes to a temporary file named with a UUID, which is what
 * the share sheet would otherwise show the user as the name of their
 * keepsake.
 */
const EXPORT_NAME = 'Hair Journey Card.png';

export default function CardScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const { data } = useAppStore();

  /** Onboarding sends people here; the profile does not. */
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const isWelcome = welcome === '1';

  const shot = useRef<View>(null);
  const [saving, setSaving] = useState(false);

  const lift = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      lift.set(1);
      return;
    }
    lift.set(withDelay(80, withSpring(1, motion.spring.gentle)));
  }, [lift, reduceMotion]);

  // Rises and settles, the way the reference sits in the air rather than
  // on the page. The tilt is small enough to read as depth, not as a trick.
  const floatStyle = useAnimatedStyle(() => {
    const t = lift.get();
    return {
      opacity: withTiming(t, { duration: 200 }),
      transform: [
        { perspective: 900 },
        { translateY: (1 - t) * 26 },
        { rotateX: `${(1 - t) * 7}deg` },
        { scale: 0.94 + 0.06 * t },
      ],
    };
  });

  const journey = data.journey;
  if (!journey) return null;

  const cardWidth = Math.min(MAX_CARD_WIDTH, width - (spacing.xl + EXPORT_MARGIN) * 2);
  const card = {
    name: data.profile?.displayName?.trim() || 'You',
    goalLabel: HAIR_GOAL_LABELS[journey.goal],
    age: data.profile?.age,
    portraitUri: data.profile?.avatarUri,
    startedAt: journey.startedAt,
    consistency: consistencyScore(data).value,
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);

    try {
      const captured = await captureRef(shot, { format: 'png', quality: 1 });

      const named = new File(Paths.cache, EXPORT_NAME);
      if (named.exists) named.delete();
      new File(captured).move(named);

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          'Sharing is unavailable',
          'This device cannot open the share sheet, so the card cannot be saved from here.',
        );
        return;
      }

      await Sharing.shareAsync(named.uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Your Hair Journey card',
      });
    } catch {
      Alert.alert(
        'That did not save',
        'The card could not be turned into an image. Try again in a moment.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen ground="plain" edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          // A page sheet on iOS already clears the status bar.
          paddingTop: (Platform.OS === 'ios' ? 0 : insets.top) + spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.lg,
          alignItems: 'center',
        }}>
        <View
          style={{
            alignSelf: 'stretch',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            marginBottom: spacing.sm,
          }}>
          <PressableScale
            onPress={() => (isWelcome ? router.replace('/') : router.back())}
            accessibilityRole="button"
            accessibilityLabel={isWelcome ? 'Continue to the app' : 'Close'}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.fill,
            }}>
            <Icon name="close" size={15} color={colors.text} />
          </PressableScale>
        </View>

        {isWelcome ? (
          <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <Text variant="title2" center>
              Your journey card
            </Text>
            <Text
              variant="callout"
              color="textSecondary"
              center
              style={{ marginTop: spacing.xs, maxWidth: 300 }}>
              Yours to keep. It fills in as you go — your picture appears once
              you have taken your first photos.
            </Text>
          </View>
        ) : null}

        <Animated.View style={[{ alignItems: 'center' }, floatStyle]}>
          {/*
            The capture target. Its own field travels with it into the PNG,
            so the exported card is a finished image rather than a cut-out.
          */}
          <CardFloat>
            <View ref={shot} collapsable={false} style={{ borderRadius: radius.xl }}>
              <LinearGradient
                colors={[colors.cardExportTop, colors.cardExportBottom]}
                style={{ padding: EXPORT_MARGIN, borderRadius: radius.xl }}>
                <MemberCard {...card} width={cardWidth} />
              </LinearGradient>
            </View>
          </CardFloat>
        </Animated.View>

        <View style={{ flex: 1, minHeight: spacing.xl }} />

        <View style={{ alignSelf: 'stretch', gap: spacing.sm, maxWidth: 420 }}>
          <Button
            label={saving ? 'Preparing…' : 'Save or share card'}
            onPress={save}
            disabled={saving}
          />

          {isWelcome ? (
            <Button label="Continue" variant="secondary" onPress={() => router.replace('/')} />
          ) : (
            <Button
              label="Change picture"
              variant="secondary"
              onPress={() => router.replace('/profile-photo')}
            />
          )}

          <Text
            variant="caption"
            color="textTertiary"
            center
            style={{ marginTop: spacing.xs }}>
            The card shows your name, the goal you chose and how consistent you
            have been. It says nothing about your hair.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
