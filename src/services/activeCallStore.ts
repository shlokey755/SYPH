/**
 * activeCallStore.ts
 * Which call SYPH is in right now, and its live session, held above the screens.
 *
 * The call hooks (useCallSession / useGroupCallSession) hang up when the component that runs them goes away. Run from a
 * screen, that meant a call ended the moment the person left the call screen. They now run inside a host component at the
 * root of the app (components/call/ActiveCallHost.tsx), and the screens only draw what the host publishes here, so a
 * call survives going back to the chat, switching tabs, or sending SYPH to the background.
 *
 * One call at a time. A module-level store (not React state) so the host can publish a new session on every render without
 * re-rendering the component that mounts it, which would loop. No Firebase or WebRTC in here: the sessions are only
 * stored, not created.
 */

import { useSyncExternalStore } from 'react';
import type { useCallSession, OutgoingCall } from '../hooks/useCallSession';
import type { useGroupCallSession } from '../hooks/useGroupCallSession';
import type { CallType } from '../types';
import { CallRef, CallRequestOutcome, classifyCallRequest } from '../utils/callBackground';

export type DirectSession = ReturnType<typeof useCallSession>;
export type GroupSession = ReturnType<typeof useGroupCallSession>;

export interface DirectCallRequest {
  kind: 'direct';
  /** Id of a call to answer, or null when placing a new one. */
  callId: string | null;
  outgoing?: OutgoingCall;
}

export interface GroupCallRequest {
  kind: 'group';
  /** Id of a call to join, or null when starting a new one. */
  callId: string | null;
  conversationId: string;
  type: CallType;
}

export type CallRequest = DirectCallRequest | GroupCallRequest;
export type ActiveDirectCall = DirectCallRequest & { key: string };
export type ActiveGroupCall = GroupCallRequest & { key: string };
export type ActiveCall = ActiveDirectCall | ActiveGroupCall;

interface Snapshot {
  active: ActiveCall | null;
  direct: DirectSession | null;
  group: GroupSession | null;
}

const EMPTY: Snapshot = { active: null, direct: null, group: null };

let snapshot: Snapshot = EMPTY;
let counter = 0;
const listeners = new Set<() => void>();

function set(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The call that is running, or null. For event handlers and effects; components use the hooks below. */
export const getActiveCall = (): ActiveCall | null => snapshot.active;

const refOf = (call: ActiveCall): CallRef => ({
  kind: call.kind,
  callId: call.callId,
  conversationId:
    call.kind === 'group' ? call.conversationId : (call.outgoing?.conversationId ?? snapshot.direct?.call?.conversationId ?? null),
});

const requestRef = (request: CallRequest): CallRef => ({
  kind: request.kind,
  callId: request.callId,
  conversationId: request.kind === 'group' ? request.conversationId : (request.outgoing?.conversationId ?? null),
});

/**
 * Asks to be in this call. 'start' means the host now runs it; 'attach' that it is the call already running; 'busy'
 * that a different call is running (the caller should show that one instead).
 */
export function startCall(request: CallRequest): CallRequestOutcome {
  const active = snapshot.active;
  const session = active?.kind === 'group' ? snapshot.group : snapshot.direct;
  const activeEnded = session?.phase === 'ended';
  const outcome = classifyCallRequest(active ? refOf(active) : null, activeEnded, requestRef(request));
  if (outcome === 'start') {
    counter += 1;
    set({ active: { ...request, key: `call-${counter}` } as ActiveCall, direct: null, group: null });
  }
  return outcome;
}

/**
 * Lets go of the call: the host unmounts, which hangs up if the call is still on. With a key, only that call is
 * released, so a late timer from an old call cannot end a new one.
 */
export function releaseCall(key?: string): void {
  if (!snapshot.active || (key !== undefined && snapshot.active.key !== key)) return;
  set(EMPTY);
}

/** The host calls this on every render with its session. Ignored once the call is no longer the active one. */
export function publishSession(key: string, session: DirectSession | GroupSession): void {
  const active = snapshot.active;
  if (!active || active.key !== key) return;
  set(
    active.kind === 'direct'
      ? { active, direct: session as DirectSession, group: null }
      : { active, direct: null, group: session as GroupSession }
  );
}

/** The host calls this when it unmounts. */
export function unpublishSession(key: string): void {
  if (!snapshot.active || snapshot.active.key !== key) return;
  set({ active: snapshot.active, direct: null, group: null });
}

// Each hook selects one field, so a component only re-renders when that field changes. The host itself must only use
// `useActiveCall`, which changes when a call starts or ends, never `useDirectSession` / `useGroupSession`, which change
// on every tick of a call.
export const useActiveCall = (): ActiveCall | null =>
  useSyncExternalStore(subscribe, () => snapshot.active, () => null);
export const useDirectSession = (): DirectSession | null =>
  useSyncExternalStore(subscribe, () => snapshot.direct, () => null);
export const useGroupSession = (): GroupSession | null =>
  useSyncExternalStore(subscribe, () => snapshot.group, () => null);
