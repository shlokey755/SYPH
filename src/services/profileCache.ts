/**
 * profileCache.ts
 * Keeps a copy of the signed-in user's profile on the device so the app can open straight into the chat list
 * instead of waiting for a network round trip (NFR-02). The server copy still wins: it is fetched right after and
 * replaces this one. Every call is best effort; a storage problem just means the old, slower path.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserProfile } from '../types';
import { CachedProfile, parseCachedProfile, profileCacheKey, serializeProfile } from '../utils/profileCache';

export async function readCachedProfile(uid: string): Promise<CachedProfile | null> {
  try {
    return parseCachedProfile(await AsyncStorage.getItem(profileCacheKey(uid)), uid);
  } catch {
    return null;
  }
}

export async function writeCachedProfile(profile: UserProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(profileCacheKey(profile.uid), serializeProfile(profile));
  } catch {
    // ignore
  }
}

/**
 * Changes fields of the cached copy without waiting for the server. The theme and the colour wheel use it: they are applied from
 * this copy when the app starts, so a copy that still held the old choice would put it back.
 */
export async function patchCachedProfile(uid: string, patch: Partial<Pick<CachedProfile, 'theme' | 'accentHue'>>): Promise<void> {
  try {
    const cached = parseCachedProfile(await AsyncStorage.getItem(profileCacheKey(uid)), uid);
    if (!cached) return;
    await AsyncStorage.setItem(profileCacheKey(uid), JSON.stringify({ ...cached, ...patch }));
  } catch {
    // ignore
  }
}

/** Called at sign-out so a shared phone does not keep the previous person's profile. */
export async function clearCachedProfile(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(profileCacheKey(uid));
  } catch {
    // ignore
  }
}
