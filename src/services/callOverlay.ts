/**
 * callOverlay.ts
 * JavaScript side of showing calls over other apps and the lock screen (modules/syph-call-service, Android only).
 *
 *   - an incoming call while SYPH is in the background: a full-screen call screen over the lock screen / other apps, and a
 *     notification with Accept and Decline
 *   - a call in progress while SYPH is in the background: a small floating bubble with the clock, tap to return
 *
 * Both need SYPH's process to be running. The bubble and (with the phone unlocked) the screen also need the person to allow
 * "Display over other apps" in Android Settings; Android 14+ also has a switch for full-screen call alerts.
 *
 * Native, so it exists only in a build made after it was added. Every function degrades to "false / nothing" in Expo Go, on
 * iOS and web, or in an older APK (an OTA update can reach an older APK, which has the call service but not these
 * functions). Not yet verified on a device.
 */

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { IncomingPress, parseIncomingAction, bubbleColor } from '../utils/callOverlay';

interface OverlayModule {
  showIncomingCall(key: string, title: string, text: string, isVideo: boolean): boolean;
  hideIncomingCall(): boolean;
  consumeIncomingAction(): string;
  showBubble(startedAt: number, route: string, accent: string): boolean;
  hideBubble(): boolean;
  canDrawOverApps(): boolean;
  openOverlaySettings(): boolean;
  canUseFullScreen(): boolean;
  openFullScreenSettings(): boolean;
  addListener(
    eventName: 'onIncomingCallAction',
    listener: (event: { action?: string; key?: string }) => void
  ): { remove: () => void };
}

let cached: OverlayModule | null | undefined;

function getModule(): OverlayModule | null {
  if (cached !== undefined) return cached;
  const found = Platform.OS === 'android' ? requireOptionalNativeModule<OverlayModule>('SyphCallService') : null;
  // An APK with the call service but from before this feature has the module without these functions.
  cached = found && typeof found.canDrawOverApps === 'function' ? found : null;
  return cached;
}

function attempt<T>(what: string, fallback: T, action: (module: OverlayModule) => T): T {
  const module = getModule();
  if (!module) return fallback;
  try {
    return action(module);
  } catch (error) {
    console.warn(`Call overlay (${what}):`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

/** True when this build can show calls over other apps. */
export const isOverlayAvailable = (): boolean => getModule() !== null;

export interface IncomingScreenInfo {
  key: string;
  name: string;
  /** "Incoming voice call", "Group video call", ... */
  text: string;
  video: boolean;
}

/** Shows the ringing call over the lock screen / other apps. Returns false when it could not. */
export const showIncomingScreen = (info: IncomingScreenInfo): boolean =>
  attempt('show incoming', false, (module) => module.showIncomingCall(info.key, info.name, info.text, info.video));

/** Takes the incoming-call screen and its notification away. */
export const hideIncomingScreen = (): boolean => attempt('hide incoming', false, (module) => module.hideIncomingCall());

/** Calls `listener` when Accept or Decline is pressed on the native screen. Returns a function that stops listening. */
export function onIncomingPress(listener: (press: IncomingPress) => void): () => void {
  const subscription = attempt('listen', null, (module) =>
    module.addListener('onIncomingCallAction', (event) => {
      const press = parseIncomingAction(`${event?.action ?? ''}:${event?.key ?? ''}`);
      if (press) listener(press);
    })
  );
  return () => subscription?.remove();
}

/** A press nobody was listening for, once. Ask when SYPH comes back to the screen. */
export const consumeIncomingPress = (): IncomingPress | null =>
  attempt<IncomingPress | null>('consume', null, (module) => parseIncomingAction(module.consumeIncomingAction()));

export interface BubbleInfo {
  /** When the call went live (ms since epoch). 0 shows no clock. */
  startedAt: number;
  /** Link opened when the bubble is tapped. */
  route: string;
  /** The theme's accent colour, `#RRGGBB`. */
  accent: string;
}

/** Shows the floating bubble. False when "Display over other apps" is off or this build cannot. */
export const showCallBubble = (info: BubbleInfo): boolean =>
  attempt('show bubble', false, (module) => module.showBubble(info.startedAt, info.route, bubbleColor(info.accent)));

export const hideCallBubble = (): boolean => attempt('hide bubble', false, (module) => module.hideBubble());

export const canDrawOverApps = (): boolean => attempt('check overlay', false, (module) => module.canDrawOverApps());
export const openOverlaySettings = (): boolean => attempt('overlay settings', false, (module) => module.openOverlaySettings());
export const canUseFullScreen = (): boolean => attempt('check full screen', false, (module) => module.canUseFullScreen());
export const openFullScreenSettings = (): boolean =>
  attempt('full screen settings', false, (module) => module.openFullScreenSettings());
