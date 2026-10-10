/**
 * useOnlineStatus.ts
 * True when the device has no usable internet connection (NFR-07).
 *
 * expo-network reports nothing until its first read, so the app is assumed online until it says otherwise.
 * That avoids flashing an "offline" banner on every launch.
 */

import { NetworkStateType, useNetworkState } from 'expo-network';

export function useIsOffline(): boolean {
  const state = useNetworkState();
  return (
    state.isInternetReachable === false ||
    (state.isConnected === false && state.type === NetworkStateType.NONE)
  );
}
