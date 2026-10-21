/**
 * pushTargets.ts
 * Looks up where (and whether) to notify a user, from the sender's side.
 *
 *   userPush/{uid}        devices, master switch and muted chats, mirrored from the owner's private settings
 *   pushTokens/{token}    which account is signed in on that device right now
 *
 * A token is only used when the registry names this user, so a phone that switched accounts never receives the
 * previous account's messages. Results are cached briefly: a busy chat would otherwise read the same documents for
 * every message, which matters on the free Firestore quota.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { MAX_MIRROR_TOKENS, PushTarget, isExpoPushToken, verifiedTokens } from '../utils/push';

const CACHE_MS = 2 * 60 * 1000;
const cache = new Map<string, { at: number; target: PushTarget | null }>();

async function loadTarget(uid: string): Promise<PushTarget | null> {
  const mirror = await getDoc(doc(db, 'userPush', uid));
  if (!mirror.exists()) return null; // never opened a build that can receive push

  const data = mirror.data() as { tokens?: unknown; notificationsEnabled?: unknown; mutedChats?: unknown };
  const claimed = (Array.isArray(data.tokens) ? data.tokens : []).filter(isExpoPushToken).slice(0, MAX_MIRROR_TOKENS);

  const owners = new Map<string, string | undefined>();
  await Promise.all(
    claimed.map(async (token) => {
      try {
        const entry = await getDoc(doc(db, 'pushTokens', token));
        owners.set(token, entry.exists() ? (entry.data().uid as string | undefined) : undefined);
      } catch {
        // Unreadable now: treat as unverified for this send rather than risk notifying the wrong person.
      }
    })
  );

  return {
    uid,
    tokens: verifiedTokens(uid, claimed, owners),
    notificationsEnabled: data.notificationsEnabled !== false,
    mutedChats: Array.isArray(data.mutedChats) ? data.mutedChats.filter((id): id is string => typeof id === 'string') : [],
  };
}

/** Null when the user cannot be notified (no devices registered, or the lookup failed). Never throws. */
export async function getPushTarget(uid: string): Promise<PushTarget | null> {
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.target;
  try {
    const target = await loadTarget(uid);
    cache.set(uid, { at: Date.now(), target });
    return target;
  } catch (error) {
    // Offline or a rules problem. Not cached, so the next message tries again.
    console.warn('Push lookup failed:', (error as { message?: string })?.message ?? error);
    return null;
  }
}

/** Forgets cached lookups (sign-out), so the next account on this device starts clean. */
export const clearPushTargetCache = () => cache.clear();
