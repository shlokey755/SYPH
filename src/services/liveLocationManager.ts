/**
 * liveLocationManager.ts
 * Owns every live location share this phone is running: asks for permission, posts the message, follows the position
 * and ends shares on time. It also sends a one-time pin ("Send current location").
 *
 * How the position is followed:
 *   - With the "allow all the time" permission, expo-location runs a background task (services/liveLocationTask.ts) with
 *     a foreground-service notification, so sharing continues while SYPH is in the background or its screen is off.
 *   - Without it, a foreground watcher follows the position while SYPH is open, and viewers see "Last updated ..."
 *     once updates stop. Sharing picks up again when the person reopens SYPH.
 * The running shares are also saved on the device (liveLocationStore) so they survive a restart; restoreLiveShares
 * brings them back. Logging out stops every share first (stopAllLiveShares).
 */

import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { Conversation } from '../types';
import { LIVE_LOCATION_TASK, removeShare, upsertShare } from '../utils/liveShares';
import { MAX_SHARE_MS, buildPin, isValidCoords, shouldPublish } from '../utils/location';
import { Member, newMessageId, sendMessage } from './chatService';
import { loadShares, updateShares } from './liveLocationStore';
import { endShare } from './liveLocationTask';
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

type ChatTarget = Pick<Conversation, 'id' | 'participantIds'> & Partial<Pick<Conversation, 'isGroup' | 'groupName'>>;

export type PositionFailure = 'permission-denied' | 'permission-blocked' | 'no-position';

export type PositionResult = { ok: true; position: LivePosition } | { ok: false; reason: PositionFailure };

export type StartResult =
  | { ok: true; id: string }
  | { ok: false; reason: PositionFailure | 'failed'; message?: string };

export type SendResult = StartResult;

/** How long to wait for the server to take the first write before giving up (offline, bad network). */
const START_TIMEOUT_MS = 12_000;

const running = new Map<string, RunningShare>();
const listeners = new Set<() => void>();
let snapshot: LiveShare[] = [];
let watcher: Location.LocationSubscription | null = null;
let watcherStarting = false;
let appStateWatching = false;

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

// ---------- reading the position ----------

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

async function ensureForegroundPermission(): Promise<PositionFailure | null> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status === 'granted') return null;
  return permission.canAskAgain ? 'permission-denied' : 'permission-blocked';
}

/**
 * Asks for permission if needed and reads where the phone is. `fast` accepts a position up to two minutes old, which
 * is what the preview in the share sheet wants (it should appear at once).
 */
export async function readCurrentPosition(options: { fast?: boolean } = {}): Promise<PositionResult> {
  const denied = await ensureForegroundPermission();
  if (denied) return { ok: false, reason: denied };
  try {
    let fix: Location.LocationObject | null = null;
    if (options.fast) fix = await Location.getLastKnownPositionAsync({ maxAge: 120_000 }).catch(() => null);
    if (!fix) fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const position: LivePosition = {
      lat: fix.coords.latitude,
      lng: fix.coords.longitude,
      accuracy: fix.coords.accuracy ?? null,
    };
    if (!isValidCoords(position.lat, position.lng)) return { ok: false, reason: 'no-position' };
    return { ok: true, position };
  } catch (error) {
    warn('current position')(error);
    return { ok: false, reason: 'no-position' };
  }
}

// ---------- following the position: background task, or a foreground watcher ----------

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

/** True when the person allowed location "all the time" (Android 10+: needed for sharing in the background). */
export async function isBackgroundAllowed(): Promise<boolean> {
  try {
    return (await Location.getBackgroundPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

/** Starts the background task if the permission is there. Never asks. Returns whether the task is running. */
async function startBackgroundTask(): Promise<boolean> {
  try {
    if (!(await isBackgroundAllowed())) return false;
    if (await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(LIVE_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      // No distance filter: a phone that stands still still sends its once-a-minute heartbeat (see shouldPublish).
      timeInterval: 10_000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'SYPH is sharing your live location',
        notificationBody: 'Open the chat and tap Stop to end it.',
        notificationColor: '#00E5FF',
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch (error) {
    warn('start background task')(error);
    return false;
  }
}

async function stopBackgroundTask() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK);
    }
  } catch (error) {
    warn('stop background task')(error);
  }
}

let trackingChain: Promise<unknown> = Promise.resolve();

async function applyTracking() {
  if (running.size === 0) {
    stopWatcher();
    await stopBackgroundTask();
    return;
  }
  if (await startBackgroundTask()) stopWatcher();
  else await ensureWatcher();
}

/** Picks the right way to follow the position for the shares that are running. Calls run one after another. */
const ensureTracking = (): Promise<unknown> => {
  trackingChain = trackingChain.then(applyTracking, applyTracking).catch(warn('tracking'));
  return trackingChain;
};

/** When SYPH comes back to the front, the person may just have allowed "all the time" in Settings: switch over. */
function watchAppState() {
  if (appStateWatching) return;
  appStateWatching = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && running.size > 0) void ensureTracking();
  });
}

