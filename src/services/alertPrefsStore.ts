/**
 * alertPrefsStore.ts
 * The person's sound and vibration choices (utils/alertPrefs.ts), kept on this phone.
 *
 * They are stored locally and not in Firestore on purpose: a ringtone is a thing about one phone, not about the account,
 * and it needs no security rules. A module-level store (not React state) so non-React code, like the ring loop, can read the
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
  .catch((error: unknown) => console.warn('Could not read sound settings:', error instanceof Error ? error.message : error));

export const useAlertPrefs = (): AlertPrefs => useSyncExternalStore(subscribe, () => prefs, () => DEFAULT_ALERT_PREFS);
