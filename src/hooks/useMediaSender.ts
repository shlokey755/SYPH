/**
 * useMediaSender.ts
 * Picks, uploads and sends non-text messages. Uploads show a progress toast and failures an error toast (NFR-06).
 */

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback } from 'react';
import * as chat from '../services/chatService';
import { chatMediaPath, friendlyUploadError, MAX_UPLOAD_BYTES, uploadFile } from '../services/mediaService';
import { Conversation, MessageMedia, MessageType, ReplyPreview } from '../types';
import { useToast } from './toastNotifications';

interface Options {
  conversation: Conversation | undefined;
  me: { uid: string; username: string } | null;
  replyTo: ReplyPreview | null;
  /** Called once a message with the reply attached has been queued. */
  onReplyConsumed: () => void;
}

interface Asset {
  uri: string;
  type: MessageType;
  name: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  durationMs?: number;
}

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export function useMediaSender({ conversation, me, replyTo, onReplyConsumed }: Options) {
  const toast = useToast();

  const sendAsset = useCallback(
    async (asset: Asset) => {
      if (!conversation || !me) return;
      if (asset.size && asset.size > MAX_UPLOAD_BYTES) {
        toast.error('File too large', 'The limit is 25 MB.');
        return;
      }

      const label = asset.type === 'audio' ? 'voice message' : asset.type;
      const progressId = toast.progress(`Uploading ${label}`, 0);
      try {
        const { url, size } = await uploadFile({
          uri: asset.uri,
          path: chatMediaPath(conversation.id, me.uid, asset.name),
          mimeType: asset.mimeType,
          onProgress: (p) => toast.update(progressId, { progress: p }),
        });
        toast.dismiss(progressId);

        const media: MessageMedia = { url, name: asset.name, mimeType: asset.mimeType, size };
        if (asset.width) media.width = asset.width;
        if (asset.height) media.height = asset.height;
        if (asset.durationMs) media.durationMs = asset.durationMs;

        const reply = replyTo;
        if (reply) onReplyConsumed();
        chat
          .sendMessage(conversation, me, { type: asset.type, media, replyTo: reply ?? undefined })
          .catch((e) => toast.error('Message not sent', errorText(e)));
      } catch (e) {
        toast.dismiss(progressId);
        toast.error(`Could not send ${label}`, friendlyUploadError(e));
      }
    },
    [conversation, me, replyTo, onReplyConsumed, toast]
  );

  const fromImagePicker = useCallback(
    (result: ImagePicker.ImagePickerResult) => {
      if (result.canceled || !result.assets[0]) return;
      const a = result.assets[0];
      const isVideo = a.type === 'video';
      const ext = extensionOf(a.fileName ?? a.uri) || (isVideo ? 'mp4' : 'jpg');
      const mimeType = a.mimeType ?? (isVideo ? 'video/mp4' : ext === 'gif' ? 'image/gif' : 'image/jpeg');
      return sendAsset({
        uri: a.uri,
        type: isVideo ? 'video' : mimeType === 'image/gif' ? 'gif' : 'image',
        name: a.fileName ?? `${isVideo ? 'video' : 'photo'}-${Date.now()}.${ext}`,
        mimeType,
        size: a.fileSize,
        width: a.width,
        height: a.height,
        durationMs: isVideo ? (a.duration ?? undefined) : undefined,
      });
    },
    [sendAsset]
  );

  const pickFromLibrary = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
      });
      await fromImagePicker(result);
    } catch (e) {
      toast.error('Could not open your library', errorText(e));
    }
  }, [fromImagePicker, toast]);

  const takePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        toast.error('Camera permission needed', 'Allow camera access in your phone settings.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
        videoMaxDuration: 60,
      });
      await fromImagePicker(result);
    } catch (e) {
      toast.error('Could not open the camera', errorText(e));
    }
  }, [fromImagePicker, toast]);

  const pickDocument = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets[0]) return;
      const a = result.assets[0];
      await sendAsset({
        uri: a.uri,
        type: 'document',
        name: a.name,
        mimeType: a.mimeType ?? 'application/octet-stream',
        size: a.size,
      });
    } catch (e) {
      toast.error('Could not pick the document', errorText(e));
    }
  }, [sendAsset, toast]);

  const sendVoice = useCallback(
    (uri: string, durationMs: number) =>
      sendAsset({
        uri,
        type: 'audio',
        name: `voice-${Date.now()}.m4a`,
        mimeType: 'audio/m4a',
        durationMs,
      }),
    [sendAsset]
  );

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

  return { pickFromLibrary, takePhoto, pickDocument, sendVoice, sendSticker, sendGif };
}
