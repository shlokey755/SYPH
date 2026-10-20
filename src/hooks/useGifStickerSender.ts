/**
 * useGifStickerSender.ts
 * Sends the only non-text messages the app supports: stickers (an emoji) and GIFs (a Giphy link).
 * Neither uploads a file, so nothing here needs storage. Failures show an error toast (NFR-06).
 */

import { useCallback } from 'react';
import * as chat from '../services/chatService';
import { Conversation, ReplyPreview } from '../types';
import { useToast } from './toastNotifications';

interface Options {
  conversation: Conversation | undefined;
  me: { uid: string; username: string } | null;
  replyTo: ReplyPreview | null;
  /** Called once a message with the reply attached has been queued. */
  onReplyConsumed: () => void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export function useGifStickerSender({ conversation, me, replyTo, onReplyConsumed }: Options) {
  const toast = useToast();

  const sendSticker = useCallback(
    (emoji: string) => {
      if (!conversation || !me) return;
      const reply = replyTo;
      if (reply) onReplyConsumed();
      chat
        .sendMessage(conversation, me, { type: 'sticker', text: emoji, replyTo: reply ?? undefined })
        .catch((e) => toast.error('Message not sent', errorText(e)));
    },
    [conversation, me, replyTo, onReplyConsumed, toast]
  );

  const sendGif = useCallback(
    (url: string, width?: number, height?: number) => {
      if (!conversation || !me) return;
      const reply = replyTo;
      if (reply) onReplyConsumed();
      chat
        .sendMessage(conversation, me, {
          type: 'gif',
          media: { url, mimeType: 'image/gif', width, height },
          replyTo: reply ?? undefined,
        })
        .catch((e) => toast.error('Message not sent', errorText(e)));
    },
    [conversation, me, replyTo, onReplyConsumed, toast]
  );

  return { sendSticker, sendGif };
}
