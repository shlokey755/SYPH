/**
 * groupCall.ts
 * Pure rules for group calls. No I/O and no framework imports, so it is unit tested in Node.
 *
 * How a group call works without a server (see API.md 1.10):
 *  - A call is "in progress" while the group's conversation document carries an `activeCall` pointer that its
 *    participants keep refreshing (`beat`). Everyone in the group sees it and can join.
 *  - Every participant writes a small presence document, `conversations/{id}/groupCalls/{callId}/peers/{uid}`, and
 *    refreshes it every few seconds. The people who are present are the people in the call.
 *  - Audio and video go phone to phone (a "mesh": each person connects to each other person). Firestore only carries
 *    the handshake messages, in `.../signals/{id}`. That is why the size is limited.
 */

import type { ActiveGroupCall, CallType } from '../types';

/** Most people in one call. A mesh sends your video once per person, so video is capped lower than audio. */
export const MAX_PARTICIPANTS: Record<CallType, number> = { audio: 6, video: 4 };

/** Participants refresh their presence document this often. */
export const PEER_BEAT_MS = 15_000;
/** Someone whose presence document has not changed for this long (on the viewer's own clock) has dropped out. */
export const PEER_EXPIRE_MS = 45_000;
/** A presence document already there when you join only counts if it was written this recently (server time). */
export const PEER_FIRST_SEEN_MAX_AGE_MS = 60_000;

/** Participants refresh the conversation's `activeCall.beat` this often. */
export const POINTER_BEAT_MS = 45_000;
/** The call counts as in progress while its beat is at most this old. */
export const POINTER_FRESH_MS = 100_000;
/** A call rings the rest of the group only during its first seconds; after that it is just a "Join" bar. */
export const RING_WINDOW_MS = 45_000;

export const isCallLive = (call: ActiveGroupCall | null | undefined, now: number): boolean =>
  !!call && typeof call.beat === 'number' && now - call.beat <= POINTER_FRESH_MS;

/** Whether to ring this person: a live call someone else started a moment ago, which they have not dealt with. */
export function shouldRing(
  call: ActiveGroupCall | null | undefined,
  myUid: string,
  now: number,
  alreadyHandled: boolean
): boolean {
  if (!call || alreadyHandled || !isCallLive(call, now)) return false;
  return call.startedBy !== myUid && now - call.startedAt <= RING_WINDOW_MS;
}

/** `othersPresent` excludes you. */
export const canJoin = (type: CallType, othersPresent: number): boolean =>
  othersPresent + 1 <= MAX_PARTICIPANTS[type];

export interface PeerDoc {
  uid: string;
  /** Random id of this person's current join, so a rejoin is told apart from the previous session. */
  sid: string;
  username: string;
  /** Server time of the join, epoch ms (0 while unresolved). */
  joinedAtMs: number;
  /** Server time of the latest refresh, epoch ms (0 while unresolved). */
  lastSeenMs: number;
  cameraOff: boolean;
  muted: boolean;
}

/**
 * Tracks who is really in the call from successive snapshots of the presence collection. Pass in every document,
 * including your own. A person drops out when their document is deleted (they left) or stops changing for
 * PEER_EXPIRE_MS (their phone died). Measured on the viewer's clock from when a change was seen, so phones whose
 * clocks disagree do not matter.
 */
export function createPresenceTracker() {
  const seen = new Map<string, { doc: PeerDoc; marker: number; seenAt: number }>();

  return {
    update(docs: PeerDoc[], now: number): void {
      const present = new Set<string>();
      for (const doc of docs) {
        present.add(doc.uid);
        const previous = seen.get(doc.uid);
        if (!previous || previous.doc.sid !== doc.sid) {
          const fresh = doc.lastSeenMs === 0 || now - doc.lastSeenMs <= PEER_FIRST_SEEN_MAX_AGE_MS;
          seen.set(doc.uid, { doc, marker: doc.lastSeenMs, seenAt: fresh ? now : Number.NEGATIVE_INFINITY });
        } else {
          const changed = previous.marker !== doc.lastSeenMs;
          seen.set(doc.uid, { doc, marker: doc.lastSeenMs, seenAt: changed ? now : previous.seenAt });
        }
      }
      for (const uid of [...seen.keys()]) if (!present.has(uid)) seen.delete(uid);
    },

    /** Everyone currently in the call (including you if your document is in the list), oldest join first. */
    present(now: number): PeerDoc[] {
      return [...seen.values()]
        .filter((entry) => now - entry.seenAt < PEER_EXPIRE_MS)
        .map((entry) => entry.doc)
        .sort((a, b) => a.joinedAtMs - b.joinedAtMs || a.uid.localeCompare(b.uid));
    },

    /** Milliseconds until the next person would expire, so the caller can re-check then; null if nobody would. */
    nextExpiryIn(now: number): number | null {
      let soonest: number | null = null;
      for (const entry of seen.values()) {
        const left = entry.seenAt + PEER_EXPIRE_MS - now;
        if (left > 0 && (soonest === null || left < soonest)) soonest = left;
      }
      return soonest;
    },

    reset(): void {
      seen.clear();
    },
  };
}

/**
 * Columns and rows of the video grid for `count` tiles (yourself included). Two people stack; three or four make a
 * 2-wide grid; five or six make a 2-wide, three-row grid. Everyone gets an equal tile.
 */
export function gridLayout(count: number): { columns: number; rows: number } {
  const n = Math.max(1, Math.floor(count));
  if (n === 1) return { columns: 1, rows: 1 };
  if (n === 2) return { columns: 1, rows: 2 };
  const columns = 2;
  return { columns, rows: Math.ceil(n / columns) };
}

/** "Alice is calling the group" for the ring screen and the notification-style bars. */
export function callHeadline(call: Pick<ActiveGroupCall, 'startedByName' | 'type'>): string {
  const who = call.startedByName.trim() || 'Someone';
  return `${who} started a ${call.type === 'video' ? 'video' : 'voice'} call`;
}

/** How many people the "Join" bar says are in the call. */
export function participantCountLabel(count: number): string {
  if (count <= 0) return 'Waiting for others';
  return count === 1 ? '1 person in the call' : `${count} people in the call`;
}
