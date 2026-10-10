/**
 * userService.ts
 * Profile and private-settings writes (FR-02, FR-12, FR-13, FR-15).
 *
 *   users/{uid}                     public profile (username, photo, status, theme)
 *   users/{uid}/private/settings    only the owner (and the server) can read: muted chats, push tokens
 */

import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

const settingsRef = (uid: string) => doc(db, 'users', uid, 'private', 'settings');

/**
 * pushTokens/{token} names the account currently signed in on a device. The push relay only sends to a token
 * whose entry names the recipient, so a phone never receives the previous user's messages if logout could not
 * clean up (offline, app killed).
 */
const tokenRef = (token: string) => doc(db, 'pushTokens', token);

export function setChatMuted(uid: string, conversationId: string, muted: boolean) {
  return setDoc(
    settingsRef(uid),
    { mutedChats: muted ? arrayUnion(conversationId) : arrayRemove(conversationId) },
    { merge: true }
  );
}

export function setNotificationsEnabled(uid: string, enabled: boolean) {
  return setDoc(settingsRef(uid), { notificationsEnabled: enabled }, { merge: true });
}

/** Saves this device's token to the user's settings and claims it in the registry (one atomic write). */
export function addPushToken(uid: string, token: string, platform: string) {
  const batch = writeBatch(db);
  batch.set(settingsRef(uid), { expoPushTokens: arrayUnion(token) }, { merge: true });
  batch.set(tokenRef(token), { uid, platform, updatedAt: serverTimestamp() });
  return batch.commit();
}

/** Removes this device's token. The registry delete is best effort: another account may have claimed it already. */
export async function removePushToken(uid: string, token: string) {
  await setDoc(settingsRef(uid), { expoPushTokens: arrayRemove(token) }, { merge: true });
  await deleteDoc(tokenRef(token)).catch(() => {});
}

export function saveTheme(uid: string, theme: string) {
  return setDoc(doc(db, 'users', uid), { theme }, { merge: true });
}

export function updateProfileFields(
  uid: string,
  fields: { status?: string; profileImageUrl?: string; displayName?: string }
) {
  return updateDoc(doc(db, 'users', uid), fields);
}
