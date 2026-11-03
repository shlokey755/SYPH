import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTIVE_CALL_ID,
  CALL_ROUTE,
  ENDED_LINGER_MS,
  callDeepLink,
  callNotificationInfo,
  cameraAction,
  classifyCallRequest,
  clampBubble,
  clockStart,
  isCallRoute,
  snapBubbleToEdge,
} from '../../src/utils/callBackground.ts';

const direct = (callId: string | null, conversationId: string | null = 'c1') =>
  ({ kind: 'direct', callId, conversationId }) as const;
const group = (conversationId: string, callId: string | null = null) => ({ kind: 'group', callId, conversationId }) as const;

describe('one call at a time (classifyCallRequest)', () => {
  it('starts when nothing is running', () => {
    assert.equal(classifyCallRequest(null, false, direct(null)), 'start');
    assert.equal(classifyCallRequest(null, false, group('g1')), 'start');
  });

  it('starts a new call once the running one has ended', () => {
    assert.equal(classifyCallRequest(direct('a'), true, direct('b')), 'start');
    assert.equal(classifyCallRequest(group('g1'), true, group('g2')), 'start');
  });

  it('attaches to the same direct call, by id', () => {
    assert.equal(classifyCallRequest(direct('a'), false, direct('a')), 'attach');
  });

  it('is busy for a different direct call, and for placing a second call', () => {
    assert.equal(classifyCallRequest(direct('a'), false, direct('b')), 'busy');
    assert.equal(classifyCallRequest(direct('a'), false, direct(null)), 'busy');
    // An outgoing call has no id yet, so a new request cannot be matched to it: show the running call instead.
    assert.equal(classifyCallRequest(direct(null), false, direct(null)), 'busy');
  });

  it('attaches to the same group, by chat, whatever the call id says', () => {
    assert.equal(classifyCallRequest(group('g1'), false, group('g1')), 'attach');
    assert.equal(classifyCallRequest(group('g1', 'x'), false, group('g1', 'y')), 'attach');
  });

  it('is busy for another group', () => {
    assert.equal(classifyCallRequest(group('g1'), false, group('g2')), 'busy');
  });

  it('is busy when a group call is asked for during a direct call, and the other way round', () => {
    assert.equal(classifyCallRequest(direct('a'), false, group('g1')), 'busy');
    assert.equal(classifyCallRequest(group('g1'), false, direct('a')), 'busy');
  });
});

describe('routes', () => {
  it('"active" routes exist for both call types and match the screens', () => {
    assert.equal(ACTIVE_CALL_ID, 'active');
    assert.equal(CALL_ROUTE.direct, `/call/${ACTIVE_CALL_ID}`);
    assert.equal(CALL_ROUTE.group, `/group-call/${ACTIVE_CALL_ID}`);
  });

  it('the notification link uses the app scheme with an empty host', () => {
    assert.equal(callDeepLink('direct'), 'syph:///call/active');
    assert.equal(callDeepLink('group'), 'syph:///group-call/active');
  });

  it('recognises the call screens', () => {
    assert.equal(isCallRoute(['call', '[id]']), true);
    assert.equal(isCallRoute(['group-call', '[id]']), true);
    assert.equal(isCallRoute(['chat', '[id]']), false);
    assert.equal(isCallRoute(['(tabs)']), false);
    assert.equal(isCallRoute([]), false);
  });
});

describe('ongoing call notification text', () => {
  it('names the other person and the kind of call', () => {
    const live = callNotificationInfo({ kind: 'direct', type: 'audio', name: 'Asha', stage: 'live' });
    assert.equal(live.title, 'Asha');
    assert.equal(live.text, 'Voice call in progress · Tap to return');
    assert.equal(live.route, 'syph:///call/active');
    assert.equal(
      callNotificationInfo({ kind: 'direct', type: 'video', name: 'Asha', stage: 'live' }).text,
      'Video call in progress · Tap to return'
    );
  });

  it('says what stage a call that is not live yet is in', () => {
    assert.equal(
      callNotificationInfo({ kind: 'direct', type: 'audio', name: 'Asha', stage: 'ringing' }).text,
      'Ringing… · Tap to return'
    );
    assert.equal(
      callNotificationInfo({ kind: 'direct', type: 'video', name: 'Asha', stage: 'starting' }).text,
      'Starting video call… · Tap to return'
    );
  });

  it('labels group calls and sends them to the group call screen', () => {
    const info = callNotificationInfo({ kind: 'group', type: 'video', name: 'Hostel gang', stage: 'live' });
    assert.equal(info.title, 'Hostel gang');
    assert.equal(info.text, 'Group video call in progress · Tap to return');
    assert.equal(info.route, 'syph:///group-call/active');
  });

  it('never leaves the title empty', () => {
    assert.equal(callNotificationInfo({ kind: 'direct', type: 'audio', name: '  ', stage: 'live' }).title, 'SYPH call');
    assert.equal(callNotificationInfo({ kind: 'group', type: 'audio', name: '', stage: 'live' }).title, 'Group call');
  });
});

