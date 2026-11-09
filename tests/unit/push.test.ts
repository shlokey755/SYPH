import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CALLS_CHANNEL_ID,
  CALL_PUSH_TTL_SECONDS,
  DEFAULT_ACCOUNT_ALERTS,
  DEFAULT_ROUTE,
  MAX_MIRROR_MUTED,
  MAX_MIRROR_TOKENS,
  MESSAGES_CHANNEL_ID,
  MESSAGE_CHANNEL_SPECS,
  MESSAGE_TONE_FILES,
  MESSAGE_TONE_IDS,
  MISSED_CALL_PUSH_TTL_SECONDS,
  RINGTONE_IDS,
  allowsCallPush,
  allowsMessagePush,
  buildCallEndedPushes,
  buildCallPushes,
  buildGroupCallPushes,
  buildMessagePushes,
  buildMissedCallPushes,
  chunk,
  isExpoPushToken,
  messageChannelId,
  missedCallText,
  mirrorFromSettings,
  mirrorKey,
  normalizeAccountAlerts,
  parsePushMode,
  routeFor,
  routeOfTokens,
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
    assert.deepEqual(mirrorFromSettings({}), {
      tokens: [],
      notificationsEnabled: true,
      mutedChats: [],
      alerts: DEFAULT_ACCOUNT_ALERTS,
      alertTokens: [],
    });
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

  it('missed-call push uses the messages channel, not the ringtone one, and keeps for a day', () => {
    const [m] = buildMissedCallPushes({ callId: 'call9', conversationId: 'a_b', callerName: 'Alice', type: 'video', tokens: [T('1')] });
    assert.equal(m.title, 'Alice');
    assert.equal(m.body, 'Missed video call');
    assert.equal(m.channelId, MESSAGES_CHANNEL_ID);
    assert.equal(m.ttl, MISSED_CALL_PUSH_TTL_SECONDS);
    assert.ok(MISSED_CALL_PUSH_TTL_SECONDS >= 3600);
    // tapping it opens the chat (the app reads conversationId); the type tells it apart from a ring
    assert.deepEqual(m.data, { type: 'missed-call', conversationId: 'a_b', callId: 'call9' });
    assert.equal(buildMissedCallPushes({ callId: 'c', conversationId: 'x', callerName: ' ', type: 'audio', tokens: [T('1')] })[0].title, 'Someone');
    assert.equal(buildMissedCallPushes({ callId: 'c', conversationId: 'x', callerName: 'A', type: 'audio', tokens: [T('1'), T('2')] }).length, 2);
    assert.equal(missedCallText('audio'), 'Missed voice call');
  });
});

describe('batching', () => {
  it('splits into groups of at most 100', () => {
    const groups = chunk(Array.from({ length: 250 }, (_, i) => i));
    assert.deepEqual(groups.map((g) => g.length), [100, 100, 50]);
    assert.deepEqual(chunk([]), []);
  });
});

describe('group call push', () => {
  it('names the group, says who started it, rings on the calls channel for 45 s', async () => {
    const { buildGroupCallPushes, GROUP_CALL_PUSH_TTL_SECONDS } = await import('../../src/utils/push.ts');
    const [m, n] = buildGroupCallPushes({
      callId: 'call7', conversationId: 'g1', groupName: 'Hostel', callerName: 'Alice', type: 'video', tokens: [T('1'), T('2')],
    });
    assert.equal(m.title, 'Hostel');
    assert.equal(m.body, 'Alice started a video call');
    assert.equal(m.channelId, CALLS_CHANNEL_ID);
    assert.equal(m.ttl, GROUP_CALL_PUSH_TTL_SECONDS);
    assert.equal(m.ttl, 45);
    assert.deepEqual(m.data, { type: 'call', conversationId: 'g1', callId: 'call7' });
    assert.equal(n.to, T('2'));
  });

  it('falls back to sensible text and says "voice" for audio', async () => {
    const { buildGroupCallPushes } = await import('../../src/utils/push.ts');
    const [m] = buildGroupCallPushes({ callId: 'c', conversationId: 'g', callerName: ' ', type: 'audio', tokens: [T('1')] });
    assert.equal(m.title, 'Group');
    assert.equal(m.body, 'Someone started a voice call');
  });
});

