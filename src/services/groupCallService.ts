/**
 * groupCallService.ts
 * Firestore side of group calls (see utils/groupCall.ts for how a call works).
 *
 *   conversations/{id}.activeCall                              pointer: a call is in progress (every member sees it)
 *   conversations/{id}/groupCalls/{callId}/peers/{uid}         presence: who is in the call, refreshed while there
 *   conversations/{id}/groupCalls/{callId}/signals/{id}        handshake messages from one person to one other
 *
 * Audio and video never pass through here; they go phone to phone. Everything here is small.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ActiveGroupCall } from '../types';
import { isCallLive, PeerDoc } from '../utils/groupCall';
import { IceCandidateData, Signal } from '../utils/groupMesh';

const KEEP_FOR_MS = 24 * 60 * 60 * 1000;
const expireAt = () => Timestamp.fromMillis(Date.now() + KEEP_FOR_MS);

const conversationRef = (conversationId: string) => doc(db, 'conversations', conversationId);
const peersRef = (conversationId: string, callId: string) =>
  collection(db, 'conversations', conversationId, 'groupCalls', callId, 'peers');
const signalsRef = (conversationId: string, callId: string) =>
  collection(db, 'conversations', conversationId, 'groupCalls', callId, 'signals');

/** A fresh call id (random, generated on this phone). */
export const newGroupCallId = (conversationId: string): string =>
  doc(collection(db, 'conversations', conversationId, 'groupCalls')).id;

// ---------- The "call in progress" pointer on the conversation ----------

export type StartResult = { kind: 'started'; call: ActiveGroupCall } | { kind: 'existing'; call: ActiveGroupCall };

/**
 * Marks the group as being in a call. If someone else started one a moment ago, their call is returned instead, so two
 * people pressing "call" together end up in the same call rather than two. Runs as a transaction for that reason.
 */
export function startOrJoinPointer(conversationId: string, call: ActiveGroupCall): Promise<StartResult> {
  return runTransaction(db, async (tx) => {
    const ref = conversationRef(conversationId);
    const snap = await tx.get(ref);
    const current = snap.data()?.activeCall as ActiveGroupCall | undefined;
    if (current && isCallLive(current, Date.now())) return { kind: 'existing', call: current } as StartResult;
    tx.update(ref, { activeCall: call });
    return { kind: 'started', call } as StartResult;
  });
}

/** Keeps the call showing as "in progress". Returns false when the pointer is gone or belongs to another call. */
export function beatPointer(conversationId: string, callId: string): Promise<boolean> {
  return runTransaction(db, async (tx) => {
    const ref = conversationRef(conversationId);
    const snap = await tx.get(ref);
    const current = snap.data()?.activeCall as ActiveGroupCall | undefined;
    if (!current || current.id !== callId) return false;
    tx.update(ref, { activeCall: { ...current, beat: Date.now() } });
    return true;
  });
}

/** Clears the pointer, but only if it still belongs to this call. */
export function endPointer(conversationId: string, callId: string): Promise<void> {
  return runTransaction(db, async (tx) => {
    const ref = conversationRef(conversationId);
    const snap = await tx.get(ref);
    const current = snap.data()?.activeCall as ActiveGroupCall | undefined;
    if (current && current.id === callId) tx.update(ref, { activeCall: deleteField() });
  });
}

// ---------- Presence ----------

export interface MyPeer {
  uid: string;
  /** Random id of this join, so a rejoin is told apart from the previous session. */
  sid: string;
  username: string;
  cameraOff: boolean;
  muted: boolean;
}

/** Says "I am in the call". `joinedAt` and `lastSeen` are server times. */
export function writePeer(conversationId: string, callId: string, me: MyPeer) {
  return setDoc(doc(peersRef(conversationId, callId), me.uid), {
    uid: me.uid,
    sid: me.sid,
    username: me.username,
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    cameraOff: me.cameraOff,
    muted: me.muted,
    expireAt: expireAt(),
  });
}

/** Proves I am still here. */
export const beatPeer = (conversationId: string, callId: string, uid: string) =>
  updateDoc(doc(peersRef(conversationId, callId), uid), { lastSeen: serverTimestamp() });

/** Tells the others whether my camera is off and my microphone is muted. */
export const updatePeerMedia = (
  conversationId: string,
  callId: string,
  uid: string,
  media: { cameraOff: boolean; muted: boolean }
) => updateDoc(doc(peersRef(conversationId, callId), uid), { ...media, lastSeen: serverTimestamp() });

/** "I left." */
export const removePeer = (conversationId: string, callId: string, uid: string) =>
  deleteDoc(doc(peersRef(conversationId, callId), uid));

const millis = (value: unknown): number => {
  const t = value as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === 'function' ? t.toMillis() : 0; // 0 while the server time is still pending
};

/** Everyone's presence document, now and on every change. */
export function subscribePeers(
  conversationId: string,
  callId: string,
  onChange: (peers: PeerDoc[]) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    peersRef(conversationId, callId),
    (snapshot) =>
      onChange(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            sid: typeof data.sid === 'string' ? data.sid : '',
            username: typeof data.username === 'string' ? data.username : 'Someone',
            joinedAtMs: millis(data.joinedAt),
            lastSeenMs: millis(data.lastSeen),
            cameraOff: data.cameraOff === true,
            muted: data.muted === true,
          };
        })
      ),
    onError
  );
}

// ---------- Signals ----------

/** Sends one handshake message. Best effort: the caller logs failures. */
export function sendSignal(conversationId: string, callId: string, signal: Signal) {
  const base = {
    kind: signal.kind,
    from: signal.from,
    fromSid: signal.fromSid,
    to: signal.to,
    toSid: signal.toSid,
    createdAt: serverTimestamp(),
    expireAt: expireAt(),
  };
  return addDoc(
    signalsRef(conversationId, callId),
    signal.kind === 'candidate' ? { ...base, candidate: signal.candidate } : { ...base, sdp: signal.sdp }
  );
}

/** Handshake messages addressed to me. Each is delivered once, including ones sent before I started listening. */
export function subscribeSignals(
  conversationId: string,
  callId: string,
  myUid: string,
  onSignal: (signal: Signal) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    query(signalsRef(conversationId, callId), where('to', '==', myUid)),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data();
        const base = {
          id: change.doc.id,
          from: String(data.from ?? ''),
          fromSid: String(data.fromSid ?? ''),
          to: String(data.to ?? ''),
          toSid: String(data.toSid ?? ''),
        };
        if (data.kind === 'candidate' && typeof data.candidate?.candidate === 'string') {
          const c = data.candidate as IceCandidateData;
          onSignal({ ...base, kind: 'candidate', candidate: { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null } });
        } else if ((data.kind === 'offer' || data.kind === 'answer') && typeof data.sdp === 'string') {
          onSignal({ ...base, kind: data.kind, sdp: data.sdp });
        }
      });
    },
    onError
  );
}
