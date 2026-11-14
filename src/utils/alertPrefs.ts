/**
 * alertPrefs.ts
 * Pure rules for SYPH's vibration and sounds: the person's choices, what a ringing call does, and what a new message does.
 * No React, no native code, no storage: keep it dependency-free so it can be unit tested with plain Node.
 *
 * SYPH has no sounds of its own. A ringing call uses the phone's ringtone and a new message the phone's notification sound,
 * whatever the person picked in Android's settings; the only choices kept here are the two kinds of buzz (they live on this
 * phone only, see services/alertPrefsStore.ts). They apply while SYPH is open. While it is closed Android makes the alert from
 * the notification channel, so the person changes it in the phone's notification settings for SYPH.
 */

export interface AlertPrefs {
  /** Buzzing for ringing calls and new messages. */
  vibrate: boolean;
  /** The small tick when pressing send, and the pulses when a call connects or ends. */
  touchFeedback: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  vibrate: true,
  touchFeedback: true,
};

/** Reads saved choices, ignoring anything that is missing or not understood (an older or damaged save, or the retired tone keys). */
export function normalizeAlertPrefs(raw: unknown): AlertPrefs {
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    vibrate: typeof data.vibrate === 'boolean' ? data.vibrate : DEFAULT_ALERT_PREFS.vibrate,
    touchFeedback: typeof data.touchFeedback === 'boolean' ? data.touchFeedback : DEFAULT_ALERT_PREFS.touchFeedback,
  };
}

// ----- ringing calls -----

/** Longest a call rings (the caller gives up after 45 s, see RING_TIMEOUT_MS in utils/call.ts), plus a little slack. */
export const MAX_RING_MS = 50_000;

/** One round of the buzz: two pulses, then a rest (about 3.1 s, the usual rhythm of a phone ringing). */
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

export interface RingPlan {
  /** Null when vibration is off. */
  pattern: number[] | null;
}

/** What a ringing call does: the phone's ringtone (always), and the buzz when the person has vibration on. */
export const ringPlan = (prefs: AlertPrefs): RingPlan => ({
  pattern: prefs.vibrate ? ringVibrationPattern() : null,
});

/** The tick under the finger when a message is sent. Null when touch feedback is off. */
export const TOUCH_TICK_MS = 12;
export const touchTickMs = (prefs: AlertPrefs): number | null => (prefs.touchFeedback ? TOUCH_TICK_MS : null);

// ----- new messages -----

export type MessageBuzz = 'buzz' | 'tick' | null;

export interface MessageAlertPlan {
  /** 0 to 1: how loud the phone's notification sound is played. */
  volume: number;
  /** `buzz` is a short double pulse for a message in another chat; `tick` a light touch for the chat being read. */
  buzz: MessageBuzz;
}

/** The chat being read gets a quieter, gentler alert than one that arrives while the person is somewhere else. */
export function messageAlertPlan(prefs: AlertPrefs, chatIsOpen: boolean): MessageAlertPlan {
  return {
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
