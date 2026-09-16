/**
 * The person's own turn in the thread.
 *
 * It appears at once — this is their action, not the app's — and sits to
 * the right on the soft accent, with one square corner where it points
 * back at the composer it came from. Reanimated stands the entrance down
 * under Reduce Motion.
 */

import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

export function QuestionBubble({ text }: { text: string }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
      <View
        accessible
        accessibilityLabel={`You asked: ${text}`}
        style={{
          backgroundColor: colors.accentSoft,
          borderRadius: radius.card,
          borderBottomRightRadius: radius.xs,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
        }}>
        <Text variant="body">{text}</Text>
      </View>
    </Animated.View>
  );
}
