import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CALLS_CHANNEL_ID,
  CALL_PUSH_TTL_SECONDS,
  MAX_MIRROR_MUTED,
  MAX_MIRROR_TOKENS,
  MESSAGES_CHANNEL_ID,
  allowsCallPush,
  allowsMessagePush,
  buildCallPushes,
  buildMessagePushes,
  chunk,
  isExpoPushToken,
  mirrorFromSettings,
  mirrorKey,
  parsePushMode,
  verifiedTokens,
} from '../../src/utils/push.ts';

const T = (n: string) => `ExponentPushToken[${n}]`;

describe('push mode', () => {
  it('defaults to client and accepts relay / off', () => {
    assert.equal(parsePushMode(undefined), 'client');
    assert.equal(parsePushMode(''), 'client');
    assert.equal(parsePushMode('nonsense'), 'client');
    assert.equal(parsePushMode(' Relay '), 'relay');
    assert.equal(parsePushMode('OFF'), 'off');
    assert.equal(parsePushMode('client'), 'client');
  });
});

describe('token validation', () => {
  it('accepts Expo tokens and rejects everything else', () => {
    assert.equal(isExpoPushToken(T('abc123')), true);
    assert.equal(isExpoPushToken('ExpoPushToken[xyz]'), true);
    assert.equal(isExpoPushToken('fcm-raw-token'), false);
    assert.equal(isExpoPushToken('ExponentPushToken[]'), false);
    assert.equal(isExpoPushToken('ExponentPushToken[a b]'), false);
    assert.equal(isExpoPushToken(undefined), false);
    assert.equal(isExpoPushToken(42), false);
  });
});

describe('mirror from private settings', () => {
  it('turns an empty settings document into "on, no devices, nothing muted"', () => {
    assert.deepEqual(mirrorFromSettings({}), { tokens: [], notificationsEnabled: true, mutedChats: [] });
  });

  it('only an explicit false switches notifications off', () => {
    assert.equal(mirrorFromSettings({ notificationsEnabled: false }).notificationsEnabled, false);
    assert.equal(mirrorFromSettings({ notificationsEnabled: true }).notificationsEnabled, true);
  });

  it('keeps the newest devices, drops junk and duplicates', () => {
    const tokens = ['junk', T('1'), T('2'), T('2'), T('3'), T('4'), T('5'), T('6'), T('7')];
    const mirror = mirrorFromSettings({ expoPushTokens: tokens });
    assert.equal(mirror.tokens.length, MAX_MIRROR_TOKENS);
    assert.deepEqual(mirror.tokens, [T('3'), T('4'), T('5'), T('6'), T('7')]);
  });

  it('caps muted chats and ignores empty ids', () => {
    const muted = Array.from({ length: MAX_MIRROR_MUTED + 10 }, (_, i) => `chat${i}`);
    const mirror = mirrorFromSettings({ mutedChats: ['', ...muted] });
    assert.equal(mirror.mutedChats.length, MAX_MIRROR_MUTED);
    assert.equal(mirror.mutedChats.at(-1), `chat${MAX_MIRROR_MUTED + 9}`);
    assert.equal(mirror.mutedChats.includes(''), false);
  });

  it('mirrorKey ignores ordering but notices real changes', () => {
    const a = mirrorFromSettings({ expoPushTokens: [T('1'), T('2')], mutedChats: ['x', 'y'] });
    const b = mirrorFromSettings({ expoPushTokens: [T('2'), T('1')], mutedChats: ['y', 'x'] });
    assert.equal(mirrorKey(a), mirrorKey(b));
    assert.notEqual(mirrorKey(a), mirrorKey(mirrorFromSettings({ expoPushTokens: [T('1')], mutedChats: ['x', 'y'] })));
    assert.notEqual(mirrorKey(a), mirrorKey({ ...a, notificationsEnabled: false }));
  });
});

describe('who gets notified', () => {
  const on = { notificationsEnabled: true, mutedChats: ['muted'] };

  it('messages respect the switch and the per-chat mute', () => {
    assert.equal(allowsMessagePush(on, 'open'), true);
    assert.equal(allowsMessagePush(on, 'muted'), false);
    assert.equal(allowsMessagePush({ ...on, notificationsEnabled: false }, 'open'), false);
  });

  it('calls ignore the chat mute but respect the switch', () => {
    assert.equal(allowsCallPush(on), true);
    assert.equal(allowsCallPush({ notificationsEnabled: false }), false);
  });

  it('only tokens the registry assigns to this user are used', () => {
    const owners = new Map<string, string | undefined>([
      [T('mine'), 'alice'],
      [T('moved'), 'bob'], // the phone now belongs to someone else
      [T('gone'), undefined], // no registry entry
    ]);
    assert.deepEqual(verifiedTokens('alice', [T('mine'), T('moved'), T('gone'), T('unknown'), 'junk', T('mine')], owners), [T('mine')]);
  });
});

describe('notification content', () => {
  it('direct message: sender is the title, preview is the body', () => {
    const [m] = buildMessagePushes({
      conversationId: 'a_b', isGroup: false, senderName: 'Alice', preview: 'hello there', tokens: [T('1')],
    });
    assert.equal(m.title, 'Alice');
    assert.equal(m.body, 'hello there');
    assert.equal(m.channelId, MESSAGES_CHANNEL_ID);
    assert.equal(m.priority, 'high');
    assert.deepEqual(m.data, { type: 'message', conversationId: 'a_b' });
    assert.equal(m.ttl, undefined);
  });

  it('group message: group name is the title, body names the sender', () => {
    const [m] = buildMessagePushes({
      conversationId: 'g1', isGroup: true, groupName: 'Hostel', senderName: 'Alice', preview: 'Photo', tokens: [T('1')],
    });
    assert.equal(m.title, 'Hostel');
    assert.equal(m.body, 'Alice: Photo');
  });

  it('falls back to sensible text when names or previews are blank', () => {
    const [m] = buildMessagePushes({ conversationId: 'g1', isGroup: true, senderName: ' ', preview: '', tokens: [T('1')] });
    assert.equal(m.title, 'Group');
    assert.equal(m.body, 'New message: New message');
  });

  it('one message per device', () => {
    const list = buildMessagePushes({ conversationId: 'c', isGroup: false, senderName: 'A', preview: 'x', tokens: [T('1'), T('2')] });
    assert.deepEqual(list.map((m) => m.to), [T('1'), T('2')]);
  });

  it('call push rings on the calls channel and expires quickly', () => {
    const [m] = buildCallPushes({ callId: 'call9', conversationId: 'a_b', callerName: 'Alice', type: 'video', tokens: [T('1')] });
    assert.equal(m.title, 'Alice');
    assert.equal(m.body, 'Incoming video call');
    assert.equal(m.channelId, CALLS_CHANNEL_ID);
    assert.equal(m.ttl, CALL_PUSH_TTL_SECONDS);
    assert.deepEqual(m.data, { type: 'call', conversationId: 'a_b', callId: 'call9' });
    assert.equal(buildCallPushes({ callId: 'c', conversationId: 'x', callerName: '', type: 'audio', tokens: [T('1')] })[0].body, 'Incoming voice call');
  });
});

describe('batching', () => {
  it('splits into groups of at most 100', () => {
    const groups = chunk(Array.from({ length: 250 }, (_, i) => i));
    assert.deepEqual(groups.map((g) => g.length), [100, 100, 50]);
    assert.deepEqual(chunk([]), []);
  });
});
