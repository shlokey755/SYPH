/**
 * call.ts
 * Pure call rules shared by the call screen, the incoming-call overlay and the tests.
 * No React, no Firebase: keep it dependency-free so it can be unit tested with plain Node.
 * The status moves here must match the `calls` rules in firestore.rules.
 */

import type { CallStatus } from '../types';

/** How long the caller waits for an answer before marking the call missed. */
export const RING_TIMEOUT_MS = 45_000;

/**
 * A call still marked "ringing" after this long is treated as abandoned (the caller's app died or went offline)
 * and is not shown to the callee. Longer than RING_TIMEOUT_MS to tolerate small clock differences.
 */
export const STALE_RING_MS = 75_000;

/** After the connection drops, wait this long for it to come back before ending the call. */
export const RECONNECT_GRACE_MS = 15_000;

export type CallRole = 'caller' | 'callee';

const TERMINAL: readonly CallStatus[] = ['declined', 'cancelled', 'missed', 'ended'];

export const isTerminalStatus = (status: CallStatus): boolean => TERMINAL.includes(status);

/** Statuses `role` may move the call to from `current`. Mirrors validCallMove() in firestore.rules. */
export function allowedNextStatuses(role: CallRole, current: CallStatus): CallStatus[] {
  if (current === 'ringing') {
    return role === 'callee' ? ['accepted', 'declined'] : ['cancelled', 'missed'];
  }
  if (current === 'accepted') return ['ended'];
  return [];
}

export const canTransition = (role: CallRole, from: CallStatus, to: CallStatus): boolean =>
  allowedNextStatuses(role, from).includes(to);

/** True while an unanswered call is recent enough to ring. */
export function isRingingFresh(createdAtMs: number, nowMs: number): boolean {
  if (!createdAtMs) return true; // server timestamp not resolved yet: it is brand new
  return nowMs - createdAtMs <= STALE_RING_MS;
}

/** Why a call ended, as the person sees it. */
export type CallEndReason =
  | 'ended'
  | 'declined'
  | 'cancelled'
  | 'missed'
  | 'failed'
  | 'unsupported'
  | 'permission'
  | 'busy';

/** Short line for the call screen once it is over. `outgoing` = you placed the call. */
export function endReasonText(reason: CallEndReason, outgoing: boolean): string {
  switch (reason) {
    case 'declined':
      return outgoing ? 'Call declined' : 'You declined the call';
    case 'cancelled':
      return outgoing ? 'Call cancelled' : 'Missed call';
    case 'missed':
      return outgoing ? 'No answer' : 'Missed call';
    case 'failed':
      return 'Connection lost';
    case 'unsupported':
      return 'Calls need an installed build of SYPH';
    case 'permission':
      return 'Camera or microphone access was denied';
    case 'busy':
      return 'Already on another call';
    default:
      return 'Call ended';
  }
}

/** Maps the status a call finished with to the reason shown to this user. */
export function endReasonFromStatus(status: CallStatus): CallEndReason {
  switch (status) {
    case 'declined':
      return 'declined';
    case 'cancelled':
      return 'cancelled';
    case 'missed':
      return 'missed';
    default:
      return 'ended';
  }
}

/** 0 -> "00:00", 75 -> "01:15", 3725 -> "1:02:05". */
export function formatCallClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
