/**
 * useProfileImages.ts
 * Looks up current profile photos for a set of users.
 * Conversations store a copy of each member's photo from when the chat was created, which goes stale
 * as soon as someone changes their picture - so the chat list resolves the live value here.
 * Results are cached for the session.
 */

import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../firebaseConfig';

const cache = new Map<string, string>();

export function useProfileImages(uids: string[]) {
  const [, bump] = useState(0);
  const key = uids.join(',');

  useEffect(() => {
    const missing = uids.filter((uid) => !cache.has(uid));
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      missing.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          cache.set(uid, (snap.data()?.profileImageUrl as string | undefined) ?? '');
        } catch {
          // Leave uncached so it is retried next time.
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

  return useCallback((uid: string | undefined) => (uid ? cache.get(uid) || undefined : undefined), []);
}

/** Lets the profile screen publish a freshly uploaded photo to the cache. */
export const setCachedProfileImage = (uid: string, url: string) => cache.set(uid, url);