export type BackgroundAccess = 'granted' | 'denied' | 'blocked';

/**
 * Asks for "allow all the time". On Android 11 and later this opens the system settings page, so call it only after
 * explaining why. If the person turns it on there, tracking switches over when SYPH is opened again (watchAppState).
 */
export async function requestBackgroundAccess(): Promise<BackgroundAccess> {
  try {
    if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return 'denied';
    const result = await Location.requestBackgroundPermissionsAsync();
    if (result.status === 'granted') {
      await ensureTracking();
      return 'granted';
    }
    return result.canAskAgain ? 'denied' : 'blocked';
  } catch (error) {
    warn('background permission')(error);
    return 'denied';
  }
}

// ---------- starting and stopping ----------

function track(share: LiveShare, last: RunningShare['last']) {
  const timer = setTimeout(() => void stopLiveShare(share.id), Math.max(0, share.expiresAt - Date.now()));
  running.set(share.id, { ...share, last, timer });
}

/**
 * Asks for permission, reads the current position, writes the location document and then the message, and starts
 * following. The document comes first so nobody can open a location message that has nothing behind it.
 */
export async function startLiveShare(params: {
  conversation: ChatTarget;
  sender: Member;
  durationMs: number;
}): Promise<StartResult> {
  const { conversation, sender } = params;
  const duration = Math.max(60_000, Math.min(params.durationMs, MAX_SHARE_MS));

  const here = await readCurrentPosition();
  if (!here.ok) return here;
  const { position } = here;

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

  const last = { lat: position.lat, lng: position.lng, at: Date.now() };
  track({ id, conversationId: conversation.id, expiresAt }, last);
  publish();
  await updateShares((current) =>
    upsertShare(current, { id, conversationId: conversation.id, senderUid: sender.uid, expiresAt, last })
  );
  watchAppState();
  void ensureTracking();
  return { ok: true, id };
}

/** Sends the phone's position once, as a pin in the chat. Nothing keeps running afterwards. */
export async function sendCurrentLocation(params: { conversation: ChatTarget; sender: Member }): Promise<SendResult> {
  const here = await readCurrentPosition();
  if (!here.ok) return here;
  const pin = buildPin(here.position.lat, here.position.lng);
  if (!pin) return { ok: false, reason: 'no-position' };
  try {
    await withTimeout(sendMessage(params.conversation, params.sender, { type: 'location', location: pin }), START_TIMEOUT_MS);
  } catch (error) {
    warn('send pin')(error);
    return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : undefined };
  }
  return { ok: true, id: '' };
}

/** Ends one share: the document goes inactive and the bubble flips to "ended" for everyone. Safe to call twice. */
export async function stopLiveShare(id: string): Promise<void> {
  const share = running.get(id);
  if (!share) return;
  clearTimeout(share.timer);
  running.delete(id);
  publish();
  await updateShares((current) => removeShare(current, id));
  void ensureTracking();
  await endShare(share);
}

/**
 * Brings back the shares saved on this phone after SYPH was closed or restarted: ones that ran out meanwhile are ended,
 * the rest continue. Call once the signed-in user is known.
 */
export async function restoreLiveShares(uid: string): Promise<void> {
  const saved = await loadShares();
  const now = Date.now();
  const mine = saved.filter((share) => share.senderUid === uid);
  for (const share of mine) {
    if (running.has(share.id)) continue;
    if (now >= share.expiresAt) {
      void endShare(share);
      continue;
    }
    track({ id: share.id, conversationId: share.conversationId, expiresAt: share.expiresAt }, share.last);
  }
  await updateShares((current) => current.filter((share) => share.senderUid === uid && share.expiresAt > now));
  publish();
  watchAppState();
  void ensureTracking();
}

/** Ends every share. Called before logging out, so a shared phone never keeps broadcasting someone's position. */
export async function stopAllLiveShares(timeoutMs = 3_000): Promise<void> {
  const all = [...running.keys()].map((id) => stopLiveShare(id));
  if (all.length > 0) {
    await Promise.race([Promise.allSettled(all), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  }
  // Even if some did not finish in time, nothing may keep following this account's position.
  await updateShares(() => []);
  stopWatcher();
  await stopBackgroundTask();
}
