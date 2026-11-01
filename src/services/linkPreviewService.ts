/**
 * linkPreviewService.ts
 * Looks up a YouTube video through the free oEmbed endpoint and remembers the answer for this app session. Nothing is
 * stored in Firestore or on disk, and no key is involved. Lazy checking: a card asks when it is shown, and a trusted
 * answer expires (see previewTtlMs), so a video deleted later shows up as unavailable the next time it is looked at.
 */

import { classifyOEmbed, oEmbedUrl, PreviewResult, previewTtlMs, YouTubeLink } from '../utils/linkPreview';

interface Cached {
  at: number;
  result: PreviewResult;
}

const TIMEOUT_MS = 8000;
const MAX_ENTRIES = 300;

const cache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<PreviewResult>>();

/** The remembered answer if it is still fresh, so a card that remounts while scrolling does not flash a skeleton. */
export function peekPreview(id: string): PreviewResult | null {
  const hit = cache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > previewTtlMs(hit.result.state)) {
    cache.delete(id);
    return null;
  }
  return hit.result;
}

function remember(id: string, result: PreviewResult) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(id, { at: Date.now(), result });
}

async function lookup(link: YouTubeLink): Promise<PreviewResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(oEmbedUrl(link.id), { signal: controller.signal });
    let body: unknown = null;
    if (res.status === 200) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }
    return classifyOEmbed(res.status, body, link.id);
  } catch {
    // Offline, timed out or blocked: this says nothing about the video.
    return { state: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/** Fresh cached answer, or one network lookup shared by every card asking for the same video at once. */
export function fetchPreview(link: YouTubeLink): Promise<PreviewResult> {
  const cached = peekPreview(link.id);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(link.id);
  if (pending) return pending;

  const request = lookup(link)
    .then((result) => {
      remember(link.id, result);
      return result;
    })
    .finally(() => inFlight.delete(link.id));
  inFlight.set(link.id, request);
  return request;
}
