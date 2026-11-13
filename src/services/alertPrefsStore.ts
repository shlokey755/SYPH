/**
 * alertPrefsStore.ts
 * The person's sound and vibration choices (utils/alertPrefs.ts), kept on this phone.
 *
 * They are stored on this phone. The message tone, ringtone and vibration choice are also copied to the account (see
 * components/PushNotificationsBridge.tsx) so the sender's phone can pick the right notification channel while SYPH is closed;
 * touch feedback stays on this phone only. A module-level store (not React state) so non-React code, like the ring loop, can read the
 * current choice, and screens can still subscribe with `useAlertPrefs`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AlertPrefs, DEFAULT_ALERT_PREFS, normalizeAlertPrefs } from '../utils/alertPrefs';

const STORAGE_KEY = 'syph.alertPrefs.v1';

let prefs: AlertPrefs = DEFAULT_ALERT_PREFS;
/** True once the person changed something, so a slow load of the saved copy can never overwrite their change. */
let touched = false;
const listeners = new Set<() => void>();
/** Called with the new choices each time the person changes one (not when the saved copy is loaded). */
const changeListeners = new Set<(next: AlertPrefs) => void>();
let markReady: () => void = () => {};
const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});

const publish = (next: AlertPrefs) => {
  prefs = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The current choices, for code that is not a component. */
export const getAlertPrefs = (): AlertPrefs => prefs;

/** Changes some choices and saves them. */
export function setAlertPrefs(patch: Partial<AlertPrefs>): void {
  touched = true;
  publish(normalizeAlertPrefs({ ...prefs, ...patch }));
  changeListeners.forEach((listener) => listener(prefs));
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch((error: unknown) =>
    console.warn('Could not save sound settings:', error instanceof Error ? error.message : error)
  );
}

// Load the saved copy as soon as anything imports this file; until then (a moment) the defaults apply.
AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => {
    if (touched || !saved) return;
    try {
      publish(normalizeAlertPrefs(JSON.parse(saved)));
    } catch {
      // A damaged copy: keep the defaults.
    }
  })
  .catch((error: unknown) => console.warn('Could not read sound settings:', error instanceof Error ? error.message : error))
  .finally(() => markReady());

/** Resolves with the choices once the saved copy has been read (or found missing), so nothing acts on defaults by mistake. */
export const whenAlertPrefsReady = (): Promise<AlertPrefs> => ready.then(() => prefs);

/** Calls `listener` whenever the person changes a choice. Returns a function that stops listening. */
export function onAlertPrefsChanged(listener: (next: AlertPrefs) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

export const useAlertPrefs = (): AlertPrefs => useSyncExternalStore(subscribe, () => prefs, () => DEFAULT_ALERT_PREFS);
