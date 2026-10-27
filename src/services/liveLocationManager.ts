/**
 * liveLocationManager.ts
 * Owns every live location share this phone is running: asks for permission, posts the message, keeps ONE position
 * watcher going for all shares, writes updates (throttled, see shouldPublish) and ends shares on time.
 *
 * It lives outside React so a share keeps running while the person moves between screens, and so logging out can stop
 * every share first (stopAllLiveShares). Updates only arrive while SYPH is open: expo-location's foreground watcher
 * pauses when the app is closed or in the background. Background tracking needs a development build and the "allow
 * all the time" permission, and is not enabled. Viewers see "Last updated ..." once updates stop.
 */

import * as Location from 'expo-location';
import { Conversation } from '../types';
import { MAX_SHARE_MS, isValidCoords, shouldPublish } from '../utils/location';
import { Member, endLocationMessage, newMessageId, sendMessage } from './chatService';
import { LivePosition, createLiveLocation, endLiveLocation, updateLiveLocation } from './locationService';

export interface LiveShare {
  /** Id of the location message, which is also the id of the location document. */
  id: string;
  conversationId: string;
  expiresAt: number;
}

interface RunningShare extends LiveShare {
  last: { lat: number; lng: number; at: number } | null;
  timer: ReturnType<typeof setTimeout>;
}

export type StartResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'permission-denied' | 'permission-blocked' | 'no-position' | 'failed'; message?: string };

/** How long to wait for the server to take the first write before giving up (offline, bad network). */
const START_TIMEOUT_MS = 12_000;

const running = new Map<string, RunningShare>();
const listeners = new Set<() => void>();
let snapshot: LiveShare[] = [];
let watcher: Location.LocationSubscription | null = null;
let watcherStarting = false;

const warn = (what: string) => (error: unknown) =>
  console.warn(`Live location: ${what}:`, error instanceof Error ? error.message : error);

// ---------- what the UI reads (useSyncExternalStore needs a stable snapshot between changes) ----------

const publish = () => {
  snapshot = [...running.values()].map(({ id, conversationId, expiresAt }) => ({ id, conversationId, expiresAt }));
  listeners.forEach((listener) => listener());
};

export const getLiveShares = (): LiveShare[] => snapshot;

export function subscribeLiveShares(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------- the position watcher ----------

const stopWatcher = () => {
  watcher?.remove();
  watcher = null;
};

function onPosition(location: Location.LocationObject) {
  const now = Date.now();
  const lat = location.coords.latitude;
  const lng = location.coords.longitude;
  if (!isValidCoords(lat, lng)) return;
  const position: LivePosition = { lat, lng, accuracy: location.coords.accuracy ?? null };

  for (const share of [...running.values()]) {
    if (now >= share.expiresAt) {
      void stopLiveShare(share.id);
      continue;
    }
    const next = { lat, lng, at: now };
    if (!shouldPublish(share.last, next)) continue;
    share.last = next;
    updateLiveLocation(share.conversationId, share.id, position).catch(warn('update'));
  }
}

async function ensureWatcher() {
  if (watcher || watcherStarting || running.size === 0) return;
  watcherStarting = true;
  try {
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5_000, distanceInterval: 5 },
      onPosition,
      (error) => warn('watcher')(error)
    );
    // Every share may have ended while the watcher was starting.
    if (running.size === 0) subscription.remove();
    else watcher = subscription;
  } catch (error) {
    warn('start watcher')(error);
  } finally {
    watcherStarting = false;
  }
}

// ---------- starting and stopping ----------

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/**
 * Asks for permission, reads the current position, writes the location document and then the message, and starts
 * following. The document comes first so nobody can open a location message that has nothing behind it.
 */
export async function startLiveShare(params: {
  conversation: Pick<Conversation, 'id' | 'participantIds'> & Partial<Pick<Conversation, 'isGroup' | 'groupName'>>;
  sender: Member;
  durationMs: number;
}): Promise<StartResult> {
  const { conversation, sender } = params;
  const duration = Math.max(60_000, Math.min(params.durationMs, MAX_SHARE_MS));

  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    return { ok: false, reason: permission.canAskAgain ? 'permission-denied' : 'permission-blocked' };
  }

  let fix: Location.LocationObject;
  try {
    fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch (error) {
    warn('current position')(error);
    return { ok: false, reason: 'no-position' };
  }
  const position: LivePosition = {
    lat: fix.coords.latitude,
    lng: fix.coords.longitude,
    accuracy: fix.coords.accuracy ?? null,
  };
  if (!isValidCoords(position.lat, position.lng)) return { ok: false, reason: 'no-position' };

  const id = newMessageId(conversation.id);
  const expiresAt = Date.now() + duration;
  try {
    await withTimeout(createLiveLocation(conversation.id, id, sender.uid, position, expiresAt), START_TIMEOUT_MS);
    await withTimeout(
      sendMessage(conversation, sender, { id, type: 'location', location: { expiresAt } }),
      START_TIMEOUT_MS
    );
  } catch (error) {
    warn('start share')(error);
    endLiveLocation(conversation.id, id).catch(() => {});
    return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : undefined };
  }

  const timer = setTimeout(() => void stopLiveShare(id), duration);
  running.set(id, {
    id,
    conversationId: conversation.id,
    expiresAt,
    last: { lat: position.lat, lng: position.lng, at: Date.now() },
    timer,
  });
  publish();
  void ensureWatcher();
  return { ok: true, id };
}

/** Ends one share: the document goes inactive and the bubble flips to "ended" for everyone. Safe to call twice. */
export async function stopLiveShare(id: string): Promise<void> {
  const share = running.get(id);
  if (!share) return;
  clearTimeout(share.timer);
  running.delete(id);
  publish();
  if (running.size === 0) stopWatcher();
  await Promise.allSettled([
    endLiveLocation(share.conversationId, id),
    endLocationMessage(share.conversationId, id, Math.min(Date.now(), share.expiresAt)),
  ]);
}

/** Ends every share. Called before logging out, so a shared phone never keeps broadcasting someone's position. */
export async function stopAllLiveShares(timeoutMs = 3_000): Promise<void> {
  const all = [...running.keys()].map((id) => stopLiveShare(id));
  if (all.length === 0) return;
  await Promise.race([Promise.allSettled(all), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
