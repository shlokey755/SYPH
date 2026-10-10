/**
 * mediaService.ts
 * Firebase Storage uploads with progress (FR-05, NFR-06).
 *
 *   chats/{conversationId}/{uid}/{timestamp}_{name}   message attachments
 *   avatars/{uid}/{timestamp}_{name}                  profile photos
 */

import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../firebaseConfig';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);

export const chatMediaPath = (conversationId: string, uid: string, name: string) =>
  `chats/${conversationId}/${uid}/${Date.now()}_${safeFileName(name)}`;

export const avatarPath = (uid: string, name = 'avatar.jpg') =>
  `avatars/${uid}/${Date.now()}_${safeFileName(name)}`;

interface UploadOptions {
  uri: string;
  path: string;
  mimeType?: string;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
}

export async function uploadFile({
  uri,
  path,
  mimeType,
  onProgress,
}: UploadOptions): Promise<{ url: string; size: number }> {
  const blob = await (await fetch(uri)).blob();
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB)`);
  }

  const task = uploadBytesResumable(
    ref(storage, path),
    blob,
    mimeType ? { contentType: mimeType } : undefined
  );

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0),
      reject,
      async () => {
        try {
          resolve({ url: await getDownloadURL(task.snapshot.ref), size: blob.size });
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

/** Turns Firebase Storage errors into something a person can act on. */
export function friendlyUploadError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case 'storage/unauthorized':
      return 'Not allowed to upload. Storage rules may not be deployed yet (see API.md).';
    case 'storage/bucket-not-found':
    case 'storage/project-not-found':
      return 'Firebase Storage is not set up for this project (see API.md).';
    case 'storage/retry-limit-exceeded':
    case 'storage/network-request-failed':
      return 'Network problem. Check your connection and try again.';
    case 'storage/canceled':
      return 'Upload cancelled.';
    case 'storage/quota-exceeded':
      return 'Storage quota exceeded.';
    default:
      return error instanceof Error ? error.message : 'Upload failed.';
  }
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms?: number): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
