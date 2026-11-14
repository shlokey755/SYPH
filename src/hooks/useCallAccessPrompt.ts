/**
 * useCallAccessPrompt.ts
 * Once per phone, after sign-in, explains what showing a call over other apps and the lock screen needs and opens the two
 * Android settings pages for it, one after the other (the rules are in utils/callAccess.ts). Android does not let an app turn
 * these on by itself, so all SYPH can do is ask and open the page; the Me tab keeps both switches for later.
 *
 * Nothing happens on iOS and web, in an APK that has no native call helper, or when both switches are already on.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import {
  canDrawOverApps,
  canUseFullScreen,
  isOverlayAvailable,
  openFullScreenSettings,
  openOverlaySettings,
} from '../services/callOverlay';
import {
  accessStepText,
  AccessStep,
  CallAccess,
  INTRO_TEXT,
  nextAccessStep,
  shouldAskForCallAccess,
} from '../utils/callAccess';

const ASKED_KEY = 'syph.callAccessAsked.v1';
/** A moment after start, so it does not land on top of Android's own notification permission dialog. */
const START_DELAY_MS = 3000;

const readAccess = (): CallAccess => ({
  available: isOverlayAvailable(),
  overApps: canDrawOverApps(),
  fullScreen: canUseFullScreen(),
});

const open = (step: AccessStep) => (step === 'overApps' ? openOverlaySettings() : openFullScreenSettings());

// Module scope: one prompt per run of the app, however often the screen that mounts this remounts.
let shownThisRun = false;
let followUp = false;

function askForStep(step: AccessStep, intro: boolean) {
  const text = intro ? INTRO_TEXT : accessStepText(step);
  const message = intro ? `${text.message}\n\nFirst: ${accessStepText(step).title}. ${accessStepText(step).message}` : text.message;
  Alert.alert(text.title, message, [
    {
      text: 'Not now',
      style: 'cancel',
      onPress: () => {
        followUp = false;
      },
    },
    {
      text: 'Open settings',
      onPress: () => {
        followUp = true;
        open(step);
      },
    },
  ]);
}

export function useCallAccessPrompt(uid: string | undefined, ready: boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'android' || !uid || !ready || !isOverlayAvailable()) return;

    // Back from a settings page: if the other switch is still off, offer it.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !followUp) return;
      followUp = false;
      const step = nextAccessStep(readAccess());
      if (step) setTimeout(() => askForStep(step, false), 400);
    });

    let cancelled = false;
    const timer = setTimeout(() => {
      if (shownThisRun || AppState.currentState !== 'active') return;
      AsyncStorage.getItem(ASKED_KEY)
        .catch(() => null)
        .then((saved) => {
          if (cancelled || shownThisRun) return;
          const access = readAccess();
          if (!shouldAskForCallAccess({ alreadyAsked: saved !== null, access })) {
            if (saved === null && nextAccessStep(access) === null) void AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
            return;
          }
          const step = nextAccessStep(access);
          if (!step) return;
          shownThisRun = true;
          void AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
          askForStep(step, true);
        });
    }, START_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.remove();
    };
  }, [uid, ready]);
}
