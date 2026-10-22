import type { Timestamp } from 'firebase/firestore';

export type FirestoreTime = Timestamp | null | undefined;

// ---------- Users ----------
export interface UserProfile {
  uid: string;
  username: string;
  usernameLowercase?: string;
  displayName: string;
  /** Theme id saved to the profile (FR-15). */
  theme?: string;
  lastUsernameChange?: FirestoreTime | Date;
  createdAt: FirestoreTime | Date;
}

// ---------- Messages ----------
/**
 * The app sends 'text', 'gif' and 'location' (a live location share). 'image', 'video', 'audio' and 'document' were
 * removed (no file storage) and 'sticker' was removed (it was only a big emoji); all of them only appear in messages
 * sent earlier. Old file messages render as a label and old stickers as plain text (see utils/messageType.ts).
 */
export type MessageType = 'text' | 'gif' | 'location' | 'sticker' | 'image' | 'video' | 'audio' | 'document';

/**
 * A live location share. The moving position lives in conversations/{id}/locations/{messageId}; the message only
 * records when the share ends (epoch ms), so a bubble can say "Live" or "Ended" without its own listener.
 */
export interface MessageLocation {
  expiresAt: number;
}

/** A GIF link (Giphy). Old file messages may carry extra fields; they are ignored. */
export interface MessageMedia {
  url: string;
  mimeType?: string;
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
  location?: MessageLocation;
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
}

export interface ReadReceipt {
  deliveredAt?: FirestoreTime;
  readAt?: FirestoreTime;
}

/** The latest change to a group, recorded so the push relay can announce it (FR-10). */
export interface GroupActivity {
  type: 'renamed' | 'removed' | 'left';
  /** Who did it. Set to the signed-in user and enforced by the rules. */
  by: string;
  byName: string;
  /** For 'removed': the people who were removed. */
  targets?: string[];
  at: FirestoreTime;
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
  /** Latest rename / removal / leave in a group. */
  groupActivity?: GroupActivity;
  createdAt: FirestoreTime;
}

// ---------- Per-user private settings (users/{uid}/private/settings) ----------
export interface UserSettings {
  mutedChats: string[];
  notificationsEnabled: boolean;
  expoPushTokens: string[];
}

// ---------- Calls (calls/{callId}) ----------
export type CallType = 'audio' | 'video';

export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'cancelled' | 'missed' | 'ended';

/** A WebRTC session description as stored in Firestore. */
export interface SessionDescriptionData {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface Call {
  id: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  calleeId: string;
  calleeName: string;
  /** [callerId, calleeId]; used by queries and security rules. */
  participantIds: string[];
  type: CallType;
  status: CallStatus;
  offer?: SessionDescriptionData;
  answer?: SessionDescriptionData;
  createdAt: FirestoreTime;
  answeredAt?: FirestoreTime;
  endedAt?: FirestoreTime;
  endedBy?: string;
}

/** One trickled ICE candidate (calls/{callId}/candidates/{id}). */
export interface CallCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}
