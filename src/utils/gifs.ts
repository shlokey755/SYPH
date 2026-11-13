/**
 * gifs.ts
 * The pure parts of the GIF picker: turning a Giphy response into the list the picker shows, normalising a search term, and
 * a small time-limited cache of results. No React, no native code, no network, so plain Node can test it (the fetching and
 * preloading are in services/gifService.ts).
 *
 * One file is used for the grid, the preload and the message that gets sent: the 200 px wide "fixed_width" rendition, as
 * WebP when Giphy has one (a lot smaller than the GIF, and expo-image animates it on both phones), else as GIF. Because the
 * picker and the chat bubble use the exact same URL, the picture you picked is already on the phone when the bubble draws.
 */

/** How many trending GIFs are downloaded ahead of time, before the picker is opened. */
export const PRELOAD_COUNT = 8;
/** Results younger than this are used as they are; older ones are shown at once and refreshed in the background. */
export const GIF_CACHE_TTL_MS = 10 * 60 * 1000;
/** How many searches are remembered. */
export const GIF_CACHE_MAX = 30;

export interface Gif {
  id: string;
  /** The animated file: WebP when available, otherwise GIF. This is what is shown and what is sent. */
  url: string;
  /** A tiny still of the first frame, shown while the animation downloads. */
  still: string | null;
  width: number;
  height: number;
}

const isHttps = (value: unknown): value is string => typeof value === 'string' && value.startsWith('https://');

const size = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The GIFs in a Giphy search or trending response. It comes from the network, so nothing in it is trusted. */
export function parseGifs(json: unknown): Gif[] {
  const data = (json as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const gifs: Gif[] = [];
  for (const item of data) {
    const id = item?.id;
    const images = item?.images;
    const rendition = images?.fixed_width;
    if (typeof id !== 'string' || !id || !rendition || seen.has(id)) continue;
    const url = isHttps(rendition.webp) ? rendition.webp : isHttps(rendition.url) ? rendition.url : null;
    if (!url) continue;
    seen.add(id);
    const still = images?.fixed_width_still?.url;
    gifs.push({
      id,
      url,
      still: isHttps(still) ? still : null,
      width: size(rendition.width, 200),
      height: size(rendition.height, 200),
    });
  }
  return gifs;
}

/** The key results are remembered under: "  Happy   CAT " and "happy cat" are the same search. Trending is "". */
export const gifKey = (term: string): string => term.trim().toLowerCase().replace(/\s+/g, ' ');

/** The mime type to store with a sent GIF, from its URL. */
export const gifMime = (url: string): string => (/\.webp$/i.test(url.split(/[?#]/)[0]) ? 'image/webp' : 'image/gif');

/**
 * Results by search key. Entries older than the time limit are still returned (so the picker can show them straight away)
 * but marked not fresh, so the caller knows to refresh them. The oldest-used entry goes when it is full. `now` is injectable
 * for tests.
 */
export class GifCache<T> {
  private readonly entries = new Map<string, { at: number; value: T }>();
  private readonly ttlMs: number;
  private readonly max: number;

  // Plain fields, not constructor parameter properties: Node's type stripping (used by the unit tests) does not run those.
  constructor(ttlMs: number = GIF_CACHE_TTL_MS, max: number = GIF_CACHE_MAX) {
    this.ttlMs = ttlMs;
    this.max = max;
  }

  peek(key: string, now: number = Date.now()): { value: T; fresh: boolean } | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // Reading it makes it the newest, so a search you keep coming back to is the last to be dropped.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { value: entry.value, fresh: now - entry.at < this.ttlMs };
  }

  set(key: string, value: T, now: number = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { at: now, value });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
