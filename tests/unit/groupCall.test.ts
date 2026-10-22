import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_PARTICIPANTS,
  PEER_EXPIRE_MS,
  PEER_FIRST_SEEN_MAX_AGE_MS,
  POINTER_FRESH_MS,
  RING_WINDOW_MS,
  callHeadline,
  canJoin,
  createPresenceTracker,
  gridLayout,
  isCallLive,
  participantCountLabel,
  shouldRing,
  type PeerDoc,
} from '../../src/utils/groupCall.ts';

const call = (over = {}) => ({
  id: 'c1', type: 'audio' as const, startedBy: 'alice', startedByName: 'Alice', startedAt: 1_000_000, beat: 1_000_000, ...over,
});
const peer = (uid: string, over: Partial<PeerDoc> = {}): PeerDoc => ({
  uid, sid: `${uid}-s1`, username: uid, joinedAtMs: 1000, lastSeenMs: 1000, cameraOff: false, muted: false, ...over,
});

describe('group call limits', () => {
  it('video is capped lower than audio', () => {
    assert.equal(MAX_PARTICIPANTS.audio, 6);
    assert.equal(MAX_PARTICIPANTS.video, 4);
  });

  it('canJoin counts you plus the others already there', () => {
    assert.equal(canJoin('video', 3), true); // you would be the 4th
    assert.equal(canJoin('video', 4), false);
    assert.equal(canJoin('audio', 5), true);
    assert.equal(canJoin('audio', 6), false);
  });
});

describe('call in progress and ringing', () => {
  const t0 = 1_000_000;

  it('a call is live while its beat is fresh', () => {
    assert.equal(isCallLive(call(), t0 + POINTER_FRESH_MS), true);
    assert.equal(isCallLive(call(), t0 + POINTER_FRESH_MS + 1), false);
    assert.equal(isCallLive(null, t0), false);
    assert.equal(isCallLive(undefined, t0), false);
  });

  it('rings others only during the first seconds', () => {
    assert.equal(shouldRing(call(), 'bob', t0 + 1000, false), true);
    assert.equal(shouldRing(call(), 'bob', t0 + RING_WINDOW_MS, false), true);
    assert.equal(shouldRing(call(), 'bob', t0 + RING_WINDOW_MS + 1, false), false);
  });

  it('never rings the person who started it, or someone who already dealt with it', () => {
    assert.equal(shouldRing(call(), 'alice', t0 + 1000, false), false);
    assert.equal(shouldRing(call(), 'bob', t0 + 1000, true), false);
  });

  it('never rings a dead call', () => {
    assert.equal(shouldRing(call({ beat: t0 - 500_000, startedAt: t0 }), 'bob', t0 + 1000, false), false);
    assert.equal(shouldRing(undefined, 'bob', t0, false), false);
  });
});

describe('presence tracker', () => {
  it('lists people oldest join first, ties by uid', () => {
    const tracker = createPresenceTracker();
    tracker.update([peer('zed', { joinedAtMs: 5 }), peer('amy', { joinedAtMs: 5 }), peer('bob', { joinedAtMs: 2 })], 10_000);
    assert.deepEqual(tracker.present(10_000).map((p) => p.uid), ['bob', 'amy', 'zed']);
  });

  it('someone who stops refreshing drops out after PEER_EXPIRE_MS on the viewer clock', () => {
    const tracker = createPresenceTracker();
    tracker.update([peer('bob', { lastSeenMs: 100 })], 10_000);
    assert.equal(tracker.present(10_000 + PEER_EXPIRE_MS - 1).length, 1);
    assert.equal(tracker.present(10_000 + PEER_EXPIRE_MS).length, 0);
  });

  it('a refresh keeps them in the call', () => {
    const tracker = createPresenceTracker();
    tracker.update([peer('bob', { lastSeenMs: 100 })], 10_000);
    tracker.update([peer('bob', { lastSeenMs: 200 })], 10_000 + 30_000);
    assert.equal(tracker.present(10_000 + 30_000 + PEER_EXPIRE_MS - 1).length, 1);
  });

  it('an unchanged snapshot does not extend their time', () => {
    const tracker = createPresenceTracker();
    tracker.update([peer('bob', { lastSeenMs: 100 })], 10_000);
    tracker.update([peer('bob', { lastSeenMs: 100 })], 10_000 + 30_000);
    assert.equal(tracker.present(10_000 + PEER_EXPIRE_MS).length, 0);
  });

  it('a deleted document means they left', () => {
    const tracker = createPresenceTracker();
    tracker.update([peer('bob'), peer('cat')], 10_000);
    tracker.update([peer('cat')], 11_000);
    assert.deepEqual(tracker.present(11_000).map((p) => p.uid), ['cat']);
  });

  it('a leftover document from long ago does not count as present', () => {
    const tracker = createPresenceTracker();
    tracker.update([peer('ghost', { lastSeenMs: 1 })], PEER_FIRST_SEEN_MAX_AGE_MS + 10_000);
    assert.equal(tracker.present(PEER_FIRST_SEEN_MAX_AGE_MS + 10_000).length, 0);
  });

  it('a rejoin with a new session counts as fresh again', () => {
    const tracker = createPresenceTracker();
    tracker.update([peer('bob', { sid: 'a', lastSeenMs: 100 })], 10_000);
    tracker.update([peer('bob', { sid: 'b', lastSeenMs: 100 })], 10_000 + PEER_EXPIRE_MS + 5_000);
    assert.equal(tracker.present(10_000 + PEER_EXPIRE_MS + 5_000).length, 1);
    assert.equal(tracker.present(10_000 + PEER_EXPIRE_MS + 5_000)[0].sid, 'b');
  });

  it('an unresolved server time (0) counts as fresh', () => {
    const tracker = createPresenceTracker();
    tracker.update([peer('me', { lastSeenMs: 0, joinedAtMs: 0 })], 50_000);
    assert.equal(tracker.present(50_000).length, 1);
  });

  it('says when the next person would expire, or null', () => {
    const tracker = createPresenceTracker();
    assert.equal(tracker.nextExpiryIn(0), null);
    tracker.update([peer('bob', { lastSeenMs: 1 })], 10_000);
    assert.equal(tracker.nextExpiryIn(10_000 + 1_000), PEER_EXPIRE_MS - 1_000);
    tracker.reset();
    assert.equal(tracker.nextExpiryIn(10_000), null);
  });
});

describe('layout and wording', () => {
  it('grid: one fills the screen, two stack, more make two columns', () => {
    assert.deepEqual(gridLayout(1), { columns: 1, rows: 1 });
    assert.deepEqual(gridLayout(2), { columns: 1, rows: 2 });
    assert.deepEqual(gridLayout(3), { columns: 2, rows: 2 });
    assert.deepEqual(gridLayout(4), { columns: 2, rows: 2 });
    assert.deepEqual(gridLayout(5), { columns: 2, rows: 3 });
    assert.deepEqual(gridLayout(6), { columns: 2, rows: 3 });
    assert.deepEqual(gridLayout(0), { columns: 1, rows: 1 });
  });

  it('headline and count label', () => {
    assert.equal(callHeadline(call()), 'Alice started a voice call');
    assert.equal(callHeadline(call({ type: 'video' })), 'Alice started a video call');
    assert.equal(callHeadline(call({ startedByName: ' ' })), 'Someone started a voice call');
    assert.equal(participantCountLabel(0), 'Waiting for others');
    assert.equal(participantCountLabel(1), '1 person in the call');
    assert.equal(participantCountLabel(3), '3 people in the call');
  });
});
