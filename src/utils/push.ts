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

import type { MessageToneId, RingtoneId } from './alertPrefs';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 notifications per request. */
export const EXPO_PUSH_BATCH_SIZE = 100;

/** A call push that cannot be delivered within this long is dropped: ringing after the caller gave up is just noise. */
export const CALL_PUSH_TTL_SECONDS = 30;

/** A group call rings for 45 seconds (RING_WINDOW_MS in utils/groupCall.ts), so its push is worth that long. */
export const GROUP_CALL_PUSH_TTL_SECONDS = 45;

/** A missed-call notice stays useful for a day: the person may be asleep or out of coverage when it is sent. */
export const MISSED_CALL_PUSH_TTL_SECONDS = 24 * 60 * 60;

/** Most devices kept per account in the mirror. Newest win, which also ages out tokens of uninstalled apps. */
export const MAX_MIRROR_TOKENS = 5;
/** Most muted chats mirrored. The rules enforce the same limit. */
export const MAX_MIRROR_MUTED = 200;

/** Most recipients notified for one message, so a huge group cannot cost hundreds of reads per message. */
export const MAX_MESSAGE_RECIPIENTS = 30;

// ---------- Alerts while SYPH is closed ----------
//
// With SYPH closed, Android (not SYPH) plays the sound and buzz of a notification, from its notification channel. So the
// person's choices (message tone, ringtone, vibration) are saved on their account, and the sender's phone puts the
// notification on the channel that matches them. A build that can do this (new APK) creates one channel per tone and
// vibration choice; an older build has only "messages" and "calls", so it is sent to those as before.

/** Message tones, as in utils/alertPrefs.ts (a test keeps the two lists equal). */
export const MESSAGE_TONE_IDS: readonly MessageToneId[] = ['syph', 'pop', 'drop', 'off'];
export const RINGTONE_IDS: readonly RingtoneId[] = ['syph', 'phone'];

/** The choices that decide how a closed-app alert sounds. Stored in the account's settings and in the mirror. */
export interface AccountAlerts {
  messageTone: MessageToneId;
  ringtone: RingtoneId;
  vibrate: boolean;
}

export const DEFAULT_ACCOUNT_ALERTS: AccountAlerts = { messageTone: 'syph', ringtone: 'syph', vibrate: true };

/** Reads saved choices, ignoring anything missing or not understood. */
export function normalizeAccountAlerts(raw: unknown): AccountAlerts {
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    messageTone: MESSAGE_TONE_IDS.includes(data.messageTone as MessageToneId)
      ? (data.messageTone as MessageToneId)
      : DEFAULT_ACCOUNT_ALERTS.messageTone,
    ringtone: RINGTONE_IDS.includes(data.ringtone as RingtoneId)
      ? (data.ringtone as RingtoneId)
      : DEFAULT_ACCOUNT_ALERTS.ringtone,
    vibrate: typeof data.vibrate === 'boolean' ? data.vibrate : DEFAULT_ACCOUNT_ALERTS.vibrate,
  };
}

/** The sound files of the message tones. They are copied into the Android app by the build (`sounds` in app.json). */
export const MESSAGE_TONE_FILES: Record<Exclude<MessageToneId, 'off'>, string> = {
  syph: 'syph_message.wav',
  pop: 'msg_pop.wav',
  drop: 'msg_drop.wav',
};

/** The Android channel for a message tone and vibration choice, for example "messages_pop_buzz". */
export const messageChannelId = (tone: MessageToneId, vibrate: boolean): string =>
  `messages_${tone}_${vibrate ? 'buzz' : 'quiet'}`;

export interface MessageChannelSpec {
  id: string;
  name: string;
  /** File name in the app's sounds, or null for a silent channel. */
  sound: string | null;
  vibrate: boolean;
}

const TONE_NAMES: Record<MessageToneId, string> = { syph: 'SYPH tone', pop: 'Pop tone', drop: 'Drop tone', off: 'Silent' };

