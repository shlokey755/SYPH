/**
 * callService.ts
 * Firestore signalling for 1-to-1 calls (FR-06). Media flows peer to peer over WebRTC; Firestore only carries the
 * small handshake messages.
 *
 *   calls/{callId}                    status, offer, answer, who is calling whom
 *   calls/{callId}/candidates/{id}    trickled ICE candidates from either side (`from` says which)
 *
 * Both collections carry `expireAt` so a Firestore TTL policy can clear them (optional, see API.md).
 */

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Call, CallCandidate, CallType, SessionDescriptionData } from '../types';

export interface CallParty {
  uid: string;
  username: string;
}

const KEEP_FOR_MS = 24 * 60 * 60 * 1000;
const expireAt = () => Timestamp.fromMillis(Date.now() + KEEP_FOR_MS);

const callRef = (callId: string) => doc(db, 'calls', callId);

const toCall = (id: string, data: Record<string, unknown>): Call => ({ ...(data as Omit<Call, 'id'>), id });

/**
 * Creates the call in the "ringing" state, carrying the caller's offer.
 * Returns the id straight away plus `committed`, which resolves once the server has the document. While offline
 * `committed` stays pending (Firestore queues the write), so callers should not wait on it without a timeout.
 */
export function createCall(params: {
  conversationId: string;
  caller: CallParty;
  callee: CallParty;
  type: CallType;
  offer: SessionDescriptionData;
}): { id: string; committed: Promise<void> } {
  const ref = doc(collection(db, 'calls'));
  const committed = setDoc(ref, {
    conversationId: params.conversationId,
    callerId: params.caller.uid,
    callerName: params.caller.username,
    calleeId: params.callee.uid,
    calleeName: params.callee.username,
    participantIds: [params.caller.uid, params.callee.uid],
    type: params.type,
    status: 'ringing',
    offer: params.offer,
    createdAt: serverTimestamp(),
    expireAt: expireAt(),
  });
  return { id: ref.id, committed };
}

/** Live view of one call. Calls back with null if it does not exist (or you are not a participant). */
export function subscribeCall(
  callId: string,
  onChange: (call: Call | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    callRef(callId),
    { includeMetadataChanges: false },
    (snap) => onChange(snap.exists() ? toCall(snap.id, snap.data({ serverTimestamps: 'estimate' })) : null),
    (error) => onError?.(error)
  );
}

/** Calls that are ringing for this user right now. */
export function subscribeIncomingCalls(
  uid: string,
  onChange: (calls: Call[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(db, 'calls'), where('calleeId', '==', uid), where('status', '==', 'ringing'));
  return onSnapshot(
    q,
    (snap) =>
      onChange(snap.docs.map((d) => toCall(d.id, d.data({ serverTimestamps: 'estimate' })))),
    (error) => onError?.(error)
  );
}

export function addCandidate(callId: string, uid: string, candidate: CallCandidate) {
  return addDoc(collection(db, 'calls', callId, 'candidates'), {
    from: uid,
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    createdAt: serverTimestamp(),
    expireAt: expireAt(),
  });
}

/** Candidates sent by the other side. Each one is delivered exactly once, including ones sent before you joined. */
export function subscribeRemoteCandidates(
  callId: string,
  myUid: string,
  onCandidate: (candidate: CallCandidate) => void
): () => void {
  return onSnapshot(
    collection(db, 'calls', callId, 'candidates'),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data();
        if (data.from === myUid || typeof data.candidate !== 'string') return;
        onCandidate({
          candidate: data.candidate,
          sdpMid: data.sdpMid ?? null,
          sdpMLineIndex: data.sdpMLineIndex ?? null,
        });
      });
    },
    (error) => console.warn('Candidate listener error:', error.message)
  );
}

// ---------- Status moves (see canTransition in utils/call.ts and validCallMove in firestore.rules) ----------

export function acceptCall(callId: string, answer: SessionDescriptionData) {
  return updateDoc(callRef(callId), {
    status: 'accepted',
    answer,
    answeredAt: serverTimestamp(),
  });
}

export const declineCall = (callId: string) => updateDoc(callRef(callId), { status: 'declined' });

export const cancelCall = (callId: string) => updateDoc(callRef(callId), { status: 'cancelled' });

export const markCallMissed = (callId: string) => updateDoc(callRef(callId), { status: 'missed' });

export function endCall(callId: string, uid: string) {
  return updateDoc(callRef(callId), { status: 'ended', endedAt: serverTimestamp(), endedBy: uid });
}
