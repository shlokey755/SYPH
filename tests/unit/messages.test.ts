import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reuseUnchanged, sameMessage, searchMessages } from '../../src/utils/messages.ts';
import { dayHeaders } from '../../src/utils/dateLabels.ts';

const ts = (ms) => ({ toMillis: () => ms });
const msg = (id, overrides = {}) => ({
  id,
  type: 'text',
  text: `hello ${id}`,
  senderId: 'alice',
  senderUsername: 'Alice',
  forwarded: false,
  deletedFor: [],
  deletedForEveryone: false,
  createdAt: ts(1000),
  pending: false,
  ...overrides,
});

describe('sameMessage', () => {
  it('is true for equal content even when the objects and timestamps are new', () => {
    assert.equal(sameMessage(msg('a'), msg('a')), true);
  });

  it('notices every field a bubble can show', () => {
    const base = msg('a');
    assert.equal(sameMessage(base, msg('a', { text: 'edited' })), false);
    assert.equal(sameMessage(base, msg('a', { pending: true })), false);
    assert.equal(sameMessage(base, msg('a', { deletedForEveryone: true })), false);
    assert.equal(sameMessage(base, msg('a', { forwarded: true })), false);
    assert.equal(sameMessage(base, msg('a', { senderUsername: 'Alicia' })), false);
    assert.equal(sameMessage(base, msg('a', { createdAt: ts(2000) })), false);
    assert.equal(sameMessage(base, msg('a', { deletedFor: ['bob'] })), false);
    assert.equal(sameMessage(base, msg('a', { media: { url: 'x' } })), false);
    assert.equal(sameMessage(base, msg('a', { replyTo: { messageId: 'z' } })), false);
  });

  it('compares media and reply previews by content', () => {
    const a = msg('a', { media: { url: 'x', size: 1 }, replyTo: { messageId: 'z' } });
    const b = msg('a', { media: { url: 'x', size: 1 }, replyTo: { messageId: 'z' } });
    assert.equal(sameMessage(a, b), true);
  });

  it('treats a still-pending timestamp (null) as equal to itself', () => {
    assert.equal(sameMessage(msg('a', { createdAt: null }), msg('a', { createdAt: null })), true);
  });
});

describe('reuseUnchanged', () => {
  it('returns the new list when there was no previous one', () => {
    const next = [msg('a')];
    assert.equal(reuseUnchanged([], next), next);
  });

  it('returns the previous array itself when nothing changed', () => {
    const previous = [msg('b'), msg('a')];
    assert.equal(reuseUnchanged(previous, [msg('b'), msg('a')]), previous);
  });

  it('reuses old objects for unchanged messages and takes the new one for a new message', () => {
    const previous = [msg('b'), msg('a')];
    const arrived = msg('c');
    const result = reuseUnchanged(previous, [arrived, msg('b'), msg('a')]);
    assert.equal(result.length, 3);
    assert.equal(result[0], arrived);
    assert.equal(result[1], previous[0]);
    assert.equal(result[2], previous[1]);
  });

  it('replaces only the message that changed (a send that has now been acknowledged)', () => {
    const previous = [msg('b', { pending: true }), msg('a')];
    const acked = msg('b', { pending: false });
    const result = reuseUnchanged(previous, [acked, msg('a')]);
    assert.equal(result[0], acked);
    assert.equal(result[1], previous[1]);
  });

  it('handles messages that disappeared', () => {
    const previous = [msg('b'), msg('a')];
    const result = reuseUnchanged(previous, [msg('a')]);
    assert.equal(result.length, 1);
    assert.equal(result[0], previous[1]);
  });

  it('follows the order of the new list', () => {
    const previous = [msg('b'), msg('a')];
    const result = reuseUnchanged(previous, [msg('a'), msg('b')]);
    assert.deepEqual(result.map((m) => m.id), ['a', 'b']);
    assert.notEqual(result, previous);
  });
});

describe('searchMessages', () => {
  const day = (d, h = 12) => new Date(2026, 10, d, h, 0).getTime();
  // Newest first, as the chat lists them: two on 5 Nov, one on 4 Nov, two on 2 Nov.
  const chat = [
    msg('a', { text: 'Dinner at 8?', createdAt: ts(day(5, 18)) }),
    msg('b', { text: 'ok', createdAt: ts(day(5, 9)) }),
    msg('c', { text: 'dinner was great', createdAt: ts(day(4)) }),
    msg('d', { text: 'Where is DINNER', createdAt: ts(day(2, 20)) }),
    msg('e', { text: 'dinner?', createdAt: ts(day(2, 8)) }),
  ];

  it('finds matches anywhere in the text, ignoring case, in the same order', () => {
    assert.deepEqual(searchMessages(chat, 'dinner').map((m) => m.id), ['a', 'c', 'd', 'e']);
    assert.deepEqual(searchMessages(chat, '  GREAT ').map((m) => m.id), ['c']);
  });

  it('matches everything for an empty search and nothing for a word that is not there', () => {
    assert.equal(searchMessages(chat, '').length, 5);
    assert.equal(searchMessages(chat, '   ').length, 5);
    assert.equal(searchMessages(chat, 'pizza').length, 0);
  });

  it('skips messages deleted for everyone', () => {
    const withDeleted = [...chat, msg('f', { text: 'dinner', deletedForEveryone: true })];
    assert.equal(searchMessages(withDeleted, 'dinner').some((m) => m.id === 'f'), false);
  });

  it('gives results that group by day: one chip per day that has a match, none for days without', () => {
    const results = searchMessages(chat, 'dinner');
    const now = day(6);
    const headers = dayHeaders(results.map((m) => m.createdAt.toMillis()), now);
    // The chip sits on the earliest match of each day (it is drawn above it): a (5 Nov), c (4 Nov), and e (2 Nov, the
    // earlier of the two matches that day). d is in the same group as e, so it has no chip.
    assert.deepEqual(headers, ['Yesterday', 'Wednesday, 4 Nov', null, 'Monday, 2 Nov']);
  });
});
