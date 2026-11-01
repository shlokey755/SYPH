/**
 * startupRoute.ts
 * Lets the entry route (app/index.tsx) tell the root layout that it has navigated to the first real screen, so the
 * splash can stay up until then instead of revealing the entry route's spinner.
 */

import { useSyncExternalStore } from 'react';

let routed = false;
const listeners = new Set<() => void>();

export function markStartupRouted(): void {
  if (routed) return;
  routed = true;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): boolean => routed;

export function useStartupRouted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
