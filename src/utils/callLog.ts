/**
 * callLog.ts
 * Turns the call documents between two people into the rows of the call log on a contact's profile screen: who called whom,
 * audio or video, how it ended and for how long. No React, no Firebase, so plain Node can test it.
 *
 * A call document only says how the call stood when it was last written, and a phone that died or lost its signal never
 * writes the end. So a call that still says "ringing" long after it could ring is shown as missed rather than ringing forever.
 */

export type CallKind = 'audio' | 'video';

/** How a call ended, as the person looking at the log sees it. */
export type CallOutcome = 'answered' | 'missed' | 'declined' | 'cancelled' | 'ringing';

/** What the log needs from a call document, with the times in milliseconds (0 when not set). */
export interface CallRecord {
  id: string;
  callerId: string;
  calleeId: string;
  type: string;
  status: string;
  createdAtMs: number;
  answeredAtMs: number;
  endedAtMs: number;
}

export interface CallLogEntry {
  id: string;
  kind: CallKind;
  /** True when the person looking at the log placed the call. */
  outgoing: boolean;
  outcome: CallOutcome;
  /** When the call started (ms). */
  atMs: number;
  /** Seconds talked, only for an answered call that has an end time. */
  durationSec: number | null;
}

/** A call rings for 30 seconds; a "ringing" call older than this was never closed properly. */
export const RINGING_STALE_MS = 2 * 60 * 1000;

export function logEntry(call: CallRecord, myUid: string, now: number): CallLogEntry {
  const outgoing = call.callerId === myUid;
  let outcome: CallOutcome;
  switch (call.status) {
    case 'accepted':
    case 'ended':
      outcome = 'answered';
      break;
    case 'declined':
      outcome = 'declined';
      break;
    case 'cancelled':
      // The caller gave up before it was answered: the caller cancelled it, the person called missed it.
      outcome = outgoing ? 'cancelled' : 'missed';
      break;
    case 'ringing':
      outcome = call.createdAtMs > 0 && now - call.createdAtMs > RINGING_STALE_MS ? 'missed' : 'ringing';
      break;
    default:
      outcome = 'missed'; // 'missed', and anything a later version adds
  }
  const talked = call.endedAtMs - call.answeredAtMs;
  return {
    id: call.id,
    kind: call.type === 'video' ? 'video' : 'audio',
    outgoing,
    outcome,
    // A call whose start time the server has not filled in yet is the one that was just placed.
    atMs: call.createdAtMs || now,
    durationSec: outcome === 'answered' && call.answeredAtMs > 0 && talked >= 0 ? Math.round(talked / 1000) : null,
  };
}

/** Both directions merged, each call once, newest first. */
export function buildCallLog(records: readonly CallRecord[], myUid: string, now: number): CallLogEntry[] {
  const byId = new Map<string, CallRecord>();
  for (const record of records) byId.set(record.id, record);
  return Array.from(byId.values())
    .map((record) => logEntry(record, myUid, now))
    .sort((a, b) => b.atMs - a.atMs || (a.id < b.id ? -1 : 1));
}

/** "32 sec", "4 min 32 sec", "4 min", "1 hr 5 min". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  if (seconds < 3600) {
    const rest = seconds % 60;
    return rest ? `${minutes} min ${rest} sec` : `${minutes} min`;
  }
  const hours = Math.floor(seconds / 3600);
  const restMinutes = Math.floor((seconds % 3600) / 60);
  return restMinutes ? `${hours} hr ${restMinutes} min` : `${hours} hr`;
}

/** "Outgoing video call", "Incoming audio call". */
export const callTitle = (entry: CallLogEntry): string => `${entry.outgoing ? 'Outgoing' : 'Incoming'} ${entry.kind} call`;

/** How it ended: "Answered, 4 min 32 sec", "Missed", "No answer", "Declined", "Cancelled", "Ringing". */
export function callStatusText(entry: CallLogEntry): string {
  switch (entry.outcome) {
    case 'answered':
      return entry.durationSec === null ? 'Answered' : `Answered, ${formatDuration(entry.durationSec)}`;
    case 'missed':
      return entry.outgoing ? 'No answer' : 'Missed';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Ringing';
  }
}

/** A call the person did not get to answer: the one row that is drawn in the warning colour. */
export const isMissedIncoming = (entry: CallLogEntry): boolean => entry.outcome === 'missed' && !entry.outgoing;
