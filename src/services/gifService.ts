/**
 * gifService.ts
 * Fetches GIFs from Giphy for the picker, remembers the results, and downloads the first trending ones ahead of time so the
 * picker has pictures on screen the moment it opens. Needs EXPO_PUBLIC_GIPHY_API_KEY (API.md 1.2).
 *
 *   - results are remembered per search for ten minutes (utils/gifs.ts GifCache); older ones are shown at once and refreshed
 *   - the same search asked twice at the same time is one request
 *   - warmGifs() runs when a chat opens: it loads trending and downloads the first PRELOAD_COUNT pictures to the phone's
 *     disk, which the picker and the chat bubbles read from
 *
 * A Giphy beta key allows 100 requests an hour, so every request is worth saving; the above keeps normal use far under it.
 */

import { Image } from 'expo-image';
import { Gif, GifCache, gifKey, parseGifs, PRELOAD_COUNT } from '../utils/gifs';

const API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
const REQUEST_TIMEOUT_MS = 12_000;

export const hasGiphyKey = !!API_KEY;

const cache = new GifCache<Gif[]>();
const inFlight = new Map<string, Promise<Gif[]>>();

/** What is remembered for this search, if anything, and whether it is still fresh. */
export const peekGifs = (term: string): { gifs: Gif[]; fresh: boolean } | undefined => {
  const hit = cache.peek(gifKey(term));
  return hit ? { gifs: hit.value, fresh: hit.fresh } : undefined;
};

async function fetchGifs(term: string): Promise<Gif[]> {
  const endpoint = term
    ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(term)}&`
    : 'https://api.giphy.com/v1/gifs/trending?';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${endpoint}api_key=${API_KEY}&limit=30&rating=pg-13`, { signal: controller.signal });
    if (response.status === 429) throw new Error('GIPHY is busy right now. Try again in a few minutes.');
    if (!response.ok) throw new Error(`Giphy returned ${response.status}`);
    return parseGifs(await response.json());
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('GIPHY took too long to answer.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** The GIFs for a search ("" is trending), from Giphy, remembered for next time. */
export function loadGifs(term: string): Promise<Gif[]> {
  if (!API_KEY) return Promise.resolve([]);
  const key = gifKey(term);
  const running = inFlight.get(key);
  if (running) return running;

  const request = fetchGifs(key)
    .then((gifs) => {
      cache.set(key, gifs);
      return gifs;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/**
 * Gets trending ready before the picker is opened: the list, and the first few pictures on the phone's disk. Does nothing
 * when trending is already fresh, so opening several chats in a row costs one request. Never throws.
 */
export function warmGifs(): void {
  if (!API_KEY || peekGifs('')?.fresh) return;
  loadGifs('')
    .then((gifs) => {
      const urls = gifs.slice(0, PRELOAD_COUNT).map((g) => g.url);
      if (urls.length) return Image.prefetch(urls, { cachePolicy: 'disk' });
    })
    .catch(() => {});
}
