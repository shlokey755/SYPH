import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TYPING_EXPIRE_MS,
  TYPING_FIRST_SEEN_MAX_AGE_MS,
  TYPING_SEND_INTERVAL_MS,
  createTypingTracker,
  nextTypingAction,
  typingLabel,
} from '../../src/utils/typing.ts';

describe('what the typing person sends', () => {
  const idle = { typing: false, lastSentAt: 0 };

  it('starts on the first character and ignores an empty or blank box', () => {
    assert.equal(nextTypingAction('h', idle, 1000), 'start');
    assert.equal(nextTypingAction('', idle, 1000), 'none');
    assert.equal(nextTypingAction('   ', idle, 1000), 'none');
  });

  it('refreshes only once the send interval has passed', () => {
    const typing = { typing: true, lastSentAt: 10_000 };
    assert.equal(nextTypingAction('hel', typing, 10_000 + TYPING_SEND_INTERVAL_MS - 1), 'none');
    assert.equal(nextTypingAction('hell', typing, 10_000 + TYPING_SEND_INTERVAL_MS), 'refresh');
  });

  it('stops when the box is cleared', () => {
    assert.equal(nextTypingAction('', { typing: true, lastSentAt: 5 }, 6), 'stop');
    assert.equal(nextTypingAction('  ', { typing: true, lastSentAt: 5 }, 6), 'stop');
  });

  it('the expiry is longer than the refresh interval, so a steady typist never flickers', () => {
    assert.ok(TYPING_EXPIRE_MS > TYPING_SEND_INTERVAL_MS * 1.5);
  });
});

describe('who is typing', () => {
  const doc = (uid: string, atMillis: number, typing = true) => ({ uid, typing, atMillis });

  it('shows a fresh marker and drops it when it expires', () => {
    const tracker = createTypingTracker();
    tracker.update([doc('bob', 99_000)], 100_000);
    assert.deepEqual(tracker.active(100_000), ['bob']);
    assert.deepEqual(tracker.active(100_000 + TYPING_EXPIRE_MS - 1), ['bob']);
    assert.deepEqual(tracker.active(100_000 + TYPING_EXPIRE_MS), []);
  });

  it('a new write from the same person extends it', () => {
    const tracker = createTypingTracker();
    tracker.update([doc('bob', 99_000)], 100_000);
    tracker.update([doc('bob', 102_000)], 103_000); // refreshed
    assert.deepEqual(tracker.active(103_000 + TYPING_EXPIRE_MS - 1), ['bob']);
  });

  it('the same snapshot seen again does not extend it', () => {
    const tracker = createTypingTracker();
    tracker.update([doc('bob', 99_000)], 100_000);
    tracker.update([doc('bob', 99_000)], 104_000); // unrelated change elsewhere, same marker
    assert.deepEqual(tracker.active(100_000 + TYPING_EXPIRE_MS), []);
  });

  it('a deleted or false marker clears at once', () => {
    const tracker = createTypingTracker();
    tracker.update([doc('bob', 99_000)], 100_000);
    tracker.update([], 101_000);
    assert.deepEqual(tracker.active(101_000), []);
    tracker.update([doc('bob', 101_500)], 102_000);
    tracker.update([doc('bob', 102_000, false)], 102_500);
    assert.deepEqual(tracker.active(102_500), []);
  });

  it('ignores a stale marker that was already there when the screen opened', () => {
    const tracker = createTypingTracker();
    tracker.update([doc('bob', 100_000 - TYPING_FIRST_SEEN_MAX_AGE_MS - 1)], 100_000);
    assert.deepEqual(tracker.active(100_000), []);
    // ...but if that person starts typing again the marker changes and they show.
    tracker.update([doc('bob', 100_500)], 101_000);
    assert.deepEqual(tracker.active(101_000), ['bob']);
  });

  it('a marker with no server time yet is not trusted on first sight', () => {
    const tracker = createTypingTracker();
    tracker.update([doc('bob', 0)], 100_000);
    assert.deepEqual(tracker.active(100_000), []);
  });

  it('tracks several people in the order they started', () => {
    const tracker = createTypingTracker();
    tracker.update([doc('bob', 99_500)], 100_000);
    tracker.update([doc('bob', 99_500), doc('carol', 100_400)], 100_500);
    assert.deepEqual(tracker.active(100_500), ['bob', 'carol']);
  });

  it('reports when to look again', () => {
    const tracker = createTypingTracker();
    assert.equal(tracker.nextExpiryIn(0), null);
    tracker.update([doc('bob', 99_000)], 100_000);
    assert.equal(tracker.nextExpiryIn(102_000), TYPING_EXPIRE_MS - 2000);
    assert.equal(tracker.nextExpiryIn(100_000 + TYPING_EXPIRE_MS), null);
  });

  it('reset forgets everyone', () => {
    const tracker = createTypingTracker();
    tracker.update([doc('bob', 99_000)], 100_000);
    tracker.reset();
    assert.deepEqual(tracker.active(100_000), []);
  });
});

describe('typing label', () => {
  it('direct chats just say typing', () => {
    assert.equal(typingLabel(['Bob'], false), 'typing…');
    assert.equal(typingLabel([], false), '');
  });

  it('group chats name people, then count', () => {
    assert.equal(typingLabel(['Bob'], true), 'Bob is typing…');
    assert.equal(typingLabel(['Bob', 'Carol'], true), 'Bob and Carol are typing…');
    assert.equal(typingLabel(['Bob', 'Carol', 'Dan'], true), '3 people are typing…');
    assert.equal(typingLabel([], true), '');
  });
});