describe('alerts while SYPH is closed', () => {
  const alerts = { messageTone: 'pop', ringtone: 'phone', vibrate: false } as const;

  it('reads saved choices and falls back to the defaults for anything unknown', () => {
    assert.deepEqual(normalizeAccountAlerts(undefined), DEFAULT_ACCOUNT_ALERTS);
    assert.deepEqual(normalizeAccountAlerts({ messageTone: 'drop', ringtone: 'phone', vibrate: false }), {
      messageTone: 'drop',
      ringtone: 'phone',
      vibrate: false,
    });
    assert.deepEqual(normalizeAccountAlerts({ messageTone: 'bell', ringtone: 3, vibrate: 'no' }), DEFAULT_ACCOUNT_ALERTS);
  });

  it('has one message channel per tone and vibration choice, each with a sound file unless silent', () => {
    assert.equal(MESSAGE_CHANNEL_SPECS.length, MESSAGE_TONE_IDS.length * 2);
    assert.equal(new Set(MESSAGE_CHANNEL_SPECS.map((spec) => spec.id)).size, MESSAGE_CHANNEL_SPECS.length);
    assert.equal(messageChannelId('pop', true), 'messages_pop_buzz');
    assert.equal(messageChannelId('off', false), 'messages_off_quiet');
    for (const spec of MESSAGE_CHANNEL_SPECS) {
      const tone = MESSAGE_TONE_IDS.find((id) => spec.id.startsWith(`messages_${id}_`));
      assert.ok(tone, spec.id);
      assert.equal(spec.sound, tone === 'off' ? null : MESSAGE_TONE_FILES[tone as 'syph' | 'pop' | 'drop']);
      assert.equal(spec.vibrate, spec.id.endsWith('_buzz'));
    }
  });

  it('offers the same tones and ringtones as the settings screen', async () => {
    const prefs = await import('../../src/utils/alertPrefs.ts');
    assert.deepEqual([...MESSAGE_TONE_IDS], prefs.MESSAGE_TONES.map((tone: { id: string }) => tone.id));
    assert.deepEqual([...RINGTONE_IDS], prefs.RINGTONES.map((tone: { id: string }) => tone.id));
  });

  it('keeps alert devices only when they are also registered devices', () => {
    const mirror = mirrorFromSettings({
      expoPushTokens: [T('1'), T('2')],
      closedAlertTokens: [T('2'), T('gone'), T('2')],
      alerts,
    });
    assert.deepEqual(mirror.alertTokens, [T('2')]);
    assert.deepEqual(mirror.alerts, alerts);
  });

  it('mirrorKey notices a changed tone, ringtone, vibration or alert device', () => {
    const base = mirrorFromSettings({ expoPushTokens: [T('1')], closedAlertTokens: [T('1')] });
    assert.notEqual(mirrorKey(base), mirrorKey(mirrorFromSettings({ expoPushTokens: [T('1')], closedAlertTokens: [T('1')], alerts })));
    assert.notEqual(mirrorKey(base), mirrorKey(mirrorFromSettings({ expoPushTokens: [T('1')] })));
  });

  it('routes only devices that registered as able to; the rest keep the original channels', () => {
    const target = { alerts, alertTokens: [T('new')] };
    assert.deepEqual(routeFor(target, T('old')), DEFAULT_ROUTE);
    assert.deepEqual(routeFor(target, T('new')), {
      messageChannel: 'messages_pop_quiet',
      closedAlerts: true,
      ringtone: 'phone',
      vibrate: false,
    });
    assert.equal(DEFAULT_ROUTE.messageChannel, MESSAGES_CHANNEL_ID);
    assert.equal(DEFAULT_ROUTE.closedAlerts, false);
  });

  it('looks up the devices of several people at once and tolerates missing targets', () => {
    const routeOf = routeOfTokens([
      { tokens: [T('a')], alertTokens: [T('a')], alerts },
      null,
      { tokens: [T('b')], alertTokens: [], alerts },
      undefined,
    ]);
    assert.equal(routeOf(T('a')).messageChannel, 'messages_pop_quiet');
    assert.deepEqual(routeOf(T('b')), DEFAULT_ROUTE);
    assert.deepEqual(routeOf(T('unknown')), DEFAULT_ROUTE);
  });

  it('puts a message on the channel of the receiving device', () => {
    const routeOf = routeOfTokens([{ tokens: [T('new'), T('old')], alertTokens: [T('new')], alerts }]);
    const [onNew, onOld] = buildMessagePushes({
      conversationId: 'c1',
      isGroup: false,
      senderName: 'Alice',
      preview: 'hi',
      tokens: [T('new'), T('old')],
      routeOf,
    });
    assert.equal(onNew.channelId, 'messages_pop_quiet');
    assert.equal(onOld.channelId, MESSAGES_CHANNEL_ID);
  });

  it('adds the ringtone to a call only for devices that can ring while closed', () => {
    const routeOf = routeOfTokens([{ tokens: [T('new'), T('old')], alertTokens: [T('new')], alerts }]);
    const input = { callId: 'k1', conversationId: 'c1', callerName: 'Alice', type: 'video' as const, tokens: [T('new'), T('old')], routeOf };
    const [onNew, onOld] = buildCallPushes(input);
    assert.deepEqual(onNew.data, { type: 'call', conversationId: 'c1', callId: 'k1', ringtone: 'phone', vibrate: '0' });
    assert.deepEqual(onOld.data, { type: 'call', conversationId: 'c1', callId: 'k1' });
    assert.equal(onNew.channelId, CALLS_CHANNEL_ID);

    const [groupOnNew, groupOnOld] = buildGroupCallPushes({ ...input, groupName: 'Team' });
    assert.deepEqual(groupOnNew.data, {
      type: 'call',
      conversationId: 'c1',
      callId: 'k1',
      ringtone: 'phone',
      vibrate: '0',
      group: '1',
    });
    assert.equal(groupOnOld.data.ringtone, undefined);
  });

  it('a call push without routes is the original payload', () => {
    const [push] = buildCallPushes({ callId: 'k1', conversationId: 'c1', callerName: 'Alice', type: 'audio', tokens: [T('1')] });
    assert.deepEqual(push.data, { type: 'call', conversationId: 'c1', callId: 'k1' });
  });

  it('the call-ended push is silent and carries only the call id', () => {
    const [push] = buildCallEndedPushes({ callId: 'k1', tokens: [T('1')] });
    assert.equal(push.title, undefined);
    assert.equal(push.body, undefined);
    assert.equal(push.sound, undefined);
    assert.equal(push.priority, 'high');
    assert.equal(push.ttl, CALL_PUSH_TTL_SECONDS);
    assert.deepEqual(push.data, { type: 'call-ended', callId: 'k1' });
  });

  it('a missed call uses the receiving device\'s message channel', () => {
    const routeOf = routeOfTokens([{ tokens: [T('new')], alertTokens: [T('new')], alerts }]);
    const [push] = buildMissedCallPushes({ callId: 'k1', conversationId: 'c1', callerName: 'A', type: 'audio', tokens: [T('new')], routeOf });
    assert.equal(push.channelId, 'messages_pop_quiet');
  });
});
