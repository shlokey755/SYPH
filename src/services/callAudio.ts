/**
 * callAudio.ts
 * Chooses where call audio comes out: Bluetooth earphones, a wired headset, the loudspeaker or the earpiece (FR-06).
 *
 * react-native-webrtc has no audio routing of its own, so this uses react-native-incall-manager, the library that is
 * normally paired with it. While a call is on, "auto" mode starts voice calls on the earpiece and video calls on the
 * loudspeaker, switches to a wired or Bluetooth headset when one is connected, and turns the screen off when the phone
 * is held to the ear.
 *
 * Earphones: the person picks the route (`chooseCallRoute`) from the ones the phone reports (`onAudioRouteChange`),
 * instead of forcing the speaker or the earpiece, which would override a connected headset. Bluetooth earphones also
 * need the Android 12+ "Nearby devices" permission (`ensureBluetoothAccess`), or Android hides them from the app.
 *
 * It is a native module, so it exists only in a development or production build. Like WebRTC itself it is loaded
 * lazily and every function degrades to "false / nothing" in Expo Go, on web, or if the module fails to load, leaving
 * the system's own routing in place. Not yet verified on a device.
 */

import { isRunningInExpoGo } from 'expo';
import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import type { CallType } from '../types';
import { AudioRoute, NATIVE_ROUTE, parseRouteEvent, RouteState } from '../utils/audioRoute';

type InCallManager = typeof import('react-native-incall-manager').default;

let cached: InCallManager | null | undefined;

function getInCallManager(): InCallManager | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web' || isRunningInExpoGo()) {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('react-native-incall-manager') as { default?: InCallManager } & InCallManager;
    cached = loaded.default ?? loaded;
  } catch (error) {
    console.warn('react-native-incall-manager is unavailable:', error instanceof Error ? error.message : error);
    cached = null;
  }
  return cached;
}

function attempt(what: string, action: (manager: InCallManager) => void): boolean {
  const manager = getInCallManager();
  if (!manager) return false;
  try {
    action(manager);
    return true;
  } catch (error) {
    console.warn(`Call audio (${what}):`, error instanceof Error ? error.message : error);
    return false;
  }
}

/** Takes over audio routing for the length of a call. Returns true when it did, so the caller knows to stop it later. */
export const startCallAudio = (type: CallType): boolean =>
  attempt('start', (manager) => manager.start({ media: type, auto: true }));

/**
 * Asks for the Bluetooth permission Android 12+ requires before an app may use Bluetooth earphones. Resolves to
 * whether it is granted. Declining is fine: wired headsets, the speaker and the earpiece still work. Older Android
 * versions grant it at install, so this does nothing there.
 */
export async function ensureBluetoothAccess(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31 || !getInCallManager()) return false;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
    if (await PermissionsAndroid.check(permission)) return true;
    const answer = await PermissionsAndroid.request(permission, {
      title: 'Use your earphones in calls',
      message: 'Allow SYPH to connect to Bluetooth earphones during calls. Without it, call sound stays on the phone.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    return answer === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('Call audio (bluetooth permission):', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Calls `listener` whenever the routes the phone can use, or the one in use, change (earphones plugged in or paired,
 * a Bluetooth link finishing, a route chosen). Returns a function that stops listening. Subscribe before
 * `startCallAudio`, which is what triggers the first report.
 */
export function onAudioRouteChange(listener: (state: RouteState) => void): () => void {
  if (!getInCallManager()) return () => {};
  const subscription = DeviceEventEmitter.addListener('onAudioDeviceChanged', (payload: unknown) => {
    const state = parseRouteEvent(payload);
    if (state) listener(state);
  });
  return () => subscription.remove();
}

/** Sends call audio to one of the routes the phone reported. Returns false when the audio module is not there. */
export const chooseCallRoute = (route: AudioRoute): boolean =>
  attempt('route', (manager) => {
    manager.chooseAudioRoute(NATIVE_ROUTE[route]).catch((error: unknown) => {
      console.warn('Call audio (route):', error instanceof Error ? error.message : error);
    });
  });

/** Gives audio routing back to the system once the call is over. */
export const stopCallAudio = (): boolean => attempt('stop', (manager) => manager.stop());
