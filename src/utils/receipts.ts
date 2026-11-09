/**
 * receipts.ts
 * What happened to a message you sent: still sending, failed, sent, delivered, seen by some of the group, or seen by
 * everyone. No React, no native code, so plain Node can test it.
 *
 * Receipts are stored as per-person watermarks on the conversation (`readState[uid].deliveredAt` / `.readAt`): a person has
 * received / seen a message once their watermark has passed the time it was sent. A watermark only says "up to here", so each
 * person's `readState[uid].log` also keeps their last few reads (when, and up to which message) to give the time each
 * message was actually seen; a message older than the log falls back to the watermark.
 *
 *   state        bubble                what shows with it
 *   pending      filled                a clock
 *   failed       filled                a red alert, tap to retry
 *   sent         filled                one tick
 *   delivered    filled                two ticks (everyone's phone has it)
 *   partial      filled                avatars of the people who have seen it (groups only, and only under your newest sent message)
 *   seen         hollow                nothing (the 1-to-1 recipient, or the whole group, has seen it)
 */

export type ReceiptState = 'pending' | 'failed' | 'sent' | 'delivered' | 'partial' | 'seen';

export const MAX_READ_LOG = 20;
/** The avatar queue shows this many people and then a "+N". */
export const MAX_QUEUE_AVATARS = 3;

/** One read: when it happened and the send time of the newest message the person had then (both ms since epoch). */
export interface ReadLogEntry {
  at: number;
  upTo: number;
}

type TimeLike = { toMillis?: () => number } | Date | number | null | undefined;

export interface ReceiptLike {
  deliveredAt?: TimeLike;
  readAt?: TimeLike;
  log?: unknown;
}

export interface Reader {
  uid: string;
  /** When they saw the message (ms since epoch). */
  at: number;
}

export interface MessageReceipts {
  state: ReceiptState;
  /** People who have seen it, earliest first. Never includes the sender. */
  readers: Reader[];
  /** How many people it was sent to (everyone but the sender). */
  recipients: number;
}

const millis = (t: TimeLike): number => {
  if (!t) return 0;
  if (typeof t === 'number') return Number.isFinite(t) ? t : 0;
  if (t instanceof Date) return t.getTime();
  return t.toMillis?.() ?? 0;
};

/** The valid entries of a stored log, oldest first. It comes from the database, so nothing is trusted. */
export function cleanReadLog(raw: unknown): ReadLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const log: ReadLogEntry[] = [];
  for (const entry of raw) {
    const at = (entry as { at?: unknown } | null)?.at;
    const upTo = (entry as { upTo?: unknown } | null)?.upTo;
    if (typeof at === 'number' && typeof upTo === 'number' && Number.isFinite(at) && Number.isFinite(upTo)) {
      log.push({ at, upTo });
    }
  }
  return log.sort((a, b) => a.upTo - b.upTo || a.at - b.at);
}

/** The log after reading up to `upTo` at `at`: the new entry added, only the last MAX_READ_LOG kept. */
export function appendReadLog(previous: unknown, upTo: number, at: number): ReadLogEntry[] {
  const log = cleanReadLog(previous);
  const last = log[log.length - 1];
  // Nothing newer than what is already recorded: leave the log as it is.
  if (upTo > 0 && (!last || upTo > last.upTo)) log.push({ at, upTo });
  return log.slice(-MAX_READ_LOG);
}

/**
 * When this person saw a message sent at `sentAt`: the first recorded read that covered it, else their watermark. Never
 * earlier than the message itself (the phones' clocks can differ a little).
 */
export function readTimeOf(receipt: ReceiptLike | undefined, sentAt: number): number {
  const entry = cleanReadLog(receipt?.log).find((e) => e.upTo >= sentAt);
  const at = entry ? entry.at : millis(receipt?.readAt);
  return Math.max(at, sentAt);
}

export function receiptsFor(
  message: { senderId: string; createdAt: TimeLike; pending?: boolean; failed?: boolean },
  participantIds: readonly string[] | undefined,
  readState: Record<string, ReceiptLike> | undefined
): MessageReceipts {
  const others = (participantIds ?? []).filter((uid) => uid !== message.senderId);
  const base = { readers: [] as Reader[], recipients: others.length };
  if (message.failed) return { ...base, state: 'failed' };
  if (message.pending) return { ...base, state: 'pending' };

  const sentAt = millis(message.createdAt);
  if (!sentAt || others.length === 0) return { ...base, state: 'sent' };

  const readers: Reader[] = [];
  let allDelivered = true;
  for (const uid of others) {
    const receipt = readState?.[uid];
    const readAt = millis(receipt?.readAt);
    const deliveredAt = Math.max(millis(receipt?.deliveredAt), readAt);
    if (readAt >= sentAt) readers.push({ uid, at: readTimeOf(receipt, sentAt) });
    if (deliveredAt < sentAt) allDelivered = false;
  }
  readers.sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1));

  if (readers.length === others.length) return { state: 'seen', readers, recipients: others.length };
  if (readers.length > 0) return { state: 'partial', readers, recipients: others.length };
  return { state: allDelivered ? 'delivered' : 'sent', readers, recipients: others.length };
}

/** The little status icon inside the bubble: a clock, an alert, one tick or two. Nothing once people have seen it. */
export type StatusIconKind = 'clock' | 'alert' | 'tick' | 'ticks';
export function statusIcon(state: ReceiptState): StatusIconKind | null {
  switch (state) {
    case 'pending':
      return 'clock';
    case 'failed':
      return 'alert';
    case 'sent':
      return 'tick';
    case 'delivered':
      return 'ticks';
    default:
      return null;
  }
}

/** The bubble is hollow exactly when the recipient, or everyone in the group, has seen the message. */
export const isHollow = (state: ReceiptState): boolean => state === 'seen';

/** The avatar queue is shown while only some of a group have seen the message. */
export const showsQueue = (state: ReceiptState): boolean => state === 'partial';

/**
 * The id of the newest message `uid` has sent, given the chat newest first. Only that message shows the avatar queue; older
 * ones show nothing once the newer one is out. A message still sending, one that failed, and one deleted for everyone
 * are not "sent", so they do not take the queue.
 */
export function latestSentId(
  messagesNewestFirst: readonly { id: string; senderId: string; pending?: boolean; failed?: boolean; deletedForEveryone?: boolean }[],
  uid: string | null | undefined
): string | null {
  if (!uid) return null;
  const latest = messagesNewestFirst.find((m) => m.senderId === uid && !m.pending && !m.failed && !m.deletedForEveryone);
  return latest ? latest.id : null;
}

/** The first people for the avatar queue and how many more there are. */
export function queueSplit(readers: readonly Reader[], max: number = MAX_QUEUE_AVATARS): { shown: Reader[]; extra: number } {
  return { shown: readers.slice(0, max), extra: Math.max(0, readers.length - max) };
}

/** The "Read by" list: newest first. */
export const readByList = (readers: readonly Reader[]): Reader[] =>
  [...readers].sort((a, b) => b.at - a.at || (a.uid < b.uid ? -1 : 1));