describe('notification clock', () => {
  it('starts from the moment the call went live, and not at all before that', () => {
    assert.equal(clockStart('live', 90, 1_000_000), 1_000_000 - 90_000);
    assert.equal(clockStart('live', 0, 1_000_000), 1_000_000);
    assert.equal(clockStart('ringing', 5, 1_000_000), 0);
    assert.equal(clockStart('starting', 0, 1_000_000), 0);
  });

  it('ignores a negative second count', () => {
    assert.equal(clockStart('live', -3, 1_000_000), 1_000_000);
  });
});

describe('camera follows the app (cameraAction)', () => {
  it('turns the camera off when a video call goes to the background', () => {
    assert.equal(cameraAction({ appState: 'background', isVideo: true, cameraOff: false, autoOff: false }), 'off');
  });

  it('turns it back on, but only if the app is the one that turned it off', () => {
    assert.equal(cameraAction({ appState: 'active', isVideo: true, cameraOff: true, autoOff: true }), 'on');
    assert.equal(cameraAction({ appState: 'active', isVideo: true, cameraOff: true, autoOff: false }), null);
  });

  it('leaves a camera the person already turned off alone, both ways', () => {
    assert.equal(cameraAction({ appState: 'background', isVideo: true, cameraOff: true, autoOff: false }), null);
  });

  it('does nothing for a voice call', () => {
    assert.equal(cameraAction({ appState: 'background', isVideo: false, cameraOff: false, autoOff: false }), null);
    assert.equal(cameraAction({ appState: 'active', isVideo: false, cameraOff: true, autoOff: true }), null);
  });

  it('ignores states that are not really leaving or returning', () => {
    for (const appState of ['inactive', 'unknown', 'extension'] as const) {
      assert.equal(cameraAction({ appState, isVideo: true, cameraOff: false, autoOff: false }), null);
    }
  });

  it('does not switch the camera on if someone already did', () => {
    assert.equal(cameraAction({ appState: 'active', isVideo: true, cameraOff: false, autoOff: true }), null);
  });
});

describe('return-to-call bubble position', () => {
  const screen = { width: 400, height: 800 };
  const bubble = { width: 68, height: 56 };
  const margin = { top: 40, bottom: 72 };

  it('keeps the bubble on screen', () => {
    assert.deepEqual(clampBubble({ x: -50, y: -50 }, screen, bubble, margin), { x: 0, y: 40 });
    assert.deepEqual(clampBubble({ x: 999, y: 999 }, screen, bubble, margin), { x: 332, y: 672 });
    assert.deepEqual(clampBubble({ x: 100, y: 300 }, screen, bubble, margin), { x: 100, y: 300 });
  });

  it('survives a screen smaller than the bubble and its margins', () => {
    const tiny = clampBubble({ x: 10, y: 10 }, { width: 50, height: 80 }, bubble, margin);
    assert.equal(tiny.x, 0);
    assert.equal(tiny.y, 40);
  });

  it('settles against the nearer side edge', () => {
    assert.deepEqual(snapBubbleToEdge({ x: 20, y: 300 }, screen, bubble), { x: 8, y: 300 });
    assert.deepEqual(snapBubbleToEdge({ x: 300, y: 300 }, screen, bubble), { x: 324, y: 300 });
    // Exactly the middle goes left; either is fine as long as it is one of the edges.
    const middle = snapBubbleToEdge({ x: 166, y: 100 }, screen, bubble);
    assert.ok(middle.x === 8 || middle.x === 324);
  });
});

describe('ended calls', () => {
  it('stay registered long enough to read the closing message, but not for ever', () => {
    assert.ok(ENDED_LINGER_MS >= 2_500);
    assert.ok(ENDED_LINGER_MS <= 10_000);
  });
});
