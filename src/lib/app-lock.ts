/**
 * The app lock.
 *
 * A passcode, optionally backed by Face ID or Touch ID, that has to be
 * cleared before the journey is visible. People photograph their scalp
 * every few weeks and hand their phone to other people; a lock on the app
 * is the difference between that being fine and not.
 *
 * What this is honest about: it keeps other people out of the *app*. It is
 * not encryption. The photo files still sit in the app's own container on
 * disk, protected by iOS's file protection and the device passcode, and
 * anyone who can read that container can read them. Nothing here changes
 * that, and the settings copy says so rather than implying a vault.
 *
 * The passcode lives in the system keychain via expo-secure-store, not in
 * AsyncStorage: AsyncStorage is a plain file. It is stored device-only and
 * only readable while the device is unlocked. The preferences around it —
 * whether the lock is on, whether biometrics are allowed, how long a trip
 * to another app is forgiven — are not secrets and stay in AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PASSCODE_KEY = 'hj.passcode';
const ENABLED_KEY = 'hj.lock.enabled';
const BIOMETRICS_KEY = 'hj.lock.biometrics';
const GRACE_KEY = 'hj.lock.grace';

/** Digits in a passcode. Six, as iOS itself settled on. */
export const PASSCODE_LENGTH = 6;

/**
 * How long the app may be away before it locks again.
 *
 * Zero means the moment it leaves the screen. The others forgive a trip to
 * the camera roll or a reply to a message, which is when people abandon a
 * lock rather than live with it.
 */
export const GRACE_PERIODS = [0, 60, 300] as const;
export type GracePeriod = (typeof GRACE_PERIODS)[number];

export const GRACE_LABELS: Record<GracePeriod, string> = {
  0: 'Immediately',
  60: 'After 1 min',
  300: 'After 5 min',
};

export const GRACE_DETAIL: Record<GracePeriod, string> = {
  0: 'Locks the moment you leave the app.',
  60: 'A minute away is forgiven, so a quick reply does not lock you out.',
  300: 'Five minutes away is forgiven.',
};

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'none';

export type LockState = {
  enabled: boolean;
  biometricsEnabled: boolean;
  grace: GracePeriod;
  /** What this device can actually offer, and whether anything is enrolled. */
  biometric: BiometricKind;
};

export const BIOMETRIC_LABELS: Record<BiometricKind, string> = {
  face: 'Face ID',
  fingerprint: 'Touch ID',
  iris: 'Iris',
  /**
   * Nothing is enrolled, so the row names what the platform calls the
   * feature rather than a generic "Biometrics" the user has never seen.
   */
  none: Platform.OS === 'ios' ? 'Face ID or Touch ID' : 'biometric unlock',
};

/* ------------------------------ hardware ------------------------------ */

/**
 * Which biometric this device has enrolled, if any.
 *
 * Hardware that exists but has nothing enrolled counts as none: offering
 * "Unlock with Face ID" to someone who has never set it up produces a
 * prompt that can only fail.
 */
export async function availableBiometric(): Promise<BiometricKind> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    if (!hasHardware || !enrolled) return 'none';

    const { AuthenticationType } = LocalAuthentication;
    if (types.includes(AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(AuthenticationType.FINGERPRINT)) return 'fingerprint';
    if (types.includes(AuthenticationType.IRIS)) return 'iris';
    return 'none';
  } catch {
    return 'none';
  }
}

/** Runs the system biometric prompt. False covers refusal and failure alike. */
export async function authenticateBiometric(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      // The system passcode is a different secret from this app's; falling
      // back to it would let someone past a lock they never set.
      disableDeviceFallback: true,
      cancelLabel: 'Use passcode',
    });
    return result.success;
  } catch {
    return false;
  }
}

/* ------------------------------ passcode ------------------------------ */

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function setPasscode(passcode: string): Promise<void> {
  await SecureStore.setItemAsync(PASSCODE_KEY, passcode, SECURE_OPTIONS);
  await AsyncStorage.setItem(ENABLED_KEY, '1');
}

export async function verifyPasscode(attempt: string): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(PASSCODE_KEY, SECURE_OPTIONS);
    return stored !== null && stored === attempt;
  } catch {
    return false;
  }
}

/** Removes the passcode and everything that depended on it. */
export async function clearPasscode(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PASSCODE_KEY, SECURE_OPTIONS);
  } catch {
    // Nothing stored is the state we wanted anyway.
  }
  await AsyncStorage.multiRemove([ENABLED_KEY, BIOMETRICS_KEY]);
}

/* ----------------------------- preferences ---------------------------- */

export async function loadLockState(): Promise<LockState> {
  const biometric = await availableBiometric();

  try {
    const [enabled, biometrics, grace] = await AsyncStorage.multiGet([
      ENABLED_KEY,
      BIOMETRICS_KEY,
      GRACE_KEY,
    ]);

    const seconds = Number(grace[1]);
    return {
      // The keychain is the truth; the flag only mirrors it for a fast read.
      enabled: enabled[1] === '1',
      biometricsEnabled: biometrics[1] === '1' && biometric !== 'none',
      grace: GRACE_PERIODS.includes(seconds as GracePeriod)
        ? (seconds as GracePeriod)
        : 0,
      biometric,
    };
  } catch {
    return { enabled: false, biometricsEnabled: false, grace: 0, biometric };
  }
}

export function setBiometricsEnabled(enabled: boolean): void {
  AsyncStorage.setItem(BIOMETRICS_KEY, enabled ? '1' : '0').catch(() => undefined);
}

export function setGracePeriod(seconds: GracePeriod): void {
  AsyncStorage.setItem(GRACE_KEY, String(seconds)).catch(() => undefined);
}
