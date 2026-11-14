/**
 * alertSounds.ts
 * Sounds and buzzes while SYPH is open: the sound of a new message, the tick under the finger, the pulses of a call.
 * The decisions (how loud, which buzz) are in utils/alertPrefs.ts; this file only carries them out.
 *
 * SYPH has no sound files. The message sound is the phone's own notification sound, played by the native call helper
 * (modules/syph-call-service, `playMessageSound`); a ringing call uses the phone's ringtone through react-native-incall-manager
 * (services/callAudio.ts). A build without the native helper (an older APK that received this code over the air) simply plays
 * no message sound and only buzzes. Buzzing uses the phone's own vibrator (React Native's Vibration), which every build has.
 */

import { AppState, Vibration } from 'react-native';
import { getActiveCall } from './activeCallStore';
import { getAlertPrefs } from './alertPrefsStore';
import { playPhoneMessageSound } from './callOverlay';
import {
  CallFeel,
  callFeelPattern,
  MESSAGE_BUZZ_PATTERN,
  MessageAlertPlan,
  messageAlertPlan,
  TOUCH_TICK_MS,
  touchTickMs,
} from '../utils/alertPrefs';

/** Buzzes with an Android pattern ([wait, buzz, pause, buzz, ...]). Never throws: a missing vibrator is not an error. */
export function buzz(pattern: number[] | number): void {
  try {
    Vibration.vibrate(pattern);
  } catch {
    // no vibrator, or the permission was removed
  }
}

export function stopBuzz(): void {
  try {
    Vibration.cancel();
  } catch {
    // nothing to stop
  }
}

/** Carries out a message alert plan: the phone's notification sound (not during a call, so it does not cut into the conversation) and the buzz. */
export function runMessageAlert(plan: MessageAlertPlan, inCall: boolean): void {
  if (!inCall) playPhoneMessageSound(plan.volume);
  if (plan.buzz === 'buzz') buzz([...MESSAGE_BUZZ_PATTERN]);
  else if (plan.buzz === 'tick') buzz(TOUCH_TICK_MS);
}

/**
 * A new message arrived while SYPH is open. `chatIsOpen`: it is in the chat the person is looking at.
 * Nothing when SYPH is in the background but still running: Android shows its own notification for the message then, with
 * its own sound, and two alerts for one message would be one too many.
 */
export function alertNewMessage(chatIsOpen: boolean): void {
  if (AppState.currentState !== 'active') return;
  const active = getActiveCall();
  runMessageAlert(messageAlertPlan(getAlertPrefs(), chatIsOpen), active !== null);
}

/** The small tick when a message is sent. */
export function tickOnSend(): void {
  const ms = touchTickMs(getAlertPrefs());
  if (ms !== null) buzz(ms);
}

/** The pulse when a call connects, and the two short ones when it ends. */
export function feelCall(feel: CallFeel): void {
  const pattern = callFeelPattern(getAlertPrefs(), feel);
  if (pattern) buzz(pattern);
}
