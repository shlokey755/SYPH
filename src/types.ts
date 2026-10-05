import type { Timestamp } from 'firebase/firestore';

export type FirestoreTime = Timestamp | null | undefined;

// ---------- Users ----------
export interface UserProfile {
  uid: string;
  username: string;
  usernameLowercase?: string;
  displayName: string;
  /** Profile photo URL (Firebase Storage). */
  profileImageUrl?: string;
  /** Short status line shown on the profile (FR-02). */
  status?: string;
  /** Theme id saved to the profile (FR-15). */
  theme?: string;
  lastUsernameChange?: FirestoreTime | Date;
  createdAt: FirestoreTime | Date;
}

// ---------- Messages ----------
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'gif' | 'sticker';

export interface MessageMedia {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
  durationMs?: number;
  width?: number;
  height?: number;
}

/** Snapshot of the message being replied to, stored on the reply so it renders without a lookup. */
export interface ReplyPreview {
  messageId: string;
  senderId: string;
  senderUsername: string;
  type: MessageType;
  text: string;
}

export interface Message {
  id: string;
  type: MessageType;
  text: string;
  media?: MessageMedia;
  senderId: string;
  senderUsername: string;
  replyTo?: ReplyPreview;
  forwarded?: boolean;
  /** uids that deleted the message "for me". */
  deletedFor: string[];
  /** Sender removed the message for everyone. */
  deletedForEveryone: boolean;
  /** null while the server timestamp is still pending (offline / just sent). */
  createdAt: FirestoreTime;
  /** True while the write has not been acknowledged by the server yet. */
  pending: boolean;
}

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read';

// ---------- Conversations ----------
export interface ConversationParticipant {
  uid: string;
  username: string;
  profileImageUrl?: string;
}

export interface ReadReceipt {
  deliveredAt?: FirestoreTime;
  readAt?: FirestoreTime;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  groupName?: string;
  createdBy?: string;
  /** Flat list of member uids - used for queries and security rules. */
  participantIds: string[];
  /** 1-on-1 display data. */
  participant1?: ConversationParticipant;
  participant2?: ConversationParticipant;
  /** Group display data. */
  participants?: ConversationParticipant[];
  lastMessage?: string;
  lastMessageType?: MessageType;
  lastMessageTime?: FirestoreTime;
  lastMessageSenderId?: string | null;
  lastMessageSenderName?: string;
  /** uids that removed this chat from their list (reset when a new message arrives). */
  hiddenBy?: string[];
  /** Per-user delivery/read watermarks, keyed by uid. */
  readState?: Record<string, ReadReceipt>;
  /** Per-user unread message counters, keyed by uid. */
  unread?: Record<string, number>;
  createdAt: FirestoreTime;
}

// ---------- Per-user private settings (users/{uid}/private/settings) ----------
export interface UserSettings {
  mutedChats: string[];
  notificationsEnabled: boolean;
  expoPushTokens: string[];
}
