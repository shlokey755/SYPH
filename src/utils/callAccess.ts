/**
 * callAccess.ts
 * Pure rules for the permissions SYPH asks for when the app starts. No React, no native code, so plain Node can test it.
 *
 * SYPH rings with the phone's own ringtone and plays the phone's own notification sound. Three things from the person make
 * that, and showing a call over the lock screen or another app, work:
 *   - ringtone: permission to read audio files, because the ringtone or notification sound the person chose can be a file on
 *     the phone (a normal runtime permission dialog)
 *   - overApps: "Display over other apps" (its own Android settings page)
 *   - fullScreen: "Full-screen call alerts", Android 14 and newer (its own Android settings page)
 * Android does not let an app switch the last two on by itself, so SYPH can only explain and open the page.
 *
 * Each one is asked once per phone, at the start of the app (hooks/useCallAccessPrompt.ts). After that they are changed in
 * the phone's own settings for SYPH; there is no switch in the Me tab.
 */

export type AccessStep = 'ringtone' | 'overApps' | 'fullScreen';

/** The order they are asked in. */
export const ACCESS_STEPS: readonly AccessStep[] = ['ringtone', 'overApps', 'fullScreen'];

export interface CallAccess {
  /** None of this exists on iOS or web. */
  android: boolean;
  /** This build has the native call helper. Expo Go and an older APK do not, so the two settings pages cannot be opened. */
  native: boolean;
  /** SYPH may read the phone's audio files (the ringtone and notification sound). */
  ringtone: boolean;
  /** "Display over other apps" is on for SYPH. */
  overApps: boolean;
  /** Full-screen call alerts are allowed (always true before Android 14). */
  fullScreen: boolean;
}

/** Everything that is off and can be turned on from this build, in the order it is asked. */
export function missingSteps(access: CallAccess): AccessStep[] {
  if (!access.android) return [];
  const missing: AccessStep[] = [];
  if (!access.ringtone) missing.push('ringtone');
  if (access.native && !access.overApps) missing.push('overApps');
  if (access.native && !access.fullScreen) missing.push('fullScreen');
  return missing;
}

/**
 * The next thing to ask: the first one that is still off and that the person has not been asked about on this phone yet.
 * Null when nothing is left, so a permission the person turned down is not asked for again.
 */
export const nextAccessStep = (access: CallAccess, asked: readonly AccessStep[]): AccessStep | null =>
  missingSteps(access).find((step) => !asked.includes(step)) ?? null;

/** What is saved on the phone: the steps already asked, as a JSON list. Anything unreadable counts as "none". */
export function parseAsked(raw: string | null | undefined): AccessStep[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return ACCESS_STEPS.filter((step) => parsed.includes(step));
  } catch {
    return [];
  }
}

export const serializeAsked = (asked: readonly AccessStep[]): string => JSON.stringify(ACCESS_STEPS.filter((step) => asked.includes(step)));

/** Android 13 (API 33) replaced "read external storage" with a permission for audio files alone. */
export const usesMediaAudioPermission = (apiLevel: number): boolean => apiLevel >= 33;

export interface AccessText {
  title: string;
  message: string;
  /** The button that goes on to the permission dialog or the settings page. */
  action: string;
}

const LATER = " You can change this later in your phone's settings for SYPH.";

const STEP_TEXT: Record<AccessStep, AccessText> = {
  ringtone: {
    title: "Use your phone's ringtone",
    message:
      "SYPH rings with the ringtone and plays the notification sound you chose in your phone's settings. Android asks to read your audio files so it can play them." +
      LATER,
    action: 'Allow',
  },
  overApps: {
    title: 'Display over other apps',
    message:
      'Lets a call open full screen over whatever you are doing, and shows a small call bubble while you use another app. The next page has a switch for SYPH.' +
      LATER,
    action: 'Open settings',
  },
  fullScreen: {
    title: 'Full-screen call alerts',
    message:
      'Lets a ringing call take over the lock screen. Android 14 and newer keep this off for SYPH until you allow it.' + LATER,
    action: 'Open settings',
  },
};

export const accessStepText = (step: AccessStep): AccessText => STEP_TEXT[step];
