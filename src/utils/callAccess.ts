/**
 * callAccess.ts
 * Pure rules for the one-time "let SYPH show calls" prompt. No React, no native code, so plain Node can test it.
 *
 * SYPH rings with the phone's own ringtone and plays the phone's own notification sound, and Android needs no permission for
 * either. What it does need, to show a call on a full screen while SYPH is closed or another app is open, is two switches that
 * only the person can turn on, each on its own Android settings page: "Display over other apps" and (Android 14 and newer)
 * "Full-screen call alerts". The prompt explains them once per phone and opens the pages one after the other; the Me tab
 * keeps showing both switches afterwards (components/profile/CallOverlaySection.tsx).
 */

export type AccessStep = 'overApps' | 'fullScreen';

export interface CallAccess {
  /** This build has the native side (an older APK does not). */
  available: boolean;
  overApps: boolean;
  fullScreen: boolean;
}

/**
 * The next settings page to open, or null when nothing is missing (or this build cannot use them). "Display over other apps"
 * comes first: it is what lets the call screen open at once over whatever is on screen, on every Android version.
 */
export function nextAccessStep(access: CallAccess): AccessStep | null {
  if (!access.available) return null;
  if (!access.overApps) return 'overApps';
  if (!access.fullScreen) return 'fullScreen';
  return null;
}

/** The first prompt is shown once per phone, and only when something is actually missing. */
export const shouldAskForCallAccess = (input: { alreadyAsked: boolean; access: CallAccess }): boolean =>
  !input.alreadyAsked && nextAccessStep(input.access) !== null;

export interface AccessText {
  title: string;
  message: string;
}

/** The first prompt: what this is for, and that the sounds themselves need nothing. */
export const INTRO_TEXT: AccessText = {
  title: 'Let SYPH show your calls',
  message:
    "SYPH rings with your phone's own ringtone and plays your phone's notification sound, so there is nothing to allow for " +
    'sound. To open the call screen when SYPH is closed or another app is on screen, Android needs two switches from you. ' +
    'They open one after the other.',
};

const STEP_TEXT: Record<AccessStep, AccessText> = {
  overApps: {
    title: 'Display over other apps',
    message: 'Lets a call open full screen over whatever you are doing, and shows a small call bubble while you use another app.',
  },
  fullScreen: {
    title: 'Full-screen call alerts',
    message: 'Lets a ringing call take over the lock screen. Android 14 and newer keep this off for SYPH until you allow it.',
  },
};

export const accessStepText = (step: AccessStep): AccessText => STEP_TEXT[step];
