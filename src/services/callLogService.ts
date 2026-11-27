/**
 * callLogService.ts
 * Live view of the calls between two people, for the call log on a contact's profile screen.
 *
 * Two queries, one for each direction (I called them, they called me), because the rules only allow a list query that names
 * the signed-in person as caller or callee. Each query uses two equality filters, which Firestore answers with the indexes it
 * already has: no composite index to create, so the filters are not sorted or limited here. The log sorts them
 * (utils/callLog.ts); two people do not place enough calls for that to matter.
 *
 * A call document is deleted by the optional Firestore TTL policy on `expireAt` (API.md 1.7). With that policy set the log
 * only reaches back as far as the policy keeps calls, 24 hours.
 */

import { DocumentData, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { CallRecord } from '../utils/callLog';
import { toMillis } from '../utils/conversation';

const toRecord = (id: string, data: DocumentData): CallRecord => ({
  id,
  callerId: String(data.callerId ?? ''),
  calleeId: String(data.calleeId ?? ''),
  type: String(data.type ?? 'audio'),
  status: String(data.status ?? ''),
  createdAtMs: toMillis(data.createdAt),
  answeredAtMs: toMillis(data.answeredAt),
  endedAtMs: toMillis(data.endedAt),
});

/**
 * Calls `onChange` with every call between the two people each time either direction changes, once both have answered.
 * Returns the function that stops listening.
 */
export function subscribeCallLog(
  myUid: string,
  otherUid: string,
  onChange: (calls: CallRecord[]) => void,
  onError: (error: unknown) => void
): () => void {
  const lists: CallRecord[][] = [[], []];
  const ready = [false, false];
  const emit = () => {
    if (ready[0] && ready[1]) onChange([...lists[0], ...lists[1]]);
  };
  const listen = (index: number, callerId: string, calleeId: string) =>
    onSnapshot(
      query(collection(db, 'calls'), where('callerId', '==', callerId), where('calleeId', '==', calleeId)),
      (snapshot) => {
        lists[index] = snapshot.docs.map((document) => toRecord(document.id, document.data()));
        ready[index] = true;
        emit();
      },
      onError
    );
  const stops = [listen(0, myUid, otherUid), listen(1, otherUid, myUid)];
  return () => stops.forEach((stop) => stop());
}
