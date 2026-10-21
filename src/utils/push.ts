/**
 * push.ts
 * Pure logic for client-triggered push notifications: who may be notified, what the notification says, and what is
 * mirrored to the shared `userPush/{uid}` document. No I/O and no framework imports, so it is unit tested in Node.
 *
 * Why the sender's phone does this at all: the app has no server (no paid hosting), so after a message or a call is
 * written, the sender's device asks Expo's free push service to wake the recipient's device. See API.md > Push.
 */

/** Android channels created by the app (src/services/pushService.ts). The optional relay in server/ uses the same ids. */
export const MESSAGES_CHANNEL_ID = 'messages';
export const CALLS_CHANNEL_ID = 'calls';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 notifications per request. */
export const EXPO_PUSH_BATCH_SIZE = 100;

/** A call push that cannot be delivered within this long is dropped: ringing after the caller gave up is just noise. */
export const CALL_PUSH_TTL_SECONDS = 30;

/** Most devices kept per account in the mirror. Newest win, which also ages out tokens of uninstalled apps. */
export const MAX_MIRROR_TOKENS = 5;
/** Most muted chats mirrored. The rules enforce the same limit. */
export const MAX_MIRROR_MUTED = 200;

/** Most recipients notified for one message, so a huge group cannot cost hundreds of reads per message. */
export const MAX_MESSAGE_RECIPIENTS = 30;

export type PushMode = 'client' | 'relay' | 'off';

/**
 * EXPO_PUBLIC_PUSH_MODE
 *   client  (default) the sender's device sends the push. Needs no server.
 *   relay   the Node relay in server/ sends pushes, so the app must not send them too (duplicates).
 *   off     no pushes from this build.
 */
export function parsePushMode(raw: string | undefined | null): PushMode {
  const value = (raw ?? '').trim().toLowerCase();
  return value === 'relay' || value === 'off' ? value : 'client';
}

/** What the sender may learn about a recipient: enough to decide whether and where to notify, nothing else. */
export interface PushTarget {
  uid: string;
  tokens: string[];
  notificationsEnabled: boolean;
  mutedChats: string[];
}

/** Shape of `userPush/{uid}`. */
export interface PushMirror {
  tokens: string[];
  notificationsEnabled: boolean;
  mutedChats: string[];
}

/** Subset of users/{uid}/private/settings the mirror is built from. */
export interface MirrorSource {
  notificationsEnabled?: boolean;
  mutedChats?: string[];
  expoPushTokens?: string[];
}

const EXPO_TOKEN = /^(?:Expo|Exponent)PushToken\[[^\]\s]+\]$/;

export const isExpoPushToken = (value: unknown): value is string =>
  typeof value === 'string' && EXPO_TOKEN.test(value);

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/**
 * Builds the mirror from the owner's private settings. Keeps the newest few tokens (arrayUnion appends, so the end of
 * the list is the newest) and drops anything that is not a push token.
 */
export function mirrorFromSettings(settings: MirrorSource): PushMirror {
  const tokens = unique((settings.expoPushTokens ?? []).filter(isExpoPushToken)).slice(-MAX_MIRROR_TOKENS);
  const mutedChats = unique((settings.mutedChats ?? []).filter((id) => typeof id === 'string' && id.length > 0)).slice(
    -MAX_MIRROR_MUTED
  );
  return { tokens, notificationsEnabled: settings.notificationsEnabled !== false, mutedChats };
}

/** Stable text form, used to skip a write when nothing changed. */
export const mirrorKey = (mirror: PushMirror): string =>
  JSON.stringify([mirror.notificationsEnabled, [...mirror.tokens].sort(), [...mirror.mutedChats].sort()]);

/** Messages respect the account switch and the per-chat mute. A person with no mirror yet counts as "on". */
export function allowsMessagePush(target: Pick<PushTarget, 'notificationsEnabled' | 'mutedChats'>, conversationId: string) {
  return target.notificationsEnabled && !target.mutedChats.includes(conversationId);
}

/** Calls ignore the chat mute: the caller is trying to reach you right now and muting is about message noise. */
export function allowsCallPush(target: Pick<PushTarget, 'notificationsEnabled'>) {
  return target.notificationsEnabled;
}

/**
 * Keeps only tokens the registry says belong to this user right now. A phone that moved to another account is
 * registered to the new owner, so the old owner's leftover token is dropped here and never gets their messages.
 * `owners` maps token -> uid from `pushTokens/{token}`; a token with no entry is unverified and is skipped.
 */
export function verifiedTokens(uid: string, tokens: string[], owners: Map<string, string | undefined>): string[] {
  return unique(tokens.filter((token) => isExpoPushToken(token) && owners.get(token) === uid));
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: string;
  ttl?: number;
  data: Record<string, string>;
}

export interface MessagePushInput {
  conversationId: string;
  isGroup: boolean;
  groupName?: string;
  senderName: string;
  /** Short preview of the message (see messagePreview in chatService). */
  preview: string;
  tokens: string[];
}

/** Direct chat: "Alice: hi". Group chat: title is the group, body is "Alice: hi". */
export function buildMessagePushes(input: MessagePushInput): ExpoPushMessage[] {
  const sender = input.senderName.trim() || 'New message';
  const preview = input.preview.trim() || 'New message';
  const title = input.isGroup ? input.groupName?.trim() || 'Group' : sender;
  const body = input.isGroup ? `${sender}: ${preview}` : preview;
  return input.tokens.map((to) => ({
    to,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: MESSAGES_CHANNEL_ID,
    data: { type: 'message', conversationId: input.conversationId },
  }));
}

export interface CallPushInput {
  callId: string;
  conversationId: string;
  callerName: string;
  type: 'audio' | 'video';
  tokens: string[];
}

export function buildCallPushes(input: CallPushInput): ExpoPushMessage[] {
  const caller = input.callerName.trim() || 'Someone';
  const kind = input.type === 'video' ? 'video' : 'voice';
  return input.tokens.map((to) => ({
    to,
    title: caller,
    body: `Incoming ${kind} call`,
    sound: 'default',
    priority: 'high',
    ttl: CALL_PUSH_TTL_SECONDS,
    channelId: CALLS_CHANNEL_ID,
    data: { type: 'call', conversationId: input.conversationId, callId: input.callId },
  }));
}

/** Splits a list into groups of at most `size` (Expo's per-request limit). */
export function chunk<T>(items: T[], size: number = EXPO_PUSH_BATCH_SIZE): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}
