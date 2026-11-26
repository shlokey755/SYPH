/**
 * useShareMyEmail.ts
 * Puts the signed-in person's own email where the other person in a 1-on-1 chat can read it on their profile screen
 * (services/contactEmailService.ts). Runs when the chat is opened and writes only when this phone has not given this chat that
 * email yet, so opening a chat does not cost a write every time. A username-only account has no real email and shares an empty
 * one, which the other side shows as "No email added".
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { shareEmail } from '../services/contactEmailService';
import { isLegacyEmail } from '../utils/auth';
import { needsSharing, parseShared, serializeShared, withShared } from '../utils/contactEmail';
import { useAuth } from './useAuth';

const STORAGE_KEY = 'syph.emailShared.v1';

/** The sign-in email when it is a real one, in lower case; '' for a username-only account. */
const realEmail = (email: string | null | undefined): string => {
  const value = (email ?? '').trim().toLowerCase();
  return value && !isLegacyEmail(value) ? value : '';
};

/** `enabled` is true for a 1-on-1 chat once it has loaded. */
export function useShareMyEmail(conversationId: string | undefined, enabled: boolean): void {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const email = realEmail(firebaseUser?.email);

  useEffect(() => {
    if (!enabled || !conversationId || !uid) return;
    let cancelled = false;
    (async () => {
      let saved = '';
      try {
        saved = (await AsyncStorage.getItem(STORAGE_KEY)) ?? '';
      } catch {
        // cannot tell what was shared: share again, which only costs one write
      }
      if (cancelled || !needsSharing(parseShared(saved), uid, conversationId, email)) return;
      await shareEmail(conversationId, uid, email);
      // Read again: another chat may have been recorded while this write was on its way.
      let latest = '';
      try {
        latest = (await AsyncStorage.getItem(STORAGE_KEY)) ?? '';
      } catch {
        return;
      }
      await AsyncStorage.setItem(STORAGE_KEY, serializeShared(withShared(parseShared(latest), uid, conversationId, email)));
    })().catch(() => {
      // Not critical: it is tried again the next time the chat is opened.
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, conversationId, uid, email]);
}
