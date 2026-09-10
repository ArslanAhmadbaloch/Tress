import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen, ScreenScroll, ScreenTitle, SectionHeader } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { formatRelative } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { latestSession } from '@/store/selectors';
import { useTheme } from '@/theme';
import { ANGLES, ANGLE_GUIDANCE, ANGLE_LABELS } from '@/types/domain';

const CONSISTENCY_TIPS = [
  { icon: 'sun' as const, text: 'Use the same lighting — near a window works well' },
  { icon: 'phone' as const, text: 'Hold the camera the same distance away' },
  { icon: 'retake' as const, text: 'Keep your hair in its normal, dry state' },
];

export default function CaptureScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { data } = useAppStore();

  const last = latestSession(data);
  const isBaseline = data.sessions.length === 0;

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          title={isBaseline ? 'Your baseline' : 'New update'}
          subtitle={
            isBaseline
              ? 'Your first photos become the reference every future update is measured against.'
              : `Last captured ${last ? formatRelative(last.capturedAt) : 'recently'}`
          }
        />

        <SectionHeader title={`${ANGLES.length} angles`} />

        <View style={{ gap: spacing.sm }}>
          {ANGLES.map((angle, index) => {
            const previous = last?.photos.find((p) => p.angle === angle);

            return (
              <Card key={angle} padded={false} tone="surface">
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
                      accessibilityLabel={`Previous ${ANGLE_LABELS[angle]} photo`}
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
            {CONSISTENCY_TIPS.map((tip) => (
              <View
                key={tip.text}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Icon name={tip.icon} size={17} color={colors.accent} />
                <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>
                  {tip.text}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Button
          label={isBaseline ? 'Capture Baseline' : 'Start Capture'}
          icon="camera"
          style={{ marginTop: spacing.xxl }}
          onPress={() => router.push('/capture-session')}
        />
      </ScreenScroll>
    </Screen>
  );
}
