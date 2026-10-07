/**
 * notify.js
 * Pure decision and formatting logic for the push relay. No I/O, so it is fully unit tested (test/notify.test.js).
 */

/** Android channel created by the app (src/services/pushService.ts). Keep in sync. */
export const MESSAGES_CHANNEL_ID = 'messages';

/** Firestore Timestamp | Date | null -> epoch milliseconds (0 when missing). */
export function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

/** Everyone in the conversation except the person who sent the latest message. */
export function recipientsOf(conversation) {
  const sender = conversation.lastMessageSenderId;
  return (conversation.participantIds ?? []).filter((uid) => uid && uid !== sender);
}

/** Members present in `next` but not in `previous`. */
export function addedMembers(previous, next) {
  const before = new Set(previous ?? []);
  return (next ?? []).filter((uid) => uid && !before.has(uid));
}

/**
 * The account-wide notification switch plus the per-chat mute.
 * Users who never touched their settings have no document, which means "on".
 */
export function allowsNotification(settings, conversationId) {
  if (settings?.notificationsEnabled === false) return false;
  return !(settings?.mutedChats ?? []).includes(conversationId);
}

/** Unique string tokens stored in a user's settings. */
export function storedTokens(settings) {
  const tokens = Array.isArray(settings?.expoPushTokens) ? settings.expoPushTokens : [];
  return [...new Set(tokens.filter((t) => typeof t === 'string' && t.length > 0))];
}

/**
 * Splits a user's stored tokens using the pushTokens registry (token -> uid of the account signed in on that device).
 *   send       registry names this user: safe to notify
 *   stale      registry names someone else: the device moved to another account, so drop it from this user
 *   unverified no registry entry: not sent to (we cannot prove the device still belongs to this user)
 */
export function splitTokensByOwner(uid, tokens, owners) {
  const send = [];
  const stale = [];
  for (const token of tokens) {
    const owner = owners.get(token);
    if (owner === uid) send.push(token);
    else if (owner !== undefined) stale.push(token);
  }
  return { send, stale };
}

/** Remembers the newest message time handled per conversation so each message is announced once. */
export function createDeduper() {
  const seen = new Map();
  return {
    isNew(id, millis) {
      if (!millis || millis <= (seen.get(id) ?? 0)) return false;
      seen.set(id, millis);
      return true;
    },
  };
}

function baseMessage(to, conversationId, type, title, body) {
  return {
    to,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: MESSAGES_CHANNEL_ID,
    threadId: conversationId, // groups notifications per chat on iOS
    data: { type, conversationId },
  };
}

/**
 * Notification for a new message. The conversation document already holds a short preview
 * ("Photo", "Voice message", or the first 50 characters of text), so no message document needs reading.
 */
export function buildMessagePush({ conversationId, conversation, tokens, hidePreview = false }) {
  const sender = conversation.lastMessageSenderName || 'New message';
  const isGroup = conversation.isGroup === true;
  const preview = conversation.lastMessage || 'New message';

  const title = isGroup ? conversation.groupName || 'Group' : sender;
  let body = preview;
  if (hidePreview) body = 'New message';
  else if (isGroup) body = `${sender}: ${preview}`;

  return tokens.map((to) => baseMessage(to, conversationId, 'message', title, body));
}

/** Notification for being added to a group. Only the creator can add members, so they are the actor. */
export function buildGroupAddedPush({ conversationId, conversation, tokens }) {
  const actor =
    (conversation.participants ?? []).find((p) => p.uid === conversation.createdBy)?.username || 'Someone';
  const title = conversation.groupName || 'Group';
  return tokens.map((to) =>
    baseMessage(to, conversationId, 'group', title, `${actor} added you to the group`)
  );
}
