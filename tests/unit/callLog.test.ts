import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RINGING_STALE_MS,
  buildCallLog,
  callStatusText,
  callTitle,
  formatDuration,
  isMissedIncoming,
  logEntry,
  type CallRecord,
} from '../../src/utils/callLog.ts';

const NOW = Date.UTC(2026, 10, 26, 12, 0, 0);
const call = (patch: Partial<CallRecord> = {}): CallRecord => ({
  id: 'c1',
  callerId: 'me',
  calleeId: 'them',
  type: 'audio',
  status: 'ended',
  createdAtMs: NOW - 60_000,
  answeredAtMs: NOW - 55_000,
  endedAtMs: NOW - 25_000,
  ...patch,
});

describe('a call as a log row (logEntry)', () => {
  it('knows who placed it', () => {
    assert.equal(logEntry(call(), 'me', NOW).outgoing, true);
    assert.equal(logEntry(call(), 'them', NOW).outgoing, false);
  });

  it('keeps audio and video apart, and treats anything unknown as audio', () => {
    assert.equal(logEntry(call({ type: 'video' }), 'me', NOW).kind, 'video');
    assert.equal(logEntry(call({ type: 'audio' }), 'me', NOW).kind, 'audio');
    assert.equal(logEntry(call({ type: 'hologram' }), 'me', NOW).kind, 'audio');
  });

  it('an ended call is answered, with how long it lasted', () => {
    const entry = logEntry(call(), 'me', NOW);
    assert.equal(entry.outcome, 'answered');
    assert.equal(entry.durationSec, 30);
  });

  it('an accepted call with no end time is answered with no duration', () => {
    const entry = logEntry(call({ status: 'accepted', endedAtMs: 0 }), 'me', NOW);
    assert.equal(entry.outcome, 'answered');
    assert.equal(entry.durationSec, null);
  });

  it('gives no duration when the times do not add up', () => {
    assert.equal(logEntry(call({ answeredAtMs: 0 }), 'me', NOW).durationSec, null);
    assert.equal(logEntry(call({ endedAtMs: NOW - 100_000 }), 'me', NOW).durationSec, null);
  });

  it('declined stays declined for both sides', () => {
    assert.equal(logEntry(call({ status: 'declined' }), 'me', NOW).outcome, 'declined');
    assert.equal(logEntry(call({ status: 'declined' }), 'them', NOW).outcome, 'declined');
  });

  it('a call the caller cancelled is cancelled for the caller and missed for the other person', () => {
    assert.equal(logEntry(call({ status: 'cancelled' }), 'me', NOW).outcome, 'cancelled');
    assert.equal(logEntry(call({ status: 'cancelled' }), 'them', NOW).outcome, 'missed');
  });

  it('a missed call is missed', () => {
    assert.equal(logEntry(call({ status: 'missed' }), 'me', NOW).outcome, 'missed');
    assert.equal(logEntry(call({ status: 'something new' }), 'me', NOW).outcome, 'missed');
  });

  it('a call that is ringing now is ringing, and one that was never closed is missed', () => {
    assert.equal(logEntry(call({ status: 'ringing', createdAtMs: NOW - 5_000 }), 'them', NOW).outcome, 'ringing');
    assert.equal(logEntry(call({ status: 'ringing', createdAtMs: NOW - RINGING_STALE_MS - 1 }), 'them', NOW).outcome, 'missed');
  });

  it('a call whose start time is still being written is the one just placed', () => {
    const entry = logEntry(call({ status: 'ringing', createdAtMs: 0 }), 'me', NOW);
    assert.equal(entry.outcome, 'ringing');
    assert.equal(entry.atMs, NOW);
  });
});

describe('the whole log (buildCallLog)', () => {
  it('puts the newest call first', () => {
    const log = buildCallLog(
      [call({ id: 'old', createdAtMs: NOW - 3 * 86_400_000 }), call({ id: 'new', createdAtMs: NOW - 1000 }), call({ id: 'mid', createdAtMs: NOW - 86_400_000 })],
      'me',
      NOW
    );
    assert.deepEqual(log.map((entry) => entry.id), ['new', 'mid', 'old']);
  });

  it('mixes calls in both directions', () => {
    const log = buildCallLog(
      [call({ id: 'a', createdAtMs: NOW - 2000 }), call({ id: 'b', callerId: 'them', calleeId: 'me', createdAtMs: NOW - 1000 })],
      'me',
      NOW
    );
    assert.deepEqual(log.map((entry) => [entry.id, entry.outgoing]), [['b', false], ['a', true]]);
  });

  it('lists a call once even if both listeners reported it', () => {
    assert.equal(buildCallLog([call({ id: 'x' }), call({ id: 'x' })], 'me', NOW).length, 1);
  });

  it('is empty with no calls', () => {
    assert.deepEqual(buildCallLog([], 'me', NOW), []);
  });
});

describe('durations (formatDuration)', () => {
  it('writes seconds, minutes and hours', () => {
    assert.equal(formatDuration(0), '0 sec');
    assert.equal(formatDuration(32), '32 sec');
    assert.equal(formatDuration(60), '1 min');
    assert.equal(formatDuration(272), '4 min 32 sec');
    assert.equal(formatDuration(3600), '1 hr');
    assert.equal(formatDuration(3900), '1 hr 5 min');
  });

  it('copes with nonsense', () => {
    assert.equal(formatDuration(-5), '0 sec');
    assert.equal(formatDuration(Number.NaN), '0 sec');
    assert.equal(formatDuration(59.6), '1 min');
  });
});

describe('what a row says', () => {
  const entry = (patch: Partial<CallRecord>, me = 'me') => logEntry(call(patch), me, NOW);

  it('names the direction and the kind', () => {
    assert.equal(callTitle(entry({ type: 'video' })), 'Outgoing video call');
    assert.equal(callTitle(entry({ type: 'audio' }, 'them')), 'Incoming audio call');
  });

  it('says how it ended', () => {
    assert.equal(callStatusText(entry({})), 'Answered, 30 sec');
    assert.equal(callStatusText(entry({ status: 'accepted', endedAtMs: 0 })), 'Answered');
    assert.equal(callStatusText(entry({ status: 'missed' })), 'No answer');
    assert.equal(callStatusText(entry({ status: 'missed' }, 'them')), 'Missed');
    assert.equal(callStatusText(entry({ status: 'declined' })), 'Declined');
    assert.equal(callStatusText(entry({ status: 'cancelled' })), 'Cancelled');
    assert.equal(callStatusText(entry({ status: 'cancelled' }, 'them')), 'Missed');
    assert.equal(callStatusText(entry({ status: 'ringing', createdAtMs: NOW - 1000 })), 'Ringing');
  });

  it('only a call you did not get to answer is flagged', () => {
    assert.equal(isMissedIncoming(entry({ status: 'missed' }, 'them')), true);
    assert.equal(isMissedIncoming(entry({ status: 'cancelled' }, 'them')), true);
    assert.equal(isMissedIncoming(entry({ status: 'missed' })), false);
    assert.equal(isMissedIncoming(entry({ status: 'declined' }, 'them')), false);
  });
});
