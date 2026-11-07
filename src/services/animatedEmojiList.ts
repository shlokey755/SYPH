/**
 * animatedEmojiList.ts
 * Which emoji have an animation in Google's Noto Emoji Animation set (utils/animatedEmoji.ts says where the files are).
 *
 * The list is a small public file on GitHub Pages. It is fetched the first time an emoji-only message is shown, kept on the
 * device (AsyncStorage) and refreshed after a week, so after the first time it costs nothing and works offline. If it cannot
 * be fetched (offline, the file moved or changed shape) the answer stays "unknown" and the emoji are simply tried one by one;
 * a failed fetch is not retried for ten minutes. Animation files that failed to load are remembered for this session so a
 * 404 is not asked again.
 *
 * Free, no key. The animations are CC BY 4.0: credited in the Me tab.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildIndex, NOTO_LIST_URL, parseAnimatedList } from '../utils/animatedEmoji';

const STORAGE_KEY = 'syph.animatedEmojiList.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

let index: Map<string, string> | null = null;
let loadedAt = 0;
let lastFailure = 0;
let loading = false;
const listeners = new Set<() => void>();
const failedUrls = new Set<string>();

function setIndex(codes: string[], at: number) {
  index = buildIndex(codes);
  loadedAt = at;
  listeners.forEach((listener) => listener());
}

export function subscribeAnimatedEmojiList(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The list as an index, or null while it is unknown. */
export const getAnimatedEmojiIndex = (): Map<string, string> | null => index;

export const markAnimationFailed = (url: string): void => {
  failedUrls.add(url);
};
export const animationFailed = (url: string): boolean => failedUrls.has(url);

async function fetchCodes(): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(NOTO_LIST_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseAnimatedList(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function readCache(): Promise<{ at: number; codes: string[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { at?: unknown; codes?: unknown };
    if (typeof saved.at !== 'number' || !Array.isArray(saved.codes)) return null;
    const codes = saved.codes.filter((code): code is string => typeof code === 'string');
    return codes.length > 0 ? { at: saved.at, codes } : null;
  } catch {
    return null;
  }
}

/** Starts loading the list if it is not loaded, or is more than a week old. Safe to call as often as you like. */
export function loadAnimatedEmojiList(): void {
  const now = Date.now();
  if (loading) return;
  if (index && now - loadedAt < MAX_AGE_MS) return;
  if (now - lastFailure < RETRY_AFTER_MS) return;
  loading = true;
  (async () => {
    const cached = index ? null : await readCache();
    if (cached) {
      setIndex(cached.codes, cached.at);
      if (now - cached.at < MAX_AGE_MS) return;
    }
    const codes = await fetchCodes();
    if (codes.length === 0) throw new Error('the list was empty or not in the expected shape');
    setIndex(codes, Date.now());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), codes })).catch(() => {});
  })()
    .catch((error: unknown) => {
      lastFailure = Date.now();
      console.warn('Animated emoji list:', error instanceof Error ? error.message : error);
    })
    .finally(() => {
      loading = false;
    });
}
