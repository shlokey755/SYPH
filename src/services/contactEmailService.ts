/**
 * contactEmailService.ts
 * The email a person shows to the other people in a chat: conversations/{chatId}/contacts/{uid} = { email, updatedAt }.
 * Only members of the chat can read it and each member writes only their own (firestore.rules). An empty `email` means
 * "no real email, only a username". See utils/contactEmail.ts for why it is kept here and not in the public profile.
 */

import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const contactRef = (conversationId: string, uid: string) => doc(db, 'conversations', conversationId, 'contacts', uid);

/** Writes the signed-in person's own email into this chat ('' when they have none). */
export const shareEmail = (conversationId: string, uid: string, email: string) =>
  setDoc(contactRef(conversationId, uid), { email, updatedAt: serverTimestamp() });

/** Live view of what somebody has shared in this chat. Returns the function that stops listening. */
export function subscribeSharedEmail(
  conversationId: string,
  uid: string,
  onChange: (exists: boolean, email: unknown) => void,
  onError: (error: unknown) => void
): () => void {
  return onSnapshot(
    contactRef(conversationId, uid),
    (snapshot) => onChange(snapshot.exists(), snapshot.data()?.email),
    onError
  );
}
