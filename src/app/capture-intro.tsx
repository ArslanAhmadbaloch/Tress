import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen, ScreenScroll, ScreenTitle, SectionHeader } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { formatRelative } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { latestSession } from '@/store/selectors';
import { useTheme } from '@/theme';
import { ANGLES, ANGLE_GUIDANCE, ANGLE_LABELS } from '@/types/domain';

/**
 * The step before the camera.
 *
 * Its whole job is to make the next five minutes repeatable: show which
 * angles are coming, show what you shot last time, and state the three
 * conditions that decide whether the comparison will be worth anything.
 * Consistency is the product; this screen is where it is bought.
 */
const CONDITIONS = [
  { icon: 'sun' as const, text: 'Same light — near a window works well' },
  { icon: 'phone' as const, text: 'Same distance, arm held the same way' },
  { icon: 'retake' as const, text: 'Dry hair, styled as you normally wear it' },
];

export default function CaptureIntroScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { data } = useAppStore();

  const last = latestSession(data);
  const isBaseline = data.sessions.length === 0;

  return (
    <Screen ground="arch">
      <ScreenScroll clearsTabBar={false}>
        <ScreenTitle
          eyebrow="Capture photos"
          title={isBaseline ? 'Guided 5-angle' : 'New photo'}
          titleMuted={isBaseline ? 'capture' : 'update'}
          subtitle={
            isBaseline
              ? 'Your first five photos become the baseline every future update is measured against.'
              : `Last captured ${last ? formatRelative(last.capturedAt) : 'recently'}. Match those conditions as closely as you can.`
          }
          script="Same Angles Better Results"
          trailing={
            <PressableScale
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}>
              <Icon name="close" size={15} color={colors.text} />
            </PressableScale>
          }
        />

        <SectionHeader title={`${ANGLES.length} angles, in order`} />

        <View style={{ gap: spacing.sm }}>
          {ANGLES.map((angle, index) => {
            const previous = last?.photos.find((p) => p.angle === angle);

            return (
              <Card key={angle} padded={false}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: spacing.md,
                  }}>
                  {previous ? (
                    <Image
                      source={{ uri: previous.thumbnailUri ?? previous.uri }}
                      style={{
                        width: 52,
                        height: 62,
                        borderRadius: radius.xs,
                        backgroundColor: colors.fill,
                      }}
                      contentFit="cover"
                      accessibilityLabel={`Your last ${ANGLE_LABELS[angle]} photo`}
                    />
                  ) : (
                    <View
                      style={{
                        width: 52,
                        height: 62,
                        borderRadius: radius.xs,
                        backgroundColor: colors.fill,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Text variant="headline" color="textTertiary">
                        {index + 1}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text variant="headline">{ANGLE_LABELS[angle]}</Text>
                    <Text
                      variant="footnote"
                      color="textSecondary"
                      style={{ marginTop: 2 }}
                      numberOfLines={2}>
                      {ANGLE_GUIDANCE[angle].instruction}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>

        <SectionHeader title="For a fair comparison" />
        <Card tone="subtle">
          <View style={{ gap: spacing.md }}>
            {CONDITIONS.map((condition) => (
              <View
                key={condition.text}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Icon name={condition.icon} size={17} color={colors.accent} />
                <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>
                  {condition.text}
                </Text>
              </View>
            ))}
          </View>

          {last ? (
            <Text variant="footnote" color="textTertiary" style={{ marginTop: spacing.lg }}>
              During capture you can overlay your previous photo to line the
              shot up — it is the fastest way to keep angles consistent.
            </Text>
          ) : null}
        </Card>

        <Button
          label={isBaseline ? 'Capture baseline' : 'Start capture'}
          icon="camera"
          style={{ marginTop: spacing.xxl }}
          onPress={() => router.replace('/capture-session')}
        />

        <Text
          variant="caption"
          color="textTertiary"
          center
          style={{ marginTop: spacing.md }}>
          Photos are saved to this device only.
        </Text>
      </ScreenScroll>
    </Screen>
  );
}
