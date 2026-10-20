/**
 * pushSender.ts
 * Wakes a recipient's phone when a message or call arrives while their app is closed, without any server.
 *
 * After the sender's write succeeds, this device asks Expo's free push service (which forwards to Google FCM) to
 * notify the recipient's registered devices. Everything here is best effort and never throws: a failed push must not
 * fail the message or the call. It does nothing when EXPO_PUBLIC_PUSH_MODE is "relay" (the Node relay in server/
 * sends instead) or "off".
 */

import {
  EXPO_PUSH_URL,
  ExpoPushMessage,
  MAX_MESSAGE_RECIPIENTS,
  allowsCallPush,
  allowsMessagePush,
  buildCallPushes,
  buildMessagePushes,
  chunk,
  parsePushMode,
} from '../utils/push';
import { getPushTarget } from './pushTargets';

// Read as a literal so Expo can inline it at build time.
const MODE = parsePushMode(process.env.EXPO_PUBLIC_PUSH_MODE);

const REQUEST_TIMEOUT_MS = 10_000;

const warn = (what: string) => (error: unknown) =>
  console.warn(`Push ${what} failed:`, (error as { message?: string })?.message ?? error);

async function postToExpo(messages: ExpoPushMessage[]): Promise<void> {
  for (const batch of chunk(messages)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn(`Push service answered ${response.status}`);
        continue;
      }
      // Per-device problems come back in the body (for example DeviceNotRegistered for an uninstalled app).
      const body = (await response.json().catch(() => null)) as { data?: { status?: string; message?: string }[] } | null;
      const failed = body?.data?.find((ticket) => ticket?.status === 'error');
      if (failed) console.warn('Push not delivered to a device:', failed.message ?? 'unknown error');
    } catch (error) {
      warn('request')(error);
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface MessagePushRequest {
  conversation: { id: string; participantIds: string[]; isGroup?: boolean; groupName?: string };
  senderUid: string;
  senderName: string;
  /** Short preview (messagePreview in chatService): the text, or "Photo", "GIF" and so on. */
  preview: string;
}

/** Notifies everyone else in the conversation who has notifications on and has not muted it. */
export async function notifyMessage(request: MessagePushRequest): Promise<void> {
  if (MODE !== 'client') return;
  try {
    const { conversation, senderUid } = request;
    const recipients = conversation.participantIds.filter((uid) => uid !== senderUid).slice(0, MAX_MESSAGE_RECIPIENTS);
    if (recipients.length === 0) return;

    const targets = await Promise.all(recipients.map(getPushTarget));
    const tokens = targets.flatMap((target) =>
      target && target.tokens.length > 0 && allowsMessagePush(target, conversation.id) ? target.tokens : []
    );
    if (tokens.length === 0) return;

    await postToExpo(
      buildMessagePushes({
        conversationId: conversation.id,
        isGroup: conversation.isGroup === true,
        groupName: conversation.groupName,
        senderName: request.senderName,
        preview: request.preview,
        tokens,
      })
    );
  } catch (error) {
    warn('message')(error);
  }
}

export interface CallPushRequest {
  callId: string;
  conversationId: string;
  callerName: string;
  type: 'audio' | 'video';
  calleeUid: string;
}

/** Rings the callee's phone. Honours the account-wide switch only, not the chat mute. */
export async function notifyCall(request: CallPushRequest): Promise<void> {
  if (MODE !== 'client') return;
  try {
    const target = await getPushTarget(request.calleeUid);
    if (!target || target.tokens.length === 0 || !allowsCallPush(target)) return;
    await postToExpo(
      buildCallPushes({
        callId: request.callId,
        conversationId: request.conversationId,
        callerName: request.callerName,
        type: request.type,
        tokens: target.tokens,
      })
    );
  } catch (error) {
    warn('call')(error);
  }
}
