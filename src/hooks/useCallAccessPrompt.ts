/**
 * useCallAccessPrompt.ts
 * Asks for what ringing and showing a call needs when the app starts, once per phone for each of the three (the rules are in
 * utils/callAccess.ts): the audio-files permission for the phone's own ringtone and notification sound, then "Display over
 * other apps", then full-screen call alerts. Each one gets a short explanation first; the last two then open their Android
 * settings page, since Android does not let an app switch them on itself, and the next one follows when the person is back.
 *
 * After that they are changed in the phone's own settings for SYPH, not inside the app. Not asked while the person is on a
 * call screen, and not at all on iOS and web. The two settings pages are only asked for in a build that has the native call
 * helper.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { Alert, AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  canDrawOverApps,
  canUseFullScreen,
  isOverlayAvailable,
  openFullScreenSettings,
  openOverlaySettings,
} from '../services/callOverlay';
import {
  ACCESS_STEPS,
  AccessStep,
  CallAccess,
  accessStepText,
  nextAccessStep,
  parseAsked,
  serializeAsked,
  usesMediaAudioPermission,
} from '../utils/callAccess';

const ASKED_KEY = 'syph.permissionsAsked.v1';
/** A moment after the app is ready, so the first screen is up before the first question. */
const START_DELAY_MS = 1500;
/** The pause after coming back from a settings page, so the app is on screen again before the next question. */
const RETURN_DELAY_MS = 400;

// Module scope: one pass per run of the app, however often the screen that mounts this remounts.
let started = false;

const ringtonePermission = () =>
  usesMediaAudioPermission(Number(Platform.Version))
    ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
    : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

async function readAccess(): Promise<CallAccess> {
  let ringtone = true; // when Android cannot say, do not ask
  try {
    ringtone = await PermissionsAndroid.check(ringtonePermission());
  } catch {
    // keep true
  }
  return {
    android: Platform.OS === 'android',
    native: isOverlayAvailable(),
    ringtone,
    overApps: canDrawOverApps(),
    fullScreen: canUseFullScreen(),
  };
}

/** The explanation, with a way out. Resolves true for the button that goes on. */
function explain(step: AccessStep): Promise<boolean> {
  const text = accessStepText(step);
  return new Promise((resolve) => {
    Alert.alert(
      text.title,
      text.message,
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: text.action, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/** Opens a settings page and resolves once the person is back in SYPH. The listener is set first: the app can leave at once. */
async function throughSettings(open: () => boolean): Promise<void> {
  let left = false;
  let finish: () => void = () => {};
  const back = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const subscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') left = true;
    else if (left) setTimeout(finish, RETURN_DELAY_MS);
  });
  try {
    if (open()) await back;
  } finally {
    subscription.remove();
  }
}

async function carryOut(step: AccessStep): Promise<void> {
  if (step === 'ringtone') {
    await PermissionsAndroid.request(ringtonePermission()).catch(() => null);
  } else if (step === 'overApps') {
    await throughSettings(openOverlaySettings);
  } else {
    await throughSettings(openFullScreenSettings);
  }
}

async function askAll(): Promise<void> {
  let saved: string | null;
  try {
    saved = await AsyncStorage.getItem(ASKED_KEY);
  } catch {
    return; // cannot remember what was asked, so do not risk asking on every start
  }
  const asked = parseAsked(saved);
  // Read again after every step: the person may have turned on more than the one that was asked.
  for (let round = 0; round < ACCESS_STEPS.length; round++) {
    const step = nextAccessStep(await readAccess(), asked);
    if (!step) return;
    asked.push(step);
    await AsyncStorage.setItem(ASKED_KEY, serializeAsked(asked)).catch(() => {});
    if (await explain(step)) await carryOut(step);
  }
}

/** `ready` is true once the app has finished starting and the person is not on a call screen. */
export function useCallAccessPrompt(ready: boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'android' || !ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Started by a push while the app was in the background: wait until it is on screen.
    const schedule = () => {
      clearTimeout(timer);
      if (started || AppState.currentState !== 'active') return;
      timer = setTimeout(() => {
        if (started || AppState.currentState !== 'active') return;
        started = true;
        askAll().catch((error) => console.warn('Permission prompt failed:', error?.message ?? error));
      }, START_DELAY_MS);
    };

    schedule();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule();
      else clearTimeout(timer);
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [ready]);
}
