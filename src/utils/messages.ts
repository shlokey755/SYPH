/**
 * messages.ts
 * Keeps message objects stable between Firestore snapshots, so rows that did not change are not re-rendered.
 *
 * Every snapshot rebuilds all message objects from scratch. Because MessageBubble is memoised on its props, brand-new
 * objects make every visible bubble re-render whenever one message arrives. Reusing the previous object for any
 * message whose content is unchanged limits that to the messages that actually changed.
 */

import type { Message } from '../types';

const millis = (value: unknown): number => {
  const v = value as { toMillis?: () => number } | Date | null | undefined;
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  return typeof v.toMillis === 'function' ? v.toMillis() : 0;
};

const json = (value: unknown) => JSON.stringify(value ?? null);

/** True when everything a bubble can show is the same. */
export function sameMessage(a: Message, b: Message): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.text === b.text &&
    a.senderId === b.senderId &&
    a.senderUsername === b.senderUsername &&
    a.forwarded === b.forwarded &&
    a.deletedForEveryone === b.deletedForEveryone &&
    a.pending === b.pending &&
    millis(a.createdAt) === millis(b.createdAt) &&
    a.deletedFor.length === b.deletedFor.length &&
    a.deletedFor.every((uid, i) => uid === b.deletedFor[i]) &&
    json(a.media) === json(b.media) &&
    json(a.replyTo) === json(b.replyTo)
  );
}

/**
 * `next` with the previous object substituted wherever a message is unchanged. Returns `previous` itself when
 * nothing changed at all, so React can skip the update entirely.
 */
export function reuseUnchanged(previous: Message[], next: Message[]): Message[] {
  if (previous.length === 0) return next;
  const byId = new Map(previous.map((m) => [m.id, m]));
  let identical = previous.length === next.length;

  const merged = next.map((message, index) => {
    const old = byId.get(message.id);
    const chosen = old && sameMessage(old, message) ? old : message;
    if (identical && previous[index] !== chosen) identical = false;
    return chosen;
  });

  return identical ? previous : merged;
}
