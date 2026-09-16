/**
 * The question field and its send disc.
 *
 * A plain surface pill on the ground, the journal's and routine's own
 * grammar. Not glass: glass is reserved for chrome, and this is content
 * the person is writing into. The disc goes accent only once there is
 * something to send, so an empty field never looks like it is waiting on
 * a tap.
 */

import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { COMPOSER_PLACEHOLDER } from '@/features/coach';
import { iconSize, typography, useTheme } from '@/theme';

export function Composer({ onSend }: { onSend: (text: string) => void }) {
  const { colors, radius, spacing, shadow } = useTheme();
  const insets = useSafeAreaInsets();

  /*
    The field holds its own text. The sheet re-renders its whole thread on
    every answer, and a controlled input whose value round-trips through
    that render drops keystrokes under a fast typist — the funnel's name
    field learned the same lesson. The sheet only needs the text at send
    time, so that is when it gets it.
  */
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0;

  const submit = () => {
    const question = text.trim();
    if (!question) return;
    setText('');
    onSend(question);
  };

  return (
    <View
      style={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        paddingBottom: Math.max(insets.bottom, spacing.md),
        backgroundColor: colors.background,
      }}>
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 52,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            paddingLeft: spacing.xl,
            paddingRight: spacing.xs,
            gap: spacing.sm,
          },
          shadow.soft,
        ]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={COMPOSER_PLACEHOLDER}
          placeholderTextColor={colors.textTertiary}
          maxLength={200}
          returnKeyType="send"
          // The keyboard stays up after a question: the next one usually follows.
          blurOnSubmit={false}
          onSubmitEditing={submit}
          accessibilityLabel="Your question"
          style={{
            flex: 1,
            color: colors.text,
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
            paddingVertical: spacing.md,
          }}
        />
        <PressableScale
          onPress={submit}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send question"
          accessibilityState={{ disabled: !canSend }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canSend ? colors.accent : colors.fill,
          }}>
          <Icon
            name="arrowRight"
            size={iconSize.md}
            color={canSend ? colors.textOnAccent : colors.textTertiary}
          />
        </PressableScale>
      </View>
    </View>
  );
}
