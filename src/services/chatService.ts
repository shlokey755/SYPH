/**
 * chatService.ts
 * All Firestore writes for conversations and messages live here so screens stay thin (NFR-08).
 *
 * Data model
 *   conversations/{id}
 *     participantIds[], isGroup, groupName?, createdBy, participant1/2 | participants[],
 *     lastMessage*, hiddenBy[], readState{uid:{deliveredAt,readAt}}, unread{uid:n}
 *   conversations/{id}/messages/{id}
 *     type, text, media?, senderId, senderUsername, replyTo?, forwarded?, deletedFor[], deletedForEveryone
 */

import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  Conversation,
  ConversationParticipant,
  MessageMedia,
  MessageType,
  ReplyPreview,
} from '../types';

export interface Member {
  uid: string;
  username: string;
  profileImageUrl?: string;
}

export interface OutgoingMessage {
  type: MessageType;
  text?: string;
  media?: MessageMedia;
  replyTo?: ReplyPreview;
  forwarded?: boolean;
}

const toParticipant = (m: Member): ConversationParticipant => ({
  uid: m.uid,
  username: m.username,
  profileImageUrl: m.profileImageUrl ?? '',
});

/** Deterministic id so two people always share exactly one 1-on-1 conversation. */
export const directConversationId = (a: string, b: string) => [a, b].sort().join('_');

/** Short label for the chat list / reply bar / push body. */
export function messagePreview(type: MessageType, text?: string): string {
  switch (type) {
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Voice message';
    case 'document':
      return 'Document';
    case 'gif':
      return 'GIF';
    case 'sticker':
      return 'Sticker';
    default:
      return (text ?? '').trim().substring(0, 50);
  }
}

// ---------- Conversations ----------

export async function getOrCreateDirectConversation(me: Member, other: Member): Promise<string> {
  const id = directConversationId(me.uid, other.uid);
  const ref = doc(db, 'conversations', id);

  const existing = await getDoc(ref);
  if (existing.exists()) {
    const data = existing.data() as Conversation;
    if (data.hiddenBy?.includes(me.uid)) {
      await updateDoc(ref, { hiddenBy: arrayRemove(me.uid) });
    }
    return id;
  }

  try {
    await setDoc(ref, {
      isGroup: false,
      createdBy: me.uid,
      participantIds: [me.uid, other.uid],
      participant1: toParticipant(me),
      participant2: toParticipant(other),
      lastMessage: '',
      lastMessageType: 'text',
      lastMessageTime: null,
      lastMessageSenderId: null,
      hiddenBy: [],
      readState: {},
      unread: {},
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // The other person created it at the same moment - that is fine, reuse it.
    const again = await getDoc(ref);
    if (!again.exists()) throw error;
  }
  return id;
}

export async function createGroupConversation(
  me: Member,
  others: Member[],
  groupName?: string
): Promise<string> {
  const members = [me, ...others.filter((m) => m.uid !== me.uid)];
  const ref = doc(collection(db, 'conversations'));
  await setDoc(ref, {
    isGroup: true,
    groupName: groupName?.trim() || `Group (${members.length})`,
    createdBy: me.uid,
    participantIds: members.map((m) => m.uid),
    participants: members.map(toParticipant),
    lastMessage: '',
    lastMessageType: 'text',
    lastMessageTime: null,
    lastMessageSenderId: null,
    hiddenBy: [],
    readState: {},
    unread: {},
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function renameGroup(conversationId: string, groupName: string) {
  await updateDoc(doc(db, 'conversations', conversationId), { groupName: groupName.trim() });
}

export async function addGroupMembers(conversationId: string, newMembers: Member[]) {
  if (newMembers.length === 0) return;
  await updateDoc(doc(db, 'conversations', conversationId), {
    participantIds: arrayUnion(...newMembers.map((m) => m.uid)),
    participants: arrayUnion(...newMembers.map(toParticipant)),
  });
}

/** Removes a member (creator removing someone) or lets a member leave. */
export async function removeGroupMember(conversationId: string, uid: string) {
  const ref = doc(db, 'conversations', conversationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Conversation;
  await updateDoc(ref, {
    participantIds: (data.participantIds ?? []).filter((id) => id !== uid),
    participants: (data.participants ?? []).filter((p) => p.uid !== uid),
  });
}

/** Per-user "delete chat": hides it from this user's list only. A new message brings it back. */
export async function hideConversation(conversationId: string, uid: string) {
  await updateDoc(doc(db, 'conversations', conversationId), { hiddenBy: arrayUnion(uid) });
}

// ---------- Messages ----------

/**
 * Writes the message and updates the conversation summary atomically.
 * Resolves when the server acknowledges; while offline the write is queued and the UI shows it as pending.
 */
export function sendMessage(
  conversation: Pick<Conversation, 'id' | 'participantIds'>,
  sender: Member,
  message: OutgoingMessage
): Promise<void> {
  const convRef = doc(db, 'conversations', conversation.id);
  const msgRef = doc(collection(db, 'conversations', conversation.id, 'messages'));

  const text = (message.text ?? '').trim();
  const batch = writeBatch(db);

  const data: Record<string, unknown> = {
    type: message.type,
    text,
    senderId: sender.uid,
    senderUsername: sender.username,
    deletedFor: [],
    deletedForEveryone: false,
    createdAt: serverTimestamp(),
  };
  if (message.media) data.media = message.media;
  if (message.replyTo) data.replyTo = message.replyTo;
  if (message.forwarded) data.forwarded = true;
  batch.set(msgRef, data);

  const summary: Record<string, unknown> = {
    lastMessage: messagePreview(message.type, text),
    lastMessageType: message.type,
    lastMessageTime: serverTimestamp(),
    lastMessageSenderId: sender.uid,
    lastMessageSenderName: sender.username,
    hiddenBy: [],
  };
  for (const uid of conversation.participantIds) {
    if (uid !== sender.uid) summary[`unread.${uid}`] = increment(1);
  }
  batch.update(convRef, summary);

  return batch.commit();
}

/** Re-sends an existing message into another conversation (FR-08 forward). */
export function forwardMessage(
  target: Pick<Conversation, 'id' | 'participantIds'>,
  sender: Member,
  original: { type: MessageType; text: string; media?: MessageMedia }
) {
  return sendMessage(target, sender, {
    type: original.type,
    text: original.text,
    media: original.media,
    forwarded: true,
  });
}

/** "Delete for me": hides the message for this user only. */
export function deleteMessageForMe(conversationId: string, messageId: string, uid: string) {
  return updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
    deletedFor: arrayUnion(uid),
  });
}

/** "Delete for everyone": sender only (enforced by security rules). */
export function deleteMessageForEveryone(conversationId: string, messageId: string) {
  return updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
    deletedForEveryone: true,
    text: '',
    media: deleteField(),
  });
}

// ---------- Delivery / read receipts (FR-07) ----------

/** The recipient's device has received the latest messages (app open, chat not necessarily open). */
export function markDelivered(conversationId: string, uid: string) {
  return updateDoc(doc(db, 'conversations', conversationId), {
    [`readState.${uid}.deliveredAt`]: serverTimestamp(),
  });
}

/** The recipient is looking at the chat. Also clears their unread counter. */
export function markRead(conversationId: string, uid: string) {
  return updateDoc(doc(db, 'conversations', conversationId), {
    [`readState.${uid}.deliveredAt`]: serverTimestamp(),
    [`readState.${uid}.readAt`]: serverTimestamp(),
    [`unread.${uid}`]: 0,
  });
}
