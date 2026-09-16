/**
 * Whether the guided scan fires the shutter itself.
 *
 * On by default, because the angles this app asks for are the ones you
 * cannot reach the screen for: nobody taps a shutter button while holding
 * a phone above their own crown. Anyone who would rather press it
 * themselves turns this off and keeps the button.
 *
 * A device preference, not a journey one — it describes how somebody
 * holds this handset — so it sits in AsyncStorage beside the others and
 * follows the same convention: a missing value reads as the default, and
 * a failed read never stops the camera opening.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'hj.handsFree';

export async function loadHandsFree(): Promise<boolean> {
  try {
    // Anything but an explicit '0' is on, so a half-written value fails
    // towards the default rather than towards a camera that waits.
    return (await AsyncStorage.getItem(KEY)) !== '0';
  } catch {
    return true;
  }
}

export function saveHandsFree(enabled: boolean): void {
  AsyncStorage.setItem(KEY, enabled ? '1' : '0').catch(() => undefined);
}
