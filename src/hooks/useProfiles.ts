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
          cache.set(uid, {
            name: ((data?.displayName as string | undefined)?.trim() || (data?.username as string | undefined)) ?? '',
            at: Date.now(),
          });
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
  return { nameOf };
}

/** Lets the profile screen publish a freshly saved name to the cache. */
export function setCachedProfile(uid: string, patch: { name: string }) {
  cache.set(uid, { name: patch.name, at: Date.now() });
}
