import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CALLS_CHANNEL_ID,
  CALL_PUSH_MAX_AGE_MS,
  CALL_PUSH_TTL_SECONDS,
  MESSAGES_CHANNEL_ID,
  addedMembers,
  allowsCallNotification,
  allowsNotification,
  buildCallPush,
  buildGroupAddedPush,
  buildMessagePush,
  createDeduper,
  recipientsOf,
  shouldAnnounceCall,
  splitTokensByOwner,
  storedTokens,
  toMillis,
} from '../src/notify.js';

const direct = {
  isGroup: false,
  participantIds: ['alice', 'bob'],
  lastMessage: 'see you at 6',
  lastMessageSenderId: 'alice',
  lastMessageSenderName: 'Alice',
};

const group = {
  isGroup: true,
  groupName: 'Weekend plans',
  createdBy: 'alice',
  participantIds: ['alice', 'bob', 'carol'],
  participants: [
    { uid: 'alice', username: 'Alice' },
    { uid: 'bob', username: 'Bob' },
    { uid: 'carol', username: 'Carol' },
  ],
  lastMessage: 'Photo',
  lastMessageSenderId: 'bob',
  lastMessageSenderName: 'Bob',
};

describe('toMillis', () => {
  it('reads Firestore timestamps, dates and missing values', () => {
    assert.equal(toMillis({ toMillis: () => 1234 }), 1234);
    assert.equal(toMillis(new Date(5000)), 5000);
    assert.equal(toMillis(null), 0);
    assert.equal(toMillis(undefined), 0);
    assert.equal(toMillis({}), 0);
  });
});

describe('recipientsOf', () => {
  it('excludes the sender', () => {
    assert.deepEqual(recipientsOf(direct), ['bob']);
    assert.deepEqual(recipientsOf(group), ['alice', 'carol']);
  });
  it('tolerates missing fields', () => {
    assert.deepEqual(recipientsOf({}), []);
    assert.deepEqual(recipientsOf({ participantIds: ['a', 'b'] }), ['a', 'b']);
  });
});

describe('addedMembers', () => {
  it('returns only new members', () => {
    assert.deepEqual(addedMembers(['a', 'b'], ['a', 'b', 'c', 'd']), ['c', 'd']);
  });
  it('returns nothing when members were only removed or unchanged', () => {
    assert.deepEqual(addedMembers(['a', 'b', 'c'], ['a', 'b']), []);
    assert.deepEqual(addedMembers(['a'], ['a']), []);
  });
  it('treats a missing previous list as all new', () => {
    assert.deepEqual(addedMembers(undefined, ['a']), ['a']);
  });
});

describe('allowsNotification', () => {
  it('defaults to on for users with no settings document', () => {
    assert.equal(allowsNotification(undefined, 'c1'), true);
    assert.equal(allowsNotification({}, 'c1'), true);
  });
  it('honours the account-wide switch', () => {
    assert.equal(allowsNotification({ notificationsEnabled: false }, 'c1'), false);
    assert.equal(allowsNotification({ notificationsEnabled: true }, 'c1'), true);
  });
  it('honours per-chat mute without affecting other chats', () => {
    const settings = { mutedChats: ['c1'] };
    assert.equal(allowsNotification(settings, 'c1'), false);
    assert.equal(allowsNotification(settings, 'c2'), true);
  });
});

describe('storedTokens', () => {
  it('keeps unique non-empty strings only', () => {
    assert.deepEqual(storedTokens({ expoPushTokens: ['a', 'a', '', 5, null, 'b'] }), ['a', 'b']);
    assert.deepEqual(storedTokens(undefined), []);
    assert.deepEqual(storedTokens({ expoPushTokens: 'nope' }), []);
  });
});

describe('splitTokensByOwner', () => {
  it('sends to tokens owned by the user, drops tokens another account claimed, skips unverified ones', () => {
    const owners = new Map([
      ['mine', 'alice'],
      ['moved', 'bob'],
    ]);
    const { send, stale } = splitTokensByOwner('alice', ['mine', 'moved', 'unknown'], owners);
    assert.deepEqual(send, ['mine']);
    assert.deepEqual(stale, ['moved']);
  });
});

describe('createDeduper', () => {
  it('announces each message time once and ignores older or empty ones', () => {
    const d = createDeduper();
    assert.equal(d.isNew('c1', 100), true);
    assert.equal(d.isNew('c1', 100), false); // same event again (e.g. read receipt update)
    assert.equal(d.isNew('c1', 90), false); // older
    assert.equal(d.isNew('c1', 101), true);
    assert.equal(d.isNew('c2', 100), true); // independent per conversation
    assert.equal(d.isNew('c3', 0), false);
  });
});

describe('buildMessagePush', () => {
  it('titles a direct chat with the sender and uses the stored preview', () => {
    const [m] = buildMessagePush({ conversationId: 'alice_bob', conversation: direct, tokens: ['T1'] });
    assert.equal(m.to, 'T1');
    assert.equal(m.title, 'Alice');
    assert.equal(m.body, 'see you at 6');
    assert.equal(m.channelId, MESSAGES_CHANNEL_ID);
    assert.equal(m.priority, 'high');
    assert.equal(m.threadId, 'alice_bob');
    assert.deepEqual(m.data, { type: 'message', conversationId: 'alice_bob' });
  });

  it('titles a group with its name and prefixes the sender', () => {
    const [m] = buildMessagePush({ conversationId: 'g1', conversation: group, tokens: ['T1'] });
    assert.equal(m.title, 'Weekend plans');
    assert.equal(m.body, 'Bob: Photo');
  });

  it('hides the content when previews are turned off', () => {
    const [m] = buildMessagePush({ conversationId: 'g1', conversation: group, tokens: ['T1'], hidePreview: true });
    assert.equal(m.title, 'Weekend plans');
    assert.equal(m.body, 'New message');
  });

  it('makes one message per token', () => {
    const out = buildMessagePush({ conversationId: 'c', conversation: direct, tokens: ['A', 'B', 'C'] });
    assert.deepEqual(out.map((m) => m.to), ['A', 'B', 'C']);
  });

  it('has sensible fallbacks for sparse documents', () => {
    const [m] = buildMessagePush({ conversationId: 'c', conversation: { isGroup: true }, tokens: ['T'] });
    assert.equal(m.title, 'Group');
    assert.equal(m.body, 'New message: New message');
  });
});

