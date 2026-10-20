/**
 * typing.ts
 * Pure logic for the "typing…" indicator. No I/O and no framework imports, so it is unit tested in Node.
 *
 * How it works without a server: while someone types, their phone writes `conversations/{id}/typing/{uid}`
 * ({typing: true, at: server time}) at most every TYPING_SEND_INTERVAL_MS, and deletes it when they stop, send, or
 * leave. A viewer treats someone as typing until TYPING_EXPIRE_MS passes without a *new* write, measured on the
 * viewer's own clock from when the change was seen, so a typer who loses signal or closes the app stops showing
 * and phone clocks that disagree do not matter.
 */

/** While typing, refresh the marker at most this often (each refresh is one Firestore write). */
export const TYPING_SEND_INTERVAL_MS = 3000;

/** Someone not refreshed for this long is treated as having stopped. Must exceed the send interval. */
export const TYPING_EXPIRE_MS = 6000;

/** A marker already there when the screen opens only counts if it was written this recently (server time). */
export const TYPING_FIRST_SEEN_MAX_AGE_MS = 10_000;

export interface TypingDoc {
  uid: string;
  typing: boolean;
  /** Server time of the write, in epoch milliseconds (0 when unknown). */
  atMillis: number;
}

export type TypingAction = 'start' | 'refresh' | 'stop' | 'none';

/**
 * What the typing person's phone should do now that the text box holds `text`.
 *   start    began typing: write the marker
 *   refresh  still typing and the marker is getting old: write it again
 *   stop     cleared the box: delete the marker
 */
export function nextTypingAction(
  text: string,
  state: { typing: boolean; lastSentAt: number },
  now: number
): TypingAction {
  if (text.trim().length === 0) return state.typing ? 'stop' : 'none';
  if (!state.typing) return 'start';
  return now - state.lastSentAt >= TYPING_SEND_INTERVAL_MS ? 'refresh' : 'none';
}

/** Tracks who is typing from successive snapshots of the typing collection. Pass in every doc except your own. */
export function createTypingTracker() {
  const seen = new Map<string, { marker: number; seenAt: number }>();

  return {
    update(docs: TypingDoc[], now: number): void {
      const present = new Set<string>();
      for (const doc of docs) {
        if (!doc.typing) continue;
        present.add(doc.uid);
        const previous = seen.get(doc.uid);
        if (!previous) {
          const fresh = doc.atMillis > 0 && now - doc.atMillis <= TYPING_FIRST_SEEN_MAX_AGE_MS;
          seen.set(doc.uid, { marker: doc.atMillis, seenAt: fresh ? now : Number.NEGATIVE_INFINITY });
        } else if (previous.marker !== doc.atMillis) {
          seen.set(doc.uid, { marker: doc.atMillis, seenAt: now });
        }
      }
      for (const uid of [...seen.keys()]) if (!present.has(uid)) seen.delete(uid);
    },

    /** Uids currently typing, in the order they started. */
    active(now: number): string[] {
      const uids: string[] = [];
      for (const [uid, entry] of seen) if (now - entry.seenAt < TYPING_EXPIRE_MS) uids.push(uid);
      return uids;
    },

    /** Milliseconds until the next person would expire (so the caller can re-check then), or null if nobody is typing. */
    nextExpiryIn(now: number): number | null {
      let soonest: number | null = null;
      for (const entry of seen.values()) {
        const left = entry.seenAt + TYPING_EXPIRE_MS - now;
        if (left > 0 && (soonest === null || left < soonest)) soonest = left;
      }
      return soonest;
    },

    reset(): void {
      seen.clear();
    },
  };
}

/** "typing…" in a 1-on-1 chat; names the people in a group. Empty when nobody is typing. */
export function typingLabel(names: string[], isGroup: boolean): string {
  if (names.length === 0) return '';
  if (!isGroup) return 'typing…';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
