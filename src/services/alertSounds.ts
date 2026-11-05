/**
 * alertSounds.ts
 * Plays SYPH's short sounds and buzzes the phone: the message tone, the tick under the finger, the pulses of a call.
 * The decisions (which tone, how loud, which buzz) are in utils/alertPrefs.ts; this file only carries them out.
 *
 * Buzzing uses the phone's own vibrator (React Native's Vibration), which every build has. Sound uses expo-audio, a
 * native module that only builds made after it was added contain. It is loaded only when its native part is there, so
 * an older build that receives this code over the air keeps working, just without the tone. `hasBundledSounds()` says
 * which kind of build this is; the SYPH ringtone file (copied into the app by the build, see app.json) arrives together
 * with expo-audio, so the one check answers for both.
 */

import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform, Vibration } from 'react-native';
import { getActiveCall } from './activeCallStore';
import { getAlertPrefs } from './alertPrefsStore';
import {
  CallFeel,
  callFeelPattern,
  MESSAGE_BUZZ_PATTERN,
  MessageAlertPlan,
  messageAlertPlan,
  MessageToneId,
  TOUCH_TICK_MS,
  touchTickMs,
} from '../utils/alertPrefs';

type AudioModule = typeof import('expo-audio');
type Player = ReturnType<AudioModule['createAudioPlayer']>;
type PlayableTone = Exclude<MessageToneId, 'off'>;

/** True in a build that contains the bundled sounds (the SYPH ringtone, and expo-audio to play the message tones). */
export function hasBundledSounds(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return requireOptionalNativeModule('ExpoAudio') != null;
  } catch {
    return false;
  }
}

let audio: AudioModule | null | undefined;
function getAudio(): AudioModule | null {
  if (audio !== undefined) return audio;
  if (!hasBundledSounds()) {
    audio = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audio = require('expo-audio') as AudioModule;
  } catch (error) {
    console.warn('expo-audio is unavailable:', error instanceof Error ? error.message : error);
    audio = null;
  }
  return audio;
}

/** One player per tone, made the first time it is needed and then reused (they are a few kilobytes each). */
const players = new Map<PlayableTone, Player>();

const TONE_FILES: Record<PlayableTone, number> = {
  syph: require('../../assets/sounds/syph_message.wav'),
  pop: require('../../assets/sounds/msg_pop.wav'),
  drop: require('../../assets/sounds/msg_drop.wav'),
};

/** Plays a message tone once. False when this build cannot play sound. */
export function playTone(tone: PlayableTone, volume = 1): boolean {
  const module = getAudio();
  if (!module) return false;
  try {
    let player = players.get(tone);
    if (!player) {
      player = module.createAudioPlayer(TONE_FILES[tone]);
      players.set(tone, player);
    }
    player.volume = Math.min(1, Math.max(0, volume));
    // Back to the start first, so a tone that is still playing from a moment ago sounds again.
    void player.seekTo(0).catch(() => {});
    player.play();
    return true;
  } catch (error) {
    console.warn('Could not play a tone:', error instanceof Error ? error.message : error);
    return false;
  }
}

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

/** Carries out a message alert plan: the tone (not during a call, so it does not cut into the conversation) and the buzz. */
export function runMessageAlert(plan: MessageAlertPlan, inCall: boolean): void {
  if (plan.tone && !inCall) playTone(plan.tone, plan.volume);
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
