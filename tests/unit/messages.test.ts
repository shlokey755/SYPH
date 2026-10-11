import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reuseUnchanged, sameMessage } from '../../src/utils/messages.ts';

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