/** Every message channel a build that can show closed-app alerts creates (4 tones, with and without vibration). */
export const MESSAGE_CHANNEL_SPECS: readonly MessageChannelSpec[] = MESSAGE_TONE_IDS.flatMap((tone) =>
  [true, false].map((vibrate) => ({
    id: messageChannelId(tone, vibrate),
    name: `Messages: ${TONE_NAMES[tone]}${vibrate ? ', vibrate' : ''}`,
    sound: tone === 'off' ? null : MESSAGE_TONE_FILES[tone],
    vibrate,
  }))
);

/** Where one device's notifications go, from what its owner chose and what its build can do. */
export interface TokenRoute {
  /** The channel for a message or a missed-call notice. */
  messageChannel: string;
  /** True when the build can ring natively while SYPH is closed (new APK). */
  closedAlerts: boolean;
  ringtone: RingtoneId;
  vibrate: boolean;
}

/** An older build, or an account that has not saved choices: the original channels. */
export const DEFAULT_ROUTE: TokenRoute = {
  messageChannel: MESSAGES_CHANNEL_ID,
  closedAlerts: false,
  ringtone: DEFAULT_ACCOUNT_ALERTS.ringtone,
  vibrate: DEFAULT_ACCOUNT_ALERTS.vibrate,
};

export type RouteOf = (token: string) => TokenRoute;
const defaultRouteOf: RouteOf = () => DEFAULT_ROUTE;

/** The route of one of the target's devices. Only a device that registered as able to show closed-app alerts gets the new channels. */
export function routeFor(target: Pick<PushTarget, 'alerts' | 'alertTokens'>, token: string): TokenRoute {
  if (!target.alertTokens.includes(token)) return DEFAULT_ROUTE;
  return {
    messageChannel: messageChannelId(target.alerts.messageTone, target.alerts.vibrate),
    closedAlerts: true,
    ringtone: target.alerts.ringtone,
    vibrate: target.alerts.vibrate,
  };
}

/** One route lookup for the devices of several recipients (a group message goes to many people at once). */
export function routeOfTokens(targets: readonly (Pick<PushTarget, 'alerts' | 'alertTokens' | 'tokens'> | null | undefined)[]): RouteOf {
  const routes = new Map<string, TokenRoute>();
  for (const target of targets) {
    if (!target) continue;
    for (const token of target.tokens) routes.set(token, routeFor(target, token));
  }
  return (token) => routes.get(token) ?? DEFAULT_ROUTE;
}

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
  /** Their tone, ringtone and vibration choices. */
  alerts: AccountAlerts;
  /** The devices (a subset of `tokens`) whose build can show those choices while SYPH is closed. */
  alertTokens: string[];
}

/** Shape of `userPush/{uid}`. */
export interface PushMirror {
  tokens: string[];
  notificationsEnabled: boolean;
  mutedChats: string[];
  alerts: AccountAlerts;
  alertTokens: string[];
}

/** Subset of users/{uid}/private/settings the mirror is built from. */
export interface MirrorSource {
  notificationsEnabled?: boolean;
  mutedChats?: string[];
  expoPushTokens?: string[];
  alerts?: unknown;
  closedAlertTokens?: string[];
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
  // Only devices that are also in the list above count, so a removed device cannot keep its alert routing.
  const alertTokens = unique((settings.closedAlertTokens ?? []).filter((token) => tokens.includes(token)));
  return {
    tokens,
    notificationsEnabled: settings.notificationsEnabled !== false,
    mutedChats,
    alerts: normalizeAccountAlerts(settings.alerts),
    alertTokens,
  };
}

/** Stable text form, used to skip a write when nothing changed. */
export const mirrorKey = (mirror: PushMirror): string =>
  JSON.stringify([
    mirror.notificationsEnabled,
    [...mirror.tokens].sort(),
    [...mirror.mutedChats].sort(),
    [mirror.alerts.messageTone, mirror.alerts.ringtone, mirror.alerts.vibrate],
    [...mirror.alertTokens].sort(),
  ]);

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
  /** Missing on a silent message for the app's own handler (see buildCallEndedPushes). */
  title?: string;
  body?: string;
  sound?: 'default';
  priority: 'high';
  channelId?: string;
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
  /** Where each device's notification goes. Without it every device gets the original "messages" channel. */
  routeOf?: RouteOf;
}

