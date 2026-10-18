/**
 * callAudio.ts
 * Chooses where call audio comes out: the loudspeaker or the earpiece (FR-06).
 *
 * react-native-webrtc has no audio routing of its own, so this uses react-native-incall-manager, the library that is
 * normally paired with it. While a call is on, "auto" mode starts voice calls on the earpiece and video calls on the
 * loudspeaker, switches to a wired or Bluetooth headset when one is connected, and turns the screen off when the phone
 * is held to the ear. `setCallSpeaker` then lets the person override that.
 *
 * It is a native module, so it exists only in a development or production build. Like WebRTC itself it is loaded
 * lazily and every function degrades to "false / nothing" in Expo Go, on web, or if the module fails to load, leaving
 * the system's own routing in place. Not yet verified on a device.
 */

import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import type { CallType } from '../types';

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

/** Forces the loudspeaker (true) or the earpiece (false). Returns false when the system could not do it. */
export const setCallSpeaker = (speaker: boolean): boolean =>
  attempt('route', (manager) => manager.setForceSpeakerphoneOn(speaker));

/** Gives audio routing back to the system once the call is over. */
export const stopCallAudio = (): boolean => attempt('stop', (manager) => manager.stop());
