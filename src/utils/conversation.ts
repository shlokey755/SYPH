import { Conversation, ConversationParticipant, FirestoreTime } from '../types';

export function getOtherParticipant(
  conv: Conversation,
  myUid: string | undefined
): ConversationParticipant | undefined {
  if (conv.isGroup) return undefined;
  return conv.participant1?.uid === myUid ? conv.participant2 : conv.participant1;
}

export function getConversationTitle(conv: Conversation, myUid: string | undefined): string {
  if (conv.isGroup) {
    return conv.groupName || `Group (${conv.participantIds?.length ?? conv.participants?.length ?? 0})`;
  }
  return getOtherParticipant(conv, myUid)?.username || 'Chat';
}

export function getConversationSubtitle(conv: Conversation): string {
  if (!conv.isGroup) return '';
  const count = conv.participantIds?.length ?? conv.participants?.length ?? 0;
  return `${count} members`;
}

/** Firestore Timestamp (or null while pending) -> millis. */
export const toMillis = (t: FirestoreTime | Date): number => {
  if (!t) return 0;
  if (t instanceof Date) return t.getTime();
  return t.toMillis?.() ?? 0;
};

export function formatClock(t: FirestoreTime): string {
  const ms = toMillis(t);
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Chat-list timestamp: time today, "Yesterday", weekday this week, otherwise date. */
export function formatListTime(t: FirestoreTime): string {
  const ms = toMillis(t);
  if (!ms) return '';
  const date = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (ms >= startOfToday) return formatClock(t);
  if (ms >= startOfToday - dayMs) return 'Yesterday';
  if (ms >= startOfToday - 6 * dayMs) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
}
