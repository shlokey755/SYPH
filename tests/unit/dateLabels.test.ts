import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayHeaders, dayLabel, dayLabelsEach, floatingDayLabel } from '../../src/utils/dateLabels.ts';

// Wednesday 4 November 2026, 3 pm, in whatever time zone the test runs in (dates are built from local parts).
const NOW = new Date(2026, 10, 4, 15, 0).getTime();
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('day label', () => {
  it('says Today and Yesterday', () => {
    assert.equal(dayLabel(at(2026, 11, 4, 0, 1), NOW), 'Today');
    assert.equal(dayLabel(at(2026, 11, 4, 14, 59), NOW), 'Today');
    assert.equal(dayLabel(at(2026, 11, 3, 23, 59), NOW), 'Yesterday');
    assert.equal(dayLabel(at(2026, 11, 3, 0, 0), NOW), 'Yesterday');
  });

  it('uses the weekday and date for older days', () => {
    assert.equal(dayLabel(at(2026, 11, 2), NOW), 'Monday, 2 Nov');
    assert.equal(dayLabel(at(2026, 10, 31), NOW), 'Saturday, 31 Oct');
    assert.equal(dayLabel(at(2026, 1, 1), NOW), 'Thursday, 1 Jan');
  });

  it('adds the year when it is not this year', () => {
    assert.equal(dayLabel(at(2025, 12, 25), NOW), 'Thursday, 25 Dec 2025');
  });

  it('treats a time slightly in the future (clock skew) as today', () => {
    assert.equal(dayLabel(at(2026, 11, 5, 0, 5), NOW), 'Today');
  });

  it('uses the local midnight, not 24 hours', () => {
    const lateNow = at(2026, 11, 4, 0, 10);
    assert.equal(dayLabel(at(2026, 11, 3, 23, 50), lateNow), 'Yesterday');
  });
});

describe('day headers for a chat (newest first)', () => {
  it('puts a label above the first message of each day only', () => {
    const times = [
      at(2026, 11, 4, 14), // today, newest
      at(2026, 11, 4, 9), //  today
      at(2026, 11, 3, 22), // yesterday
      at(2026, 11, 3, 8), //  yesterday
      at(2026, 10, 31, 20), // earlier
    ];
    // The oldest message of a day carries the label, because the list is drawn upside down and the label sits above it.
    assert.deepEqual(dayHeaders(times, NOW), [null, 'Today', null, 'Yesterday', 'Saturday, 31 Oct']);
  });

  it('labels a single message', () => {
    assert.deepEqual(dayHeaders([at(2026, 11, 4, 8)], NOW), ['Today']);
  });

  it('has nothing for an empty chat', () => {
    assert.deepEqual(dayHeaders([], NOW), []);
  });

  it('counts a message that is still sending (time 0) as today', () => {
    assert.deepEqual(dayHeaders([0, at(2026, 11, 4, 9), at(2026, 11, 3, 9)], NOW), [null, 'Today', 'Yesterday']);
    assert.deepEqual(dayHeaders([0, at(2026, 11, 3, 9)], NOW), ['Today', 'Yesterday']);
  });

  it('splits a conversation across midnight', () => {
    const times = [at(2026, 11, 4, 0, 10), at(2026, 11, 3, 23, 50)];
    assert.deepEqual(dayHeaders(times, NOW), ['Today', 'Yesterday']);
  });
});

describe('every message\'s day', () => {
  it('names the day of each message, newest first', () => {
    const times = [at(2026, 11, 4, 14), at(2026, 11, 4, 9), at(2026, 11, 3, 22), at(2026, 10, 31, 8)];
    assert.deepEqual(dayLabelsEach(times, NOW), ['Today', 'Today', 'Yesterday', 'Saturday, 31 Oct']);
  });

  it('counts a message still being sent (time 0) as today', () => {
    assert.deepEqual(dayLabelsEach([0, at(2026, 11, 3)], NOW), ['Today', 'Yesterday']);
  });

  it('is empty for no messages', () => {
    assert.deepEqual(dayLabelsEach([], NOW), []);
  });
});

describe('floating day chip', () => {
  const labels = ['Today', 'Today', 'Yesterday', 'Yesterday', 'Saturday, 31 Oct'];

  it('shows the day of the oldest message on screen (the highest index)', () => {
    assert.equal(floatingDayLabel([0, 1, 2], labels), 'Yesterday');
    assert.equal(floatingDayLabel([2, 1, 0], labels), 'Yesterday');
    assert.equal(floatingDayLabel([0, 1], labels), 'Today');
    assert.equal(floatingDayLabel([4], labels), 'Saturday, 31 Oct');
  });

  it('is null when nothing is on screen', () => {
    assert.equal(floatingDayLabel([], labels), null);
    assert.equal(floatingDayLabel([0], []), null);
  });

  it('ignores indexes that are not in the list', () => {
    assert.equal(floatingDayLabel([1, 99, -1, NaN], labels), 'Today');
  });
});
