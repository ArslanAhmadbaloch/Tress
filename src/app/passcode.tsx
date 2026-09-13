/**
 * Setting or changing the passcode.
 *
 * Three steps at most: prove the old code if there is one, choose a new
 * one, type it again. The same scene as the lock throughout, so the code
 * is entered on the identical control it will be entered on every day.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PasscodeScene } from '@/components/passcode';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { PASSCODE_LENGTH, setPasscode, verifyPasscode } from '@/lib/app-lock';
import { useTheme } from '@/theme';

type Step = 'current' | 'create' | 'confirm';

export default function PasscodeScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** `change` asks for the existing code first. */
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const changing = mode === 'change';

  const [step, setStep] = useState<Step>(changing ? 'current' : 'create');
  const [entry, setEntry] = useState('');
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reject = useCallback((message: string) => {
    setError(message);
    setTimeout(() => {
      setEntry('');
      setError(null);
    }, 800);
  }, []);

  const complete = useCallback(
    async (code: string) => {
      if (step === 'current') {
        if (await verifyPasscode(code)) {
          setEntry('');
          setStep('create');
        } else {
          reject('That passcode is not right.');
        }
        return;
      }

      if (step === 'create') {
        setChosen(code);
        setEntry('');
        setStep('confirm');
        return;
      }

      if (code !== chosen) {
        // Back to choosing: repeating a code they mistyped once is more
        // likely to strand them than to help.
        setChosen('');
        setStep('create');
        reject('Those did not match. Choose again.');
        return;
      }

      await setPasscode(code);
      router.back();
    },
    [step, chosen, reject, router],
  );

  const addDigit = (digit: string) => {
    if (error) return;
    const next = entry + digit;
    setEntry(next);
    if (next.length === PASSCODE_LENGTH) complete(next);
  };

  const title =
    step === 'current'
      ? 'Enter your passcode'
      : step === 'create'
        ? 'Choose a passcode'
        : 'Enter it again';

  const subtitle =
    step === 'current'
      ? 'Confirm the one you use now.'
      : step === 'create'
        ? `${PASSCODE_LENGTH} digits. You will need it every time you open the app.`
        : 'So we know it was not a slip.';

  return (
    // A page sheet on iOS already clears the status bar; Android is full screen.
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: Platform.OS === 'ios' ? spacing.sm : insets.top,
        paddingBottom: insets.bottom + spacing.lg,
      }}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: spacing.lg }}>
        <PressableScale
          hitSlop={5}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
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

      <PasscodeScene
        title={title}
        subtitle={subtitle}
        message={error ?? undefined}
        filled={entry.length}
        total={PASSCODE_LENGTH}
        error={Boolean(error)}
        onDigit={addDigit}
        onDelete={() => setEntry((current) => current.slice(0, -1))}
        footer={
          <Text
            variant="caption"
            color="textTertiary"
            center
            style={{ maxWidth: 300, paddingHorizontal: spacing.lg }}>
            There is no way to recover a forgotten passcode. Nothing here can
            read your journey without it.
          </Text>
        }
      />
    </View>
  );
}
