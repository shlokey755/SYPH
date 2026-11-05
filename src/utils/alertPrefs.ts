/**
 * alertPrefs.ts
 * Pure rules for SYPH's sounds and vibration: the person's choices, what a ringing call does, and what a new message does.
 * No React, no native code, no storage: keep it dependency-free so it can be unit tested with plain Node.
 *
 * Where the choices apply (they live on this phone only, see services/alertPrefsStore.ts):
 *   - an incoming call that rings while SYPH is open
 *   - the message alert while SYPH is open
 *   - small taps and buzzes in the app
 * Alerts while SYPH is closed are drawn by Android from the notification channels (services/pushService.ts), and follow
 * the phone's own notification settings.
 */

export type RingtoneId = 'syph' | 'phone';
export type MessageToneId = 'syph' | 'pop' | 'drop' | 'off';

export interface AlertPrefs {
  /** Buzzing for ringing calls and new messages. */
  vibrate: boolean;
  /** The small tick when pressing send, and the pulses when a call connects or ends. */
  touchFeedback: boolean;
  ringtone: RingtoneId;
  messageTone: MessageToneId;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  vibrate: true,
  touchFeedback: true,
  ringtone: 'syph',
  messageTone: 'syph',
};

export const RINGTONES: readonly { id: RingtoneId; label: string; hint: string }[] = [
  { id: 'syph', label: 'SYPH', hint: 'The SYPH ringtone' },
  { id: 'phone', label: 'Phone ringtone', hint: 'Whatever your phone rings with' },
];

export const MESSAGE_TONES: readonly { id: MessageToneId; label: string }[] = [
  { id: 'syph', label: 'SYPH' },
  { id: 'pop', label: 'Pop' },
  { id: 'drop', label: 'Drop' },
  { id: 'off', label: 'Silent' },
];

const isRingtone = (value: unknown): value is RingtoneId => RINGTONES.some((tone) => tone.id === value);
const isMessageTone = (value: unknown): value is MessageToneId => MESSAGE_TONES.some((tone) => tone.id === value);

/** Reads saved choices, ignoring anything that is missing or not understood (an older or damaged save). */
export function normalizeAlertPrefs(raw: unknown): AlertPrefs {
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    vibrate: typeof data.vibrate === 'boolean' ? data.vibrate : DEFAULT_ALERT_PREFS.vibrate,
    touchFeedback: typeof data.touchFeedback === 'boolean' ? data.touchFeedback : DEFAULT_ALERT_PREFS.touchFeedback,
    ringtone: isRingtone(data.ringtone) ? data.ringtone : DEFAULT_ALERT_PREFS.ringtone,
    messageTone: isMessageTone(data.messageTone) ? data.messageTone : DEFAULT_ALERT_PREFS.messageTone,
  };
}

// ----- ringing calls -----

/** Longest a call rings (the caller gives up after 45 s, see RING_TIMEOUT_MS in utils/call.ts), plus a little slack. */
export const MAX_RING_MS = 50_000;

/** One round of the buzz: two pulses, then a rest. Its length matches the bundled ringtone (about 3.1 s). */
const BUZZ_CYCLE = [400, 150, 400, 2130];

/**
 * A vibration pattern for a ringing phone, in Android's format: [wait, buzz, pause, buzz, pause, ...]. Android plays a
 * pattern once, so it is written out long enough to last for the whole ring.
 */
export function ringVibrationPattern(durationMs: number = MAX_RING_MS): number[] {
  const pattern = [0];
  let total = 0;
  while (total < durationMs) {
    for (const part of BUZZ_CYCLE) {
      pattern.push(part);
      total += part;
    }
  }
  // Position 0 is the wait before the first buzz, so buzzes sit at odd positions and the pattern ends on a pause.
  return pattern;
}

/** Names the two ringtones react-native-incall-manager understands: its bundled file, or the phone's own ringtone. */
export type RingtoneSource = '_BUNDLE_' | '_DEFAULT_';

export interface RingPlan {
  source: RingtoneSource;
  /** Null when vibration is off. */
  pattern: number[] | null;
}

/**
 * What a ringing call does. The SYPH ringtone is a file inside the app, so it exists only in a build made after it was
 * added (`hasBundledSounds`); an older build rings with the phone's own ringtone instead of staying silent.
 */
export const ringPlan = (prefs: AlertPrefs, hasBundledSounds: boolean): RingPlan => ({
  source: prefs.ringtone === 'phone' || !hasBundledSounds ? '_DEFAULT_' : '_BUNDLE_',
  pattern: prefs.vibrate ? ringVibrationPattern() : null,
});

/** The tick under the finger when a message is sent. Null when touch feedback is off. */
export const TOUCH_TICK_MS = 12;
export const touchTickMs = (prefs: AlertPrefs): number | null => (prefs.touchFeedback ? TOUCH_TICK_MS : null);

// ----- new messages -----

export type MessageBuzz = 'buzz' | 'tick' | null;

export interface MessageAlertPlan {
  /** The tone to play, or null for none. */
  tone: Exclude<MessageToneId, 'off'> | null;
  /** 0 to 1. */
  volume: number;
  /** `buzz` is a short double pulse for a message in another chat; `tick` a light touch for the chat being read. */
  buzz: MessageBuzz;
}

/** The chat being read gets a quieter, gentler alert than one that arrives while the person is somewhere else. */
export function messageAlertPlan(prefs: AlertPrefs, chatIsOpen: boolean): MessageAlertPlan {
  return {
    tone: prefs.messageTone === 'off' ? null : prefs.messageTone,
    volume: chatIsOpen ? 0.45 : 1,
    buzz: !prefs.vibrate ? null : chatIsOpen ? 'tick' : 'buzz',
  };
}

/** Pattern for the double pulse of a message in another chat. */
export const MESSAGE_BUZZ_PATTERN: readonly number[] = [0, 45, 70, 45];

// ----- call events -----

export type CallFeel = 'connected' | 'ended';

/** What to feel when a call connects (one firm pulse) or ends (two short ones). Null when touch feedback is off. */
export function callFeelPattern(prefs: AlertPrefs, feel: CallFeel): number[] | null {
  if (!prefs.touchFeedback) return null;
  return feel === 'connected' ? [0, 70] : [0, 40, 80, 40];
}
