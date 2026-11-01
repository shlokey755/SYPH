/**
 * liveLocationStore.ts
 * The live location shares this phone is running, saved on the device (see utils/liveShares.ts). The background task
 * and the app both read and change the list, so every change goes through one queue: two changes never overwrite each
 * other inside the same JavaScript runtime.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SHARES_STORAGE_KEY, StoredShare, parseStoredShares, serializeShares } from '../utils/liveShares';

export async function loadShares(): Promise<StoredShare[]> {
  try {
    return parseStoredShares(await AsyncStorage.getItem(SHARES_STORAGE_KEY));
  } catch {
    return [];
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Reads the list, applies `change` (pure, synchronous) and saves the result. Resolves with the saved list. */
export function updateShares(change: (current: StoredShare[]) => StoredShare[]): Promise<StoredShare[]> {
  const run = async (): Promise<StoredShare[]> => {
    const next = change(await loadShares());
    try {
      if (next.length === 0) await AsyncStorage.removeItem(SHARES_STORAGE_KEY);
      else await AsyncStorage.setItem(SHARES_STORAGE_KEY, serializeShares(next));
    } catch (error) {
      console.warn('Live location: could not save shares:', error instanceof Error ? error.message : error);
    }
    return next;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
