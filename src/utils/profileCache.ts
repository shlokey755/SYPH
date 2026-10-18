/**
 * profileCache.ts
 * Pure helpers for the on-device copy of the signed-in user's profile (see services/profileCache.ts).
 * Kept free of React Native imports so it can be unit tested.
 */

import type { UserProfile } from '../types';

/** The fields the app needs before the network has answered. */
export type CachedProfile = Pick<
  UserProfile,
  'uid' | 'username' | 'usernameLowercase' | 'displayName' | 'profileImageUrl' | 'status' | 'theme'
>;

/** Bump when the shape changes, so an older copy is ignored instead of misread. */
export const PROFILE_CACHE_VERSION = 1;

export const profileCacheKey = (uid: string) => `syph.profile.v${PROFILE_CACHE_VERSION}.${uid}`;

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** What gets stored: only plain strings, never timestamps. */
export function serializeProfile(profile: UserProfile): string {
  const cached: CachedProfile = {
    uid: profile.uid,
    username: profile.username,
    usernameLowercase: profile.usernameLowercase,
    displayName: profile.displayName,
    profileImageUrl: profile.profileImageUrl,
    status: profile.status,
    theme: profile.theme,
  };
  return JSON.stringify(cached);
}

/**
 * Reads a stored copy back. Returns null for anything that is missing, corrupt, or belongs to a different account,
 * in which case the caller just waits for the server like before.
 */
export function parseCachedProfile(raw: string | null | undefined, uid: string): CachedProfile | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return null;
    if (data.uid !== uid) return null;
    const username = optionalString(data.username);
    if (!username) return null;
    return {
      uid,
      username,
      usernameLowercase: optionalString(data.usernameLowercase),
      displayName: optionalString(data.displayName) || username,
      profileImageUrl: optionalString(data.profileImageUrl),
      status: optionalString(data.status),
      theme: optionalString(data.theme),
    };
  } catch {
    return null;
  }
}
