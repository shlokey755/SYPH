/**
 * locationService.ts
 * Firestore side of live location sharing (see utils/location.ts for how it behaves).
 *
 *   conversations/{id}/locations/{messageId}
 *       { senderId, lat, lng, accuracy, active, updatedAt, expiresAt (epoch ms), expireAt (for an optional TTL policy) }
 *
 * One document per share, named after the location message it belongs to. Members read it; only the sharer writes it.
 */

import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface LivePosition {
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface LiveLocation extends LivePosition {
  senderId: string;
  active: boolean;
  /** Epoch ms when the share ends by itself. */
  expiresAt: number;
  /** Epoch ms of the last position written (0 while the server timestamp is still pending). */
  updatedAtMs: number;
}

const KEEP_AFTER_END_MS = 24 * 60 * 60 * 1000;

const locationRef = (conversationId: string, shareId: string) =>
  doc(db, 'conversations', conversationId, 'locations', shareId);

export function createLiveLocation(
  conversationId: string,
  shareId: string,
  senderId: string,
  position: LivePosition,
  expiresAt: number
) {
  return setDoc(locationRef(conversationId, shareId), {
    senderId,
    lat: position.lat,
    lng: position.lng,
    accuracy: position.accuracy,
    active: true,
    updatedAt: serverTimestamp(),
    expiresAt,
    expireAt: Timestamp.fromMillis(expiresAt + KEEP_AFTER_END_MS),
  });
}

export function updateLiveLocation(conversationId: string, shareId: string, position: LivePosition) {
  return updateDoc(locationRef(conversationId, shareId), {
    lat: position.lat,
    lng: position.lng,
    accuracy: position.accuracy,
    updatedAt: serverTimestamp(),
  });
}

export function endLiveLocation(conversationId: string, shareId: string) {
  return updateDoc(locationRef(conversationId, shareId), { active: false, updatedAt: serverTimestamp() });
}

/** Calls back with the share's current state on every change, or null if it does not exist. */
export function subscribeLiveLocation(
  conversationId: string,
  shareId: string,
  onChange: (location: LiveLocation | null) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    locationRef(conversationId, shareId),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      const data = snap.data({ serverTimestamps: 'estimate' });
      const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
      onChange({
        senderId: String(data.senderId ?? ''),
        lat: Number(data.lat),
        lng: Number(data.lng),
        accuracy: typeof data.accuracy === 'number' ? data.accuracy : null,
        active: data.active === true,
        expiresAt: Number(data.expiresAt) || 0,
        updatedAtMs: updatedAt?.toMillis?.() ?? 0,
      });
    },
    onError
  );
}
