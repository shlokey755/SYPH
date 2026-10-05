/**
 * userService.ts
 * Profile and private-settings writes (FR-02, FR-12, FR-13, FR-15).
 *
 *   users/{uid}                     public profile (username, photo, status, theme)
 *   users/{uid}/private/settings    only the owner (and the server) can read: muted chats, push tokens
 */

import { arrayRemove, arrayUnion, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const settingsRef = (uid: string) => doc(db, 'users', uid, 'private', 'settings');

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

export function addPushToken(uid: string, token: string) {
  return setDoc(settingsRef(uid), { expoPushTokens: arrayUnion(token) }, { merge: true });
}

export function removePushToken(uid: string, token: string) {
  return setDoc(settingsRef(uid), { expoPushTokens: arrayRemove(token) }, { merge: true });
}

export function saveTheme(uid: string, theme: string) {
  return updateDoc(doc(db, 'users', uid), { theme });
}

export function updateProfileFields(
  uid: string,
  fields: { status?: string; profileImageUrl?: string; displayName?: string }
) {
  return updateDoc(doc(db, 'users', uid), fields);
}
