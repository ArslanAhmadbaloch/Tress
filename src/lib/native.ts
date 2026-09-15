/**
 * Whether the Nitro native runtime is in this binary.
 *
 * VisionCamera, the face detector and the TFLite runtime all build on
 * react-native-nitro-modules, which Expo Go does not ship. Each of them is
 * loaded lazily and inside a try — but that is not enough on its own.
 * Metro only lets a module's own load errors reach the caller while the
 * bundle is still starting up; a module that first loads later, from a
 * render or a save, has its error reported as *fatal* instead of thrown,
 * and a catch around the require never sees it. The screen goes red.
 *
 * So the question has to be asked before the require, and asked of the
 * native side directly. `get` returns null for a module that is absent
 * where `getEnforcing` would throw.
 */
import { TurboModuleRegistry } from 'react-native';

let known: boolean | undefined;

export function nitroAvailable(): boolean {
  if (known !== undefined) return known;
  try {
    known = TurboModuleRegistry.get('NitroModules') != null;
  } catch {
    known = false;
  }
  return known;
}
