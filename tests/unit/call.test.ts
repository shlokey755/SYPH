import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RING_TIMEOUT_MS,
  STALE_RING_MS,
  allowedNextStatuses,
  defaultSpeakerOn,
  callTiles,
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

describe('defaultSpeakerOn', () => {
  it('starts video calls on the speaker and voice calls on the earpiece', () => {
    assert.equal(defaultSpeakerOn('video'), true);
    assert.equal(defaultSpeakerOn('audio'), false);
  });
});

describe('video tiles (camera off must never leave a frozen frame)', () => {
  const live = { isVideo: true, ended: false, hasLocalStream: true, cameraOff: false, hasRemoteVideo: true, remoteCameraOff: false };

  it('both cameras on: live video both ways', () => {
    assert.deepEqual(callTiles(live), { remote: 'video', local: 'video' });
  });

  it('their camera off: their video is replaced by the panel', () => {
    assert.deepEqual(callTiles({ ...live, remoteCameraOff: true }), { remote: 'panel', local: 'video' });
  });

  it('my camera off: my preview becomes a panel with my username instead of disappearing', () => {
    assert.deepEqual(callTiles({ ...live, cameraOff: true }), { remote: 'video', local: 'panel' });
  });

  it('both off: panels on both tiles', () => {
    assert.deepEqual(callTiles({ ...live, cameraOff: true, remoteCameraOff: true }), { remote: 'panel', local: 'panel' });
  });

  it('no remote video yet (still connecting): panel until it arrives', () => {
    assert.equal(callTiles({ ...live, hasRemoteVideo: false }).remote, 'panel');
  });

  it('no local stream yet: no preview', () => {
    assert.equal(callTiles({ ...live, hasLocalStream: false }).local, 'none');
  });

  it('voice calls never show a preview or remote video', () => {
    assert.deepEqual(callTiles({ ...live, isVideo: false }), { remote: 'panel', local: 'none' });
  });

  it('after the call ends nothing is drawn', () => {
    assert.deepEqual(callTiles({ ...live, ended: true }), { remote: 'panel', local: 'none' });
  });
});