/** Direct chat: "Alice: hi". Group chat: title is the group, body is "Alice: hi". */
export function buildMessagePushes(input: MessagePushInput): ExpoPushMessage[] {
  const routeOf = input.routeOf ?? defaultRouteOf;
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
    channelId: routeOf(to).messageChannel,
    data: { type: 'message', conversationId: input.conversationId },
  }));
}

export interface CallPushInput {
  callId: string;
  conversationId: string;
  callerName: string;
  type: 'audio' | 'video';
  tokens: string[];
  routeOf?: RouteOf;
}

/**
 * What a build that can ring natively while SYPH is closed needs on top of the usual payload: which ringtone to use and
 * whether to buzz (and, for a group call, that the key of the call is the group one). Older builds get none of it.
 */
function ringData(route: TokenRoute, group: boolean): Record<string, string> {
  if (!route.closedAlerts) return {};
  return { ringtone: route.ringtone, vibrate: route.vibrate ? '1' : '0', ...(group ? { group: '1' } : {}) };
}

export function buildCallPushes(input: CallPushInput): ExpoPushMessage[] {
  const routeOf = input.routeOf ?? defaultRouteOf;
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
    data: { type: 'call', conversationId: input.conversationId, callId: input.callId, ...ringData(routeOf(to), false) },
  }));
}

/**
 * Tells a phone that is ringing natively (SYPH closed) that the call is over, so it stops. Silent: no title or text, only
 * a type for the app's own push handler. Only devices whose build can ring natively are sent this.
 */
export function buildCallEndedPushes(input: { callId: string; tokens: string[] }): ExpoPushMessage[] {
  return input.tokens.map((to) => ({
    to,
    priority: 'high',
    ttl: CALL_PUSH_TTL_SECONDS,
    data: { type: 'call-ended', callId: input.callId },
  }));
}

/** What a missed call says, in the notification and in the in-app alert. */
export const missedCallText = (type: 'audio' | 'video'): string => `Missed ${type === 'video' ? 'video' : 'voice'} call`;

/**
 * "Missed voice call" / "Missed video call", sent by the caller's phone when a ring ends unanswered (timed out, or the
 * caller hung up first). It uses the messages channel, so it makes the normal message sound, not the ringtone, and
 * tapping it opens the chat.
 */
export function buildMissedCallPushes(input: CallPushInput): ExpoPushMessage[] {
  const caller = input.callerName.trim() || 'Someone';
  return input.tokens.map((to) => ({
    to,
    title: caller,
    body: missedCallText(input.type),
    sound: 'default',
    priority: 'high',
    ttl: MISSED_CALL_PUSH_TTL_SECONDS,
    channelId: (input.routeOf ?? defaultRouteOf)(to).messageChannel,
    data: { type: 'missed-call', conversationId: input.conversationId, callId: input.callId },
  }));
}

export interface GroupCallPushInput {
  callId: string;
  conversationId: string;
  groupName?: string;
  callerName: string;
  type: 'audio' | 'video';
  tokens: string[];
  routeOf?: RouteOf;
}

/** "Alice started a video call" in the group's name. Rings on the calls channel and expires quickly. */
export function buildGroupCallPushes(input: GroupCallPushInput): ExpoPushMessage[] {
  const routeOf = input.routeOf ?? defaultRouteOf;
  const caller = input.callerName.trim() || 'Someone';
  const kind = input.type === 'video' ? 'video' : 'voice';
  return input.tokens.map((to) => ({
    to,
    title: input.groupName?.trim() || 'Group',
    body: `${caller} started a ${kind} call`,
    sound: 'default',
    priority: 'high',
    ttl: GROUP_CALL_PUSH_TTL_SECONDS,
    channelId: CALLS_CHANNEL_ID,
    data: { type: 'call', conversationId: input.conversationId, callId: input.callId, ...ringData(routeOf(to), true) },
  }));
}

/** Splits a list into groups of at most `size` (Expo's per-request limit). */
export function chunk<T>(items: T[], size: number = EXPO_PUSH_BATCH_SIZE): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}
