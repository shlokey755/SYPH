import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RING_TIMEOUT_MS,
  STALE_RING_MS,
  allowedNextStatuses,
  canTransition,
  endReasonFromStatus,
  endReasonText,
  formatCallClock,
  isRingingFresh,
  isTerminalStatus,
} from '../../src/utils/call.ts';

describe('call status moves (must mirror firestore.rules validCallMove)', () => {
  it('callee can answer or decline a ringing call, caller cannot', () => {
    assert.deepEqual(allowedNextStatuses('callee', 'ringing'), ['accepted', 'declined']);
    assert.equal(canTransition('caller', 'ringing', 'accepted'), false);
    assert.equal(canTransition('caller', 'ringing', 'declined'), false);
  });

  it('caller can cancel or mark missed, callee cannot', () => {
    assert.deepEqual(allowedNextStatuses('caller', 'ringing'), ['cancelled', 'missed']);
    assert.equal(canTransition('callee', 'ringing', 'cancelled'), false);
    assert.equal(canTransition('callee', 'ringing', 'missed'), false);
  });

  it('either side can end an answered call, and only an answered call', () => {
    assert.equal(canTransition('caller', 'accepted', 'ended'), true);
    assert.equal(canTransition('callee', 'accepted', 'ended'), true);
    assert.equal(canTransition('caller', 'ringing', 'ended'), false);
    assert.equal(canTransition('callee', 'accepted', 'declined'), false);
  });

  it('finished calls cannot move again', () => {
    for (const status of ['declined', 'cancelled', 'missed', 'ended'] as const) {
      assert.equal(isTerminalStatus(status), true);
      assert.deepEqual(allowedNextStatuses('caller', status), []);
      assert.deepEqual(allowedNextStatuses('callee', status), []);
    }
    assert.equal(isTerminalStatus('ringing'), false);
    assert.equal(isTerminalStatus('accepted'), false);
  });
});

describe('ringing freshness', () => {
  const now = 1_000_000_000;

  it('rings for a recent call', () => {
    assert.equal(isRingingFresh(now - 5_000, now), true);
    assert.equal(isRingingFresh(now - STALE_RING_MS, now), true);
  });

  it('ignores an abandoned call', () => {
    assert.equal(isRingingFresh(now - STALE_RING_MS - 1, now), false);
  });

  it('treats an unresolved server timestamp as brand new', () => {
    assert.equal(isRingingFresh(0, now), true);
  });

  it('keeps the ring timeout shorter than the stale window', () => {
    assert.ok(RING_TIMEOUT_MS < STALE_RING_MS);
  });
});

describe('end reasons', () => {
  it('words the same outcome differently for caller and callee', () => {
    assert.equal(endReasonText('declined', true), 'Call declined');
    assert.equal(endReasonText('declined', false), 'You declined the call');
    assert.equal(endReasonText('missed', true), 'No answer');
    assert.equal(endReasonText('missed', false), 'Missed call');
    assert.equal(endReasonText('cancelled', false), 'Missed call');
  });

  it('maps finished statuses to a reason', () => {
    assert.equal(endReasonFromStatus('declined'), 'declined');
    assert.equal(endReasonFromStatus('cancelled'), 'cancelled');
    assert.equal(endReasonFromStatus('missed'), 'missed');
    assert.equal(endReasonFromStatus('ended'), 'ended');
  });
});

describe('formatCallClock', () => {
  it('formats minutes and seconds', () => {
    assert.equal(formatCallClock(0), '00:00');
    assert.equal(formatCallClock(9), '00:09');
    assert.equal(formatCallClock(75), '01:15');
  });

  it('adds hours past an hour', () => {
    assert.equal(formatCallClock(3725), '1:02:05');
  });

  it('never goes negative or shows fractions', () => {
    assert.equal(formatCallClock(-5), '00:00');
    assert.equal(formatCallClock(59.9), '00:59');
  });
});
