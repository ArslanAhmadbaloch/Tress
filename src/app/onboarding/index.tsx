import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

const PILLARS = [
  { icon: 'camera' as const, text: 'Standardised photos, the same five angles every time' },
  { icon: 'chart' as const, text: 'A timeline that shows what actually changed' },
  { icon: 'lock' as const, text: 'Private by default — you choose what to share' },
];

export default function Welcome() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + spacing.lg,
        paddingHorizontal: spacing.lg,
      }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Animated.View entering={FadeIn.duration(500)}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: radius.lg,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: spacing.xxl,
            }}>
            <Icon name="sparkle" size={30} color={colors.textOnAccent} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(520)}>
          <Text variant="display" accessibilityRole="header">
            Hair{'\n'}Journey
          </Text>
          <Text
            variant="title3"
            color="textSecondary"
            style={{ marginTop: spacing.lg, maxWidth: 300 }}>
            Track your hair. See your progress. Document your journey.
          </Text>
        </Animated.View>

        <View style={{ marginTop: spacing.huge, gap: spacing.lg }}>
          {PILLARS.map((pillar, i) => (
            <Animated.View
              key={pillar.icon}
              entering={FadeInDown.delay(260 + i * 90).duration(460)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
              }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.sm,
                  backgroundColor: colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name={pillar.icon} size={17} color={colors.accent} />
              </View>
              <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>
                {pillar.text}
              </Text>
            </Animated.View>
          ))}
        </View>
      </View>

      <Animated.View entering={FadeInDown.delay(560).duration(460)} style={{ gap: spacing.md }}>
        <Button
          label="Get Started"
          onPress={() => router.push('/onboarding/tracking')}
        />
        <Text variant="caption" color="textTertiary" center>
          Hair Journey helps you document and track. It does not provide
          medical advice or diagnosis.
        </Text>
      </Animated.View>
    </View>
  );
}
