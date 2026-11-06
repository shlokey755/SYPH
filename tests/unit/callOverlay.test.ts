import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FALLBACK_BUBBLE_COLOR,
  bubbleColor,
  bubbleWanted,
  incomingScreenWanted,
  overlayStatus,
  parseIncomingAction,
} from '../../src/utils/callOverlay.ts';

describe('what Accept / Decline sends back (parseIncomingAction)', () => {
  it('reads both actions and the call they are about', () => {
    assert.deepEqual(parseIncomingAction('accept:abc123'), { action: 'accept', key: 'abc123' });
    assert.deepEqual(parseIncomingAction('decline:abc123'), { action: 'decline', key: 'abc123' });
  });

  it('keeps colons inside the key (group rings are "group:<id>")', () => {
    assert.deepEqual(parseIncomingAction('accept:group:xyz'), { action: 'accept', key: 'group:xyz' });
  });

  it('says nothing when there was no press', () => {
    assert.equal(parseIncomingAction(''), null);
    assert.equal(parseIncomingAction(null), null);
    assert.equal(parseIncomingAction(undefined), null);
  });

  it('ignores anything it does not understand', () => {
    assert.equal(parseIncomingAction('hangup:abc'), null);
    assert.equal(parseIncomingAction('accept'), null);
    assert.equal(parseIncomingAction('accept:'), null);
    assert.equal(parseIncomingAction(':abc'), null);
    assert.equal(parseIncomingAction('Accept:abc'), null);
  });
});

describe('the call screen over other apps (incomingScreenWanted)', () => {
  it('shows for a ringing call while SYPH is in the background', () => {
    assert.equal(incomingScreenWanted('call-1', 'background'), true);
  });

  it('does not show with SYPH on screen, where the ring screen inside the app does the job', () => {
    assert.equal(incomingScreenWanted('call-1', 'active'), false);
  });

  it('does not flicker on while a shade or dialog briefly covers the app', () => {
    assert.equal(incomingScreenWanted('call-1', 'inactive'), false);
  });

  it('does not show when nothing is ringing', () => {
    assert.equal(incomingScreenWanted(null, 'background'), false);
  });
});

describe('the floating bubble (bubbleWanted)', () => {
  const running = { live: true, ended: false, movedTo: false, appState: 'background' };

  it('shows for a live call while SYPH is in the background', () => {
    assert.equal(bubbleWanted(running), true);
  });

  it('does not show with SYPH on screen, or while it is only briefly covered', () => {
    assert.equal(bubbleWanted({ ...running, appState: 'active' }), false);
    assert.equal(bubbleWanted({ ...running, appState: 'inactive' }), false);
  });

  it('does not show before the call is live, or once it has ended', () => {
    assert.equal(bubbleWanted({ ...running, live: false }), false);
    assert.equal(bubbleWanted({ ...running, ended: true }), false);
  });

  it('stays away while a 1-to-1 call is moving into a group call', () => {
    assert.equal(bubbleWanted({ ...running, movedTo: true }), false);
  });
});

describe('what the Me tab says about the permissions (overlayStatus)', () => {
  it('says "comes with the newest app" for both in a build without the native side', () => {
    assert.deepEqual(overlayStatus({ available: false, overApps: true, fullScreen: true }), {
      overApps: 'unavailable',
      fullScreen: 'unavailable',
    });
  });

  it('reports each permission by itself', () => {
    assert.deepEqual(overlayStatus({ available: true, overApps: true, fullScreen: false }), {
      overApps: 'granted',
      fullScreen: 'needed',
    });
    assert.deepEqual(overlayStatus({ available: true, overApps: false, fullScreen: true }), {
      overApps: 'needed',
      fullScreen: 'granted',
    });
  });
});

describe('bubble colour', () => {
  it('passes a colour Android can read', () => {
    assert.equal(bubbleColor('#00E5FF'), '#00E5FF');
    assert.equal(bubbleColor('#cc00e5ff'), '#cc00e5ff');
  });

  it('falls back to green for anything else', () => {
    for (const bad of ['red', '#fff', '00E5FF', '#GGGGGG', '', undefined, null]) {
      assert.equal(bubbleColor(bad as string | undefined), FALLBACK_BUBBLE_COLOR);
    }
  });
});
