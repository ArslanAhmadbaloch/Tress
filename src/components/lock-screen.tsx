/**
 * The lock.
 *
 * Rendered over the whole app rather than routed to, so there is no screen
 * behind it to reach and no back gesture that dismisses it. The app under
 * it stays mounted: coming back from a locked state should feel like the
 * lock lifting, not like the app starting again.
 *
 * Biometrics are offered the moment it appears, because the common case is
 * someone who has just picked their phone back up. Refusing or failing that
 * leaves the keypad, which is always available.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PasscodeScene } from './passcode';
import { Ground } from './ui/ground';
import { PressableScale } from './ui/pressable-scale';
import { Text } from './ui/text';
import {
  BIOMETRIC_LABELS,
  PASSCODE_LENGTH,
  authenticateBiometric,
  verifyPasscode,
  type LockState,
} from '@/lib/app-lock';
import { useTheme } from '@/theme';

/** Wrong attempts before the hint about starting over appears. */
const ATTEMPTS_BEFORE_HELP = 3;

/** How long a rejected code stays on screen before the row clears. */
const REJECTION_HOLD = 950;

export function LockScreen({
  lock,
  onUnlock,
  onForgot,
}: {
  lock: LockState;
  onUnlock: () => void;
  /** Erasing everything is the only way past a forgotten passcode. */
  onForgot: () => void;
}) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);

  // Strict Mode mounts effects twice in development, and a second biometric
  // prompt cancels the first.
  const prompted = useRef(false);

  const label = BIOMETRIC_LABELS[lock.biometric];

  const promptBiometric = useCallback(async () => {
    const ok = await authenticateBiometric('Unlock Hair Journey');
    if (ok) onUnlock();
  }, [onUnlock]);

  useEffect(() => {
    if (!lock.biometricsEnabled || prompted.current) return;
    prompted.current = true;
    promptBiometric();
  }, [lock.biometricsEnabled, promptBiometric]);

  const submit = useCallback(
    async (code: string) => {
      setChecking(true);
      const ok = await verifyPasscode(code);
      setChecking(false);

      if (ok) {
        onUnlock();
        return;
      }

      setError(true);
      setAttempts((n) => n + 1);
      // Held long enough to read as a rejection before the row clears.
      setTimeout(() => {
        setEntry('');
        setError(false);
      }, REJECTION_HOLD);
    },
    [onUnlock],
  );

  const addDigit = (digit: string) => {
    if (checking || error) return;
    const next = entry + digit;
    setEntry(next);
    if (next.length === PASSCODE_LENGTH) submit(next);
  };

  const deleteDigit = () => {
    if (checking || error) return;
    setEntry((current) => current.slice(0, -1));
  };

  const confirmForgot = () => {
    Alert.alert(
      'Forgotten passcode',
      'There is no way to recover it. Your journey is stored only on this device and nothing here can read it without the code. Starting over erases your photos, routine history and notes.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Erase and start over', style: 'destructive', onPress: onForgot },
      ],
    );
  };

  return (
    <Animated.View
      exiting={FadeOut.duration(260)}
      style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
      <Ground variant="plain">
        <View
          style={{
            flex: 1,
            paddingTop: insets.top,
            paddingBottom: insets.bottom + spacing.lg,
          }}>
          <PasscodeScene
            title="Hair Journey"
            subtitle="Enter your passcode"
            message={error ? 'That passcode is not right.' : undefined}
            filled={entry.length}
            total={PASSCODE_LENGTH}
            error={error}
            onDigit={addDigit}
            onDelete={deleteDigit}
            onBiometric={lock.biometricsEnabled ? promptBiometric : undefined}
            biometricLabel={lock.biometricsEnabled ? label : undefined}
            footer={
              attempts >= ATTEMPTS_BEFORE_HELP ? (
                <PressableScale
                  onPress={confirmForgot}
                  haptic="none"
                  accessibilityRole="button"
                  accessibilityLabel="Forgotten passcode"
                  style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.lg }}>
                  <Text variant="subhead" color="textSecondary">
                    Forgotten passcode?
                  </Text>
                </PressableScale>
              ) : null
            }
          />
        </View>
      </Ground>
    </Animated.View>
  );
}