describe('buildGroupAddedPush', () => {
  it('names the creator and the group, and opens that group when tapped', () => {
    const [m] = buildGroupAddedPush({ conversationId: 'g1', conversation: group, tokens: ['T1'] });
    assert.equal(m.title, 'Weekend plans');
    assert.equal(m.body, 'Alice added you to the group');
    assert.deepEqual(m.data, { type: 'group', conversationId: 'g1' });
  });
  it('falls back when the creator is not in the participant list', () => {
    const [m] = buildGroupAddedPush({
      conversationId: 'g1',
      conversation: { ...group, createdBy: 'ghost' },
      tokens: ['T1'],
    });
    assert.equal(m.body, 'Someone added you to the group');
  });
});

describe('allowsCallNotification', () => {
  it('is on unless the account-wide switch is off', () => {
    assert.equal(allowsCallNotification(undefined), true);
    assert.equal(allowsCallNotification({}), true);
    assert.equal(allowsCallNotification({ notificationsEnabled: true }), true);
    assert.equal(allowsCallNotification({ notificationsEnabled: false }), false);
  });

  it('ignores chat mute, unlike messages', () => {
    const settings = { mutedChats: ['alice_bob'] };
    assert.equal(allowsNotification(settings, 'alice_bob'), false);
    assert.equal(allowsCallNotification(settings), true);
  });
});

describe('shouldAnnounceCall', () => {
  const startedAtMs = 1_000_000;
  const nowMs = startedAtMs + 10_000;
  const ringing = (overrides = {}) => ({
    status: 'ringing',
    createdAt: { toMillis: () => startedAtMs + 5_000 },
    ...overrides,
  });
  const ctx = () => ({ startedAtMs, nowMs, seenIds: new Set() });

  it('announces a fresh ringing call once', () => {
    const c = ctx();
    assert.equal(shouldAnnounceCall(ringing(), 'call1', c), true);
    assert.equal(shouldAnnounceCall(ringing(), 'call1', c), false);
    assert.equal(shouldAnnounceCall(ringing(), 'call2', c), true);
  });

  it('skips calls that are no longer ringing', () => {
    for (const status of ['accepted', 'declined', 'cancelled', 'missed', 'ended']) {
      assert.equal(shouldAnnounceCall(ringing({ status }), 'x', ctx()), false, status);
    }
  });

  it('skips calls created before the relay started', () => {
    const old = ringing({ createdAt: { toMillis: () => startedAtMs - 1 } });
    assert.equal(shouldAnnounceCall(old, 'x', ctx()), false);
  });

  it('skips calls that are too old to still be ringing', () => {
    const c = { startedAtMs, nowMs: startedAtMs + 5_000 + CALL_PUSH_MAX_AGE_MS + 1, seenIds: new Set() };
    assert.equal(shouldAnnounceCall(ringing(), 'x', c), false);
  });

  it('skips calls with no resolved createdAt or no document', () => {
    assert.equal(shouldAnnounceCall(ringing({ createdAt: null }), 'x', ctx()), false);
    assert.equal(shouldAnnounceCall(undefined, 'x', ctx()), false);
  });

  it('does not remember calls it declined to announce', () => {
    const c = ctx();
    assert.equal(shouldAnnounceCall(ringing({ status: 'declined' }), 'x', c), false);
    assert.equal(c.seenIds.has('x'), false);
  });
});

describe('buildCallPush', () => {
  const call = {
    callerId: 'alice',
    callerName: 'Alice',
    calleeId: 'bob',
    conversationId: 'alice_bob',
    type: 'video',
  };

  it('builds one high-priority call notification per token', () => {
    const [first, second] = buildCallPush({ callId: 'c1', call, tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'] });
    assert.equal(first.to, 'ExponentPushToken[a]');
    assert.equal(second.to, 'ExponentPushToken[b]');
    assert.equal(first.title, 'Alice');
    assert.equal(first.body, 'Incoming video call');
    assert.equal(first.priority, 'high');
    assert.equal(first.channelId, CALLS_CHANNEL_ID);
    assert.notEqual(first.channelId, MESSAGES_CHANNEL_ID);
    assert.equal(first.ttl, CALL_PUSH_TTL_SECONDS);
  });

  it('carries what the app needs to open the right place', () => {
    const [msg] = buildCallPush({ callId: 'c1', call, tokens: ['t'] });
    assert.deepEqual(msg.data, { type: 'call', conversationId: 'alice_bob', callId: 'c1' });
    assert.equal(msg.threadId, 'alice_bob');
  });

  it('words voice calls differently and tolerates a missing caller name', () => {
    const [msg] = buildCallPush({ callId: 'c1', call: { ...call, type: 'audio', callerName: '' }, tokens: ['t'] });
    assert.equal(msg.body, 'Incoming voice call');
    assert.equal(msg.title, 'Someone');
  });

  it('returns nothing when there are no tokens', () => {
    assert.deepEqual(buildCallPush({ callId: 'c1', call, tokens: [] }), []);
  });
});
