/**
 * liveLocationTask.ts
 * The background half of live location sharing. expo-location wakes this task with new positions even while SYPH is in
 * the background (a foreground-service notification keeps Android from stopping it). For every saved share it writes the
 * position (throttled) or ends the share when its time is up.
 *
 * defineTask has to run in the global scope of the bundle, so _layout.tsx imports this file first. When the app is
 * launched only to run the task, nothing else of the UI exists, so this file must not depend on React.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { auth } from '../firebaseConfig';
import { LIVE_LOCATION_TASK, StoredShare, planFix } from '../utils/liveShares';
import { isValidCoords, shouldPublish } from '../utils/location';
import { endLocationMessage } from './chatService';
import { updateShares } from './liveLocationStore';
import { endLiveLocation, updateLiveLocation } from './locationService';

const warn = (what: string) => (error: unknown) =>
  console.warn(`Live location task: ${what}:`, error instanceof Error ? error.message : error);

async function stopTask() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK);
    }
  } catch (error) {
    warn('stop')(error);
  }
}

export const endShare = (share: Pick<StoredShare, 'id' | 'conversationId' | 'expiresAt'>) =>
  Promise.allSettled([
    endLiveLocation(share.conversationId, share.id),
    endLocationMessage(share.conversationId, share.id, Math.min(Date.now(), share.expiresAt)),
  ]);

async function handlePosition(location: Location.LocationObject) {
  const lat = location.coords.latitude;
  const lng = location.coords.longitude;
  if (!isValidCoords(lat, lng)) return;

  // In a task started without the UI, sign-in is still being restored from the device.
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    await stopTask();
    return;
  }

  const fix = { lat, lng, at: Date.now() };
  let plan: ReturnType<typeof planFix> = { publish: [], expired: [], keep: [] };
  await updateShares((current) => {
    plan = planFix(current, fix, uid, shouldPublish);
    return plan.keep;
  });

  const position = { lat, lng, accuracy: location.coords.accuracy ?? null };
  await Promise.allSettled([
    ...plan.publish.map((share) => updateLiveLocation(share.conversationId, share.id, position).catch(warn('update'))),
    ...plan.expired.map(endShare),
  ]);

  if (plan.keep.length === 0) await stopTask();
}

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(LIVE_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    warn('task')(error);
    return;
  }
  const latest = data?.locations?.[data.locations.length - 1];
  if (latest) await handlePosition(latest).catch(warn('position'));
});
