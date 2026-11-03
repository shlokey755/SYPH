/**
 * callForeground.ts
 * JavaScript side of the call foreground service (modules/syph-call-service, Android only).
 *
 * While a call is running the service keeps SYPH's process and microphone alive when the app is not on screen, and shows
 * one ongoing notification with an "End call" button. Without it Android silences the microphone of a background app.
 *
 * It is a native module, so it exists only in a build made after it was added. Like WebRTC it is loaded lazily and every
 * function degrades to "false / nothing" in Expo Go, on iOS and web, or in an older APK (an OTA update can reach an
 * older APK), where calls simply behave as before. Not yet verified on a device.
 */

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface CallServiceModule {
  show(title: string, text: string, startedAt: number, route: string): boolean;
  stop(): boolean;
  consumeEndRequest(): boolean;
  addListener(eventName: 'onEndCall', listener: () => void): { remove: () => void };
}

let cached: CallServiceModule | null | undefined;

function getModule(): CallServiceModule | null {
  if (cached !== undefined) return cached;
  cached = Platform.OS === 'android' ? requireOptionalNativeModule<CallServiceModule>('SyphCallService') : null;
  return cached;
}

function attempt<T>(what: string, fallback: T, action: (module: CallServiceModule) => T): T {
  const module = getModule();
  if (!module) return fallback;
  try {
    return action(module);
  } catch (error) {
    console.warn(`Call service (${what}):`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

export interface CallServiceInfo {
  title: string;
  text: string;
  /** When the call went live (ms since epoch), for the notification clock. 0 shows no clock. */
  startedAt: number;
  /** Link opened when the notification is tapped. */
  route: string;
}

/** True when this build can protect a call in the background. */
export const isCallServiceAvailable = (): boolean => getModule() !== null;

/** Starts the service, or refreshes its notification. Returns false when it could not start. */
export const showCallService = (info: CallServiceInfo): boolean =>
  attempt('show', false, (module) => module.show(info.title, info.text, info.startedAt, info.route));

/** Stops the service and removes the notification. */
export const stopCallService = (): boolean => attempt('stop', false, (module) => module.stop());

/** Calls `listener` when "End call" is pressed on the notification. Returns a function that stops listening. */
export function onEndCallRequested(listener: () => void): () => void {
  const subscription = attempt('listen', null, (module) => module.addListener('onEndCall', listener));
  return () => subscription?.remove();
}

/**
 * True once if "End call" was pressed while nothing was listening. Ask when SYPH returns to the screen. Also called when
 * a call starts, to throw away a request left over from an earlier call.
 */
export const consumeEndRequest = (): boolean => attempt('consume', false, (module) => module.consumeEndRequest());
