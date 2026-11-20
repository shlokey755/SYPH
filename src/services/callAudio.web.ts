/**
 * callAudio.web.ts
 * The browser version of services/callAudio.ts. A browser has no call-audio routing to take over (the voice comes out of
 * whatever the computer plays on), so those functions do nothing and say so, as the phone's do in Expo Go.
 *
 * What a browser can do is ring. The phone plays its own ringtone and tone; a browser has none and SYPH ships no sound files,
 * so the person being called hears a ring and the caller hears the usual "tu-tu", both drawn with the Web Audio API
 * (utils/ringTones.ts, played by services/webRinger.ts). While it rings, the tab's title flashes, so a call is seen from
 * another tab too.
 *
 * A browser only plays sound once the person has clicked or pressed a key in the page. Signing in is a click, so by the time
 * a call can come in that is behind them: the first click or key press wakes the audio for the rest of the visit, and a ring
 * that comes before it starts the moment it happens.
 */

import type { CallType } from '../types';
import type { AudioRoute, RouteState } from '../utils/audioRoute';
import { RING_MAX_MS, RINGBACK_MAX_MS, ringbackNotes, ringNotes } from '../utils/ringTones';
import { createRinger, type AudioLike } from './webRinger';

// ----- the browser's audio and tab -----

let context: AudioLike | null | undefined;

/** One audio context for the whole visit, made on first use. Browsers allow only a handful per page. */
function pageAudio(): AudioLike | null {
  if (context !== undefined) return context;
  const scope = globalThis as { AudioContext?: new () => AudioLike; webkitAudioContext?: new () => AudioLike };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  try {
    context = Context ? new Context() : null;
  } catch (error) {
    console.warn('Call tone (audio):', error instanceof Error ? error.message : error);
    context = null;
  }
  return context;
}

// Presses a browser counts as the person using the page (touch devices count the finger lifting).
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
let listening = false;

function onGesture(): void {
  void ringer.unlock().then((allowed) => {
    if (allowed) stopListening();
  });
}

function listenForGesture(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  for (const type of GESTURES) document.addEventListener(type, onGesture, { capture: true, passive: true });
}

function stopListening(): void {
  listening = false;
  for (const type of GESTURES) document.removeEventListener(type, onGesture, { capture: true });
}

const ringer = createRinger({
  audio: pageAudio,
  title:
    typeof document === 'undefined'
      ? null
      : {
          get: () => document.title,
          set: (value) => {
            document.title = value;
          },
        },
  waitForGesture: listenForGesture,
});

// Wake the audio on the first click, long before a call comes. Not on a server, which builds the pages and has no document.
listenForGesture();

// ----- the same functions as the phone's callAudio.ts -----

/** A browser has no audio routing to take over. */
export const startCallAudio = (_type: CallType): boolean => false;

export async function ensureBluetoothAccess(): Promise<boolean> {
  return false;
}

export function onAudioRouteChange(_listener: (state: RouteState) => void): () => void {
  return () => {};
}

export const chooseCallRoute = (_route: AudioRoute): boolean => false;

export const stopCallAudio = (): boolean => false;

/**
 * Rings for an incoming call: the tone from utils/ringTones.ts, looping until stopped. A browser cannot buzz, so `pattern`
 * is not used. `seconds` > 0 stops it by itself after that long. False when the browser cannot play sound, so the caller can
 * fall back to buzzing (which a browser then ignores).
 */
export const startRinging = (_pattern: number[] | null, seconds = 0): boolean => {
  const ms = seconds > 0 ? Math.min(seconds * 1000, RING_MAX_MS) : RING_MAX_MS;
  return ringer.start('ring', ringNotes(ms), ms);
};

export const stopRinging = (): boolean => ringer.stop('ring');

/** The "tu-tu" the caller hears while the other end rings. */
export const startRingback = (): boolean => ringer.start('ringback', ringbackNotes(RINGBACK_MAX_MS), RINGBACK_MAX_MS);

export const stopRingback = (): boolean => ringer.stop('ringback');
