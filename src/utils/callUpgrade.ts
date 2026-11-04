/**
 * callUpgrade.ts
 * Pure rules for adding people to a running 1-to-1 call (FR-06). No React, no Firebase: unit tested with plain Node.
 *
 * A 1-to-1 call cannot take a third person, so "Add people" turns it into a group call:
 *   1. the person who pressed "Add" creates a small group chat with everyone (the two on the call plus the new people)
 *   2. they end the 1-to-1 call and write the group chat's id on it (`movedTo`)
 *   3. the other person sees `movedTo` and follows; both start the group call in that chat (the first one to start it
 *      marks the chat "in a call", the other joins it) and the added people get the usual group-call ring.
 * Mixed-up timing is fine: whoever starts the group call first wins, see startOrJoinPointer in groupCallService.ts.
 */

import type { CallStatus } from '../types';

/** Everyone already on a 1-to-1 call. */
export const PEOPLE_ON_DIRECT_CALL = 2;

/** How many more people can be added, given the most people a call of this kind can hold (6 voice, 4 video). */
export const maxAddable = (maxParticipants: number): number => Math.max(0, Math.floor(maxParticipants) - PEOPLE_ON_DIRECT_CALL);

export interface Candidate {
  uid: string;
  username: string;
}

/** Search results without yourself, the person you are talking to, and people already picked. */
export function addableResults<T extends { uid: string }>(results: readonly T[], excludeUids: readonly string[]): T[] {
  const skip = new Set(excludeUids);
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const result of results) {
    if (skip.has(result.uid) || seen.has(result.uid)) continue;
    seen.add(result.uid);
    kept.push(result);
  }
  return kept;
}

export type PickOutcome = 'added' | 'removed' | 'full';

/** Picking someone again takes them off the list; once the limit is reached further people are refused. */
export function togglePick<T extends { uid: string }>(
  picked: readonly T[],
  person: T,
  limit: number
): { picked: T[]; outcome: PickOutcome } {
  if (picked.some((p) => p.uid === person.uid)) {
    return { picked: picked.filter((p) => p.uid !== person.uid), outcome: 'removed' };
  }
  if (picked.length >= limit) return { picked: [...picked], outcome: 'full' };
  return { picked: [...picked, person], outcome: 'added' };
}

/** "You can add 2 more" / "Call is full" line under the search box. */
export function limitText(picked: number, limit: number): string {
  const left = Math.max(0, limit - picked);
  if (limit <= 0) return 'This call is full';
  if (left === 0) return `Call is full (${limit} added)`;
  return left === 1 ? 'You can add 1 more person' : `You can add ${left} more people`;
}

const MAX_NAME_LENGTH = 40;

/** Name of the new group chat: the usernames of everyone, shortened when they do not fit. */
export function upgradeGroupName(usernames: readonly string[]): string {
  const names = usernames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return 'Group call';
  const joined = names.join(', ');
  return joined.length <= MAX_NAME_LENGTH ? joined : `${joined.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…`;
}

/** The group chat a finished 1-to-1 call moved to, or null when it simply ended. */
export function movedConversationId(call: { status: CallStatus; movedTo?: unknown } | null | undefined): string | null {
  if (!call || call.status !== 'ended') return null;
  return typeof call.movedTo === 'string' && call.movedTo.length > 0 ? call.movedTo : null;
}
