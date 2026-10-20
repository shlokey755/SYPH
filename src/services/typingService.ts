/**
 * typingService.ts
 * Firestore side of the "typing…" indicator (see utils/typing.ts for how it behaves).
 *
 *   conversations/{id}/typing/{uid}   { typing: true, at: server time }, one small document per member
 *
 * A separate subcollection keeps typing writes away from the conversation document, so they never refresh the chat
 * list or count against its listeners. The chat screen is the only reader.
 */

import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { TypingDoc } from '../utils/typing';

const typingRef = (conversationId: string, uid: string) => doc(db, 'conversations', conversationId, 'typing', uid);

/** "I am typing" (also used to refresh the marker while still typing). */
export const writeTyping = (conversationId: string, uid: string) =>
  setDoc(typingRef(conversationId, uid), { typing: true, at: serverTimestamp() });

/** "I stopped". Deleting a marker that is already gone is harmless. */
export const clearTyping = (conversationId: string, uid: string) => deleteDoc(typingRef(conversationId, uid));

/** Calls back with everyone else's markers every time they change. */
export function subscribeTyping(
  conversationId: string,
  myUid: string,
  onChange: (docs: TypingDoc[]) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    collection(db, 'conversations', conversationId, 'typing'),
    (snapshot) => {
      onChange(
        snapshot.docs
          .filter((d) => d.id !== myUid)
          .map((d) => {
            const data = d.data();
            const at = data.at as { toMillis?: () => number } | null | undefined;
            return { uid: d.id, typing: data.typing === true, atMillis: at?.toMillis?.() ?? 0 };
          })
      );
    },
    onError
  );
}
