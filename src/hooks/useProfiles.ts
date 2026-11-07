/**
 * useProfiles.ts
 * Looks up the current name of a set of users.
 * Conversations store a copy of each member's username from when the chat was created, which goes stale as soon as
 * someone changes it (or sets a display name), so lists and headers resolve the live value here.
 * Results are cached and refreshed after CACHE_TTL_MS.
 */

import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../firebaseConfig';

interface CachedProfile {
  /** Display name when set, otherwise the username. */
  name: string;
  username: string;
  /** The display name, only when one is set. */
  displayName: string;
  at: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CachedProfile>();

const isFresh = (uid: string) => {
  const hit = cache.get(uid);
  return !!hit && Date.now() - hit.at < CACHE_TTL_MS;
};

export function useProfiles(uids: string[]) {
  const [, bump] = useState(0);
  const key = uids.join(',');

  useEffect(() => {
    const missing = uids.filter((uid) => !isFresh(uid));
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      missing.map(async (uid) => {
        try {
          const data = (await getDoc(doc(db, 'users', uid))).data();
          const username = (data?.username as string | undefined) ?? '';
          const displayName = ((data?.displayName as string | undefined) ?? '').trim();
          cache.set(uid, { name: displayName || username, username, displayName, at: Date.now() });
        } catch {
          // Leave it as it was; it is retried next time.
        }
      })
    ).then(() => {
      if (!cancelled) bump((n) => n + 1);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const nameOf = useCallback((uid: string | undefined) => (uid ? cache.get(uid)?.name || undefined : undefined), []);
  const usernameOf = useCallback((uid: string | undefined) => (uid ? cache.get(uid)?.username || undefined : undefined), []);
  const displayNameOf = useCallback((uid: string | undefined) => (uid ? cache.get(uid)?.displayName || undefined : undefined), []);
  return { nameOf, usernameOf, displayNameOf };
}

/** Lets the profile screen publish a freshly saved name to the cache. */
export function setCachedProfile(uid: string, patch: { name: string }) {
  const previous = cache.get(uid);
  cache.set(uid, { name: patch.name, username: previous?.username ?? '', displayName: previous?.displayName ?? '', at: Date.now() });
}
