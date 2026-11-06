import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  shouldCaptureSwipe,
  SWIPE_ICON_FULL_AT,
  SWIPE_MAX,
  SWIPE_START,
  SWIPE_TRIGGER,
  swipeOffset,
  swipeProgress,
  swipeTriggers,
} from '../../src/utils/swipeReply.ts';

describe('shouldCaptureSwipe', () => {
  it('claims a clear swipe to the right', () => {
    assert.equal(shouldCaptureSwipe(30, 4), true);
    assert.equal(shouldCaptureSwipe(SWIPE_START + 1, 0), true);
  });

  it('leaves small movements alone, so taps and long-presses still work', () => {
    assert.equal(shouldCaptureSwipe(0, 0), false);
    assert.equal(shouldCaptureSwipe(SWIPE_START, 0), false);
    assert.equal(shouldCaptureSwipe(5, 1), false);
  });

  it('leaves scrolling to the list (mostly up or down, even if a little to the right)', () => {
    assert.equal(shouldCaptureSwipe(30, 40), false);
    assert.equal(shouldCaptureSwipe(30, -40), false);
    assert.equal(shouldCaptureSwipe(30, 20), false); // not clearly sideways: needs dx > 2 * |dy|
  });

  it('ignores swipes to the left', () => {
    assert.equal(shouldCaptureSwipe(-40, 0), false);
  });
});

describe('swipeOffset', () => {
  it('follows the finger a little less than 1:1 and never goes left', () => {
    assert.equal(swipeOffset(0), 0);
    assert.equal(swipeOffset(-50), 0);
    assert.ok(swipeOffset(40) > 0 && swipeOffset(40) < 40);
  });

  it('stops at the maximum', () => {
    assert.equal(swipeOffset(1000), SWIPE_MAX);
    assert.ok(swipeOffset(SWIPE_TRIGGER) <= SWIPE_MAX);
  });

  it('only ever grows as the finger moves further', () => {
    let last = -1;
    for (let dx = -20; dx <= 300; dx += 10) {
      const now = swipeOffset(dx);
      assert.ok(now >= last);
      last = now;
    }
  });
});

describe('swipeTriggers', () => {
  it('replies only past the trigger distance', () => {
    assert.equal(swipeTriggers(SWIPE_TRIGGER - 1), false);
    assert.equal(swipeTriggers(SWIPE_TRIGGER), true);
    assert.equal(swipeTriggers(500), true);
    assert.equal(swipeTriggers(-100), false);
  });

  it('can be reached before the message hits its maximum', () => {
    assert.ok(swipeOffset(SWIPE_TRIGGER) < SWIPE_MAX);
  });
});

describe('swipeProgress', () => {
  it('goes from 0 to 1 and stays inside that range', () => {
    assert.equal(swipeProgress(0), 0);
    assert.equal(swipeProgress(-5), 0);
    assert.equal(swipeProgress(SWIPE_ICON_FULL_AT), 1);
    assert.equal(swipeProgress(SWIPE_MAX * 2), 1);
    assert.ok(swipeProgress(SWIPE_ICON_FULL_AT / 2) > 0.4 && swipeProgress(SWIPE_ICON_FULL_AT / 2) < 0.6);
  });

  it('is full exactly when letting go would reply', () => {
    assert.equal(swipeProgress(swipeOffset(SWIPE_TRIGGER)), 1);
  });
});
