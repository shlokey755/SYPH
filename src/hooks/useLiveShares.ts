/**
 * useLiveShares.ts
 * The live location shares this phone is running right now (see services/liveLocationManager.ts).
 */

import { useSyncExternalStore } from 'react';
import { LiveShare, getLiveShares, subscribeLiveShares } from '../services/liveLocationManager';

export function useLiveShares(): LiveShare[] {
  return useSyncExternalStore(subscribeLiveShares, getLiveShares, getLiveShares);
}

/** The share running in one conversation, if any. */
export function useLiveShareIn(conversationId: string | undefined): LiveShare | null {
  const shares = useLiveShares();
  return shares.find((share) => share.conversationId === conversationId) ?? null;
}
