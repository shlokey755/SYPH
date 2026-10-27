/**
 * messageType.ts
 * The app now sends text, GIFs and live locations only. Photos, videos, voice notes and documents were removed (no file
 * storage), but chats created earlier can still contain them, so they are recognised and shown as a plain label.
 */

import type { MessageType } from '../types';

/** Types that can no longer be sent. They only exist in old messages. */
export type LegacyMediaType = 'image' | 'video' | 'audio' | 'document';

export const isLegacyMediaType = (type: MessageType): type is LegacyMediaType =>
  type === 'image' || type === 'video' || type === 'audio' || type === 'document';

const LABELS: Record<LegacyMediaType, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  document: 'Document',
};

/** "Photo (no longer available)" - what an old attachment shows in place of the file. */
export const legacyMediaLabel = (type: LegacyMediaType): string => `${LABELS[type]} (no longer available)`;
