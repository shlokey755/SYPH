/**
 * linkPreview.ts
 * Pure helpers for YouTube link cards: find a YouTube / Shorts link in message text, build the URLs the card needs,
 * and turn a YouTube oEmbed response into one of four card states. No network or React here, so it is unit-tested.
 *
 * oEmbed is free and needs no key: https://www.youtube.com/oembed?url=<watch url>&format=json
 *
 * Why four states: only a 404 / 400 means "gone". A 401 means the video exists but cannot be previewed (private or
 * embedding off), and a network or server error says nothing about the video, so it must never read as "deleted".
 */

export type YouTubeKind = 'video' | 'short';

export interface YouTubeLink {
  id: string;
  kind: YouTubeKind;
  /** Canonical URL to open: the watch page, or the Shorts page for a Short. */
  openUrl: string;
}

export type PreviewState = 'ok' | 'unavailable' | 'restricted' | 'error';

export type PreviewResult =
  | { state: 'ok'; title: string; author: string; thumbnail: string }
  | { state: 'unavailable' | 'restricted' | 'error' };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

/** Watch, youtu.be, Shorts, embed and live links. The 11-character id must not be followed by more id characters. */
const YOUTUBE_PATTERN =
  /^https?:\/\/(?:(?:(?:www|m)\.)?youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i;

const SHORTS_PATTERN = /^https?:\/\/(?:(?:www|m)\.)?youtube\.com\/shorts\//i;

const TRAILING_PUNCTUATION =/[.,;:!?)\]}'"]+$/;

/** The first YouTube link in the text, or null. Only the first one gets a card. */
export function extractYouTube(text: string | undefined | null): YouTubeLink | null {
  if (!text) return null;
  for (const raw of text.match(URL_PATTERN) ?? []) {
    const url = raw.replace(TRAILING_PUNCTUATION, '');
    const match = YOUTUBE_PATTERN.exec(url);
    if (!match) continue;
    const id = match[1];
    const kind: YouTubeKind = SHORTS_PATTERN.test(url) ? 'short' : 'video';
    return { id, kind, openUrl: kind === 'short' ? `https://www.youtube.com/shorts/${id}` : watchUrl(id) };
  }
  return null;
}

export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** oEmbed always takes the watch URL, also for Shorts. */
export function oEmbedUrl(id: string): string {
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(id))}&format=json`;
}

export function thumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Maps an oEmbed HTTP status and JSON body to a card state. `body` is the parsed JSON, or null if it did not parse. */
export function classifyOEmbed(status: number, body: unknown, id: string): PreviewResult {
  if (status === 404 || status === 400) return { state: 'unavailable' };
  if (status === 401 || status === 403) return { state: 'restricted' };
  if (status !== 200 || !body || typeof body !== 'object') return { state: 'error' };

  const data = body as Record<string, unknown>;
  const title = clip(data.title, 200);
  if (!title) return { state: 'error' };
  const thumb = typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://') ? data.thumbnail_url : '';
  return { state: 'ok', title, author: clip(data.author_name, 80), thumbnail: thumb || thumbnailUrl(id) };
}

const HOUR = 60 * 60_000;

/**
 * How long a result is trusted before the next render looks again. A good result is re-checked after a few hours,
 * so a video deleted later turns into the "unavailable" card; errors are retried soon.
 */
export function previewTtlMs(state: PreviewState): number {
  switch (state) {
    case 'ok':
      return 6 * HOUR;
    case 'unavailable':
    case 'restricted':
      return HOUR;
    case 'error':
      return 30_000;
  }
}
