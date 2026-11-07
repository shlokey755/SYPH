import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendReadLog,
  cleanReadLog,
  isHollow,
  latestSentId,
  MAX_QUEUE_AVATARS,
  MAX_READ_LOG,
  queueSplit,
  readByList,
  readTimeOf,
  receiptsFor,
  showsQueue,
  statusIcon,
} from '../../src/utils/receipts.ts';

const t = (ms: number) => ({ toMillis: () => ms });
const SENT = 1_000_000;
const msg = (extra = {}) => ({ senderId: 'me', createdAt: t(SENT), ...extra });
const ids = ['me', 'a', 'b', 'c'];

describe('1-to-1 chat', () => {
  const pair = ['me', 'a'];

  it('is sent until the other phone has it', () => {
    assert.equal(receiptsFor(msg(), pair, {}).state, 'sent');
    assert.equal(receiptsFor(msg(), pair, { a: { deliveredAt: t(SENT - 1) } }).state, 'sent');
  });

  it('is delivered once their phone has it', () => {
    assert.equal(receiptsFor(msg(), pair, { a: { deliveredAt: t(SENT) } }).state, 'delivered');
  });

  it('is seen (hollow) once they have read it, with no half-way state', () => {
    const r = receiptsFor(msg(), pair, { a: { deliveredAt: t(SENT + 5), readAt: t(SENT + 5) } });
    assert.equal(r.state, 'seen');
    assert.deepEqual(r.readers.map((x) => x.uid), ['a']);
  });
});

describe('group chat', () => {
  it('is sent, then delivered only when everyone\'s phone has it', () => {
    assert.equal(receiptsFor(msg(), ids, {}).state, 'sent');
    const two = { a: { deliveredAt: t(SENT) }, b: { deliveredAt: t(SENT) } };
    assert.equal(receiptsFor(msg(), ids, two).state, 'sent');
    const all = { ...two, c: { deliveredAt: t(SENT) } };
    assert.equal(receiptsFor(msg(), ids, all).state, 'delivered');
  });

  it('shows the avatar queue while some have seen it', () => {
    const r = receiptsFor(msg(), ids, { a: { readAt: t(SENT + 10) }, b: { deliveredAt: t(SENT) } });
    assert.equal(r.state, 'partial');
    assert.deepEqual(r.readers.map((x) => x.uid), ['a']);
    assert.equal(r.recipients, 3);
  });

  it('goes hollow only when everyone has seen it', () => {
    const rs = { a: { readAt: t(SENT + 10) }, b: { readAt: t(SENT + 20) }, c: { readAt: t(SENT + 30) } };
    const r = receiptsFor(msg(), ids, rs);
    assert.equal(r.state, 'seen');
    assert.deepEqual(r.readers.map((x) => x.uid), ['a', 'b', 'c']);
  });

  it('never lists the sender among the readers', () => {
    const rs = { me: { readAt: t(SENT + 1) }, a: { readAt: t(SENT + 2) } };
    const r = receiptsFor(msg(), ids, rs);
    assert.equal(r.readers.some((x) => x.uid === 'me'), false);
  });

  it('only counts people who are still members', () => {
    // c has left: the other two seeing it is everyone.
    const r = receiptsFor(msg(), ['me', 'a', 'b'], { a: { readAt: t(SENT) }, b: { readAt: t(SENT) }, c: { readAt: t(SENT) } });
    assert.equal(r.state, 'seen');
    assert.equal(r.readers.length, 2);
  });

  it('does not count someone whose last read was before the message', () => {
    const r = receiptsFor(msg(), ids, { a: { readAt: t(SENT - 1) } });
    assert.equal(r.state, 'sent');
  });
});

describe('special states', () => {
  it('is pending while the write has not reached the server, and failed when it was refused', () => {
    assert.equal(receiptsFor(msg({ pending: true }), ids, {}).state, 'pending');
    assert.equal(receiptsFor(msg({ failed: true }), ids, {}).state, 'failed');
    assert.equal(receiptsFor(msg({ failed: true, pending: true }), ids, {}).state, 'failed');
  });

  it('is sent when there is nobody else, or no send time yet', () => {
    assert.equal(receiptsFor(msg(), ['me'], {}).state, 'sent');
    assert.equal(receiptsFor(msg({ createdAt: null }), ids, {}).state, 'sent');
    assert.equal(receiptsFor(msg(), undefined, undefined).state, 'sent');
  });
});

describe('what shows with each state', () => {
  it('has the icon in the bubble only before anyone has seen it', () => {
    assert.equal(statusIcon('pending'), 'clock');
    assert.equal(statusIcon('failed'), 'alert');
    assert.equal(statusIcon('sent'), 'tick');
    assert.equal(statusIcon('delivered'), 'ticks');
    assert.equal(statusIcon('partial'), null);
    assert.equal(statusIcon('seen'), null);
  });

  it('is hollow only when seen, and shows the queue only when partial', () => {
    for (const state of ['pending', 'failed', 'sent', 'delivered', 'partial'] as const) {
      assert.equal(isHollow(state), false, state);
    }
    assert.equal(isHollow('seen'), true);
    for (const state of ['pending', 'failed', 'sent', 'delivered', 'seen'] as const) {
      assert.equal(showsQueue(state), false, state);
    }
    assert.equal(showsQueue('partial'), true);
  });
});

describe('avatar queue and Read by list', () => {
  const readers = [1, 2, 3, 4, 5].map((n) => ({ uid: `u${n}`, at: n * 100 }));

  it('shows the first three and counts the rest', () => {
    const { shown, extra } = queueSplit(readers);
    assert.equal(shown.length, MAX_QUEUE_AVATARS);
    assert.deepEqual(shown.map((r) => r.uid), ['u1', 'u2', 'u3']);
    assert.equal(extra, 2);
  });

  it('has no extra badge for three or fewer', () => {
    assert.equal(queueSplit(readers.slice(0, 3)).extra, 0);
    assert.equal(queueSplit(readers.slice(0, 1)).shown.length, 1);
    assert.equal(queueSplit([]).shown.length, 0);
  });

  it('lists newest first in the popup', () => {
    assert.deepEqual(readByList(readers).map((r) => r.uid), ['u5', 'u4', 'u3', 'u2', 'u1']);
  });
});

describe('which message shows the avatar queue', () => {
  // newest first, as the chat lists them
  const chat = [
    { id: 'm5', senderId: 'a' },
    { id: 'm4', senderId: 'me' },
    { id: 'm3', senderId: 'me' },
    { id: 'm2', senderId: 'b' },
    { id: 'm1', senderId: 'me' },
  ];

  it('is the newest message you sent, not the newest in the chat', () => {
    assert.equal(latestSentId(chat, 'me'), 'm4');
    assert.equal(latestSentId(chat, 'a'), 'm5');
  });

  it('moves to the next message when a newer one is sent', () => {
    assert.equal(latestSentId([{ id: 'm6', senderId: 'me' }, ...chat], 'me'), 'm6');
  });

  it('skips a message still sending, one that failed, and one deleted for everyone', () => {
    const list = [
      { id: 'p', senderId: 'me', pending: true },
      { id: 'f', senderId: 'me', failed: true },
      { id: 'd', senderId: 'me', deletedForEveryone: true },
      ...chat,
    ];
    assert.equal(latestSentId(list, 'me'), 'm4');
  });

  it('is null when you have sent nothing, or there is no signed-in user', () => {
    assert.equal(latestSentId(chat, 'someone-else'), null);
    assert.equal(latestSentId([], 'me'), null);
    assert.equal(latestSentId(chat, undefined), null);
    assert.equal(latestSentId(chat, null), null);
  });
});

describe('when someone saw a message', () => {
  it('uses the first recorded read that covered it, not their latest watermark', () => {
    // The first message (sent at 1000) was read at 1100, the second (sent at 2000) at 2100. The watermark now says 2100.
    const receipt = { readAt: t(2100), log: [{ at: 1100, upTo: 1000 }, { at: 2100, upTo: 2000 }] };
    assert.equal(readTimeOf(receipt, 900), 1100);
    assert.equal(readTimeOf(receipt, 1000), 1100);
    assert.equal(readTimeOf(receipt, 1500), 2100);
  });

  it('falls back to the watermark for a message older than the log', () => {
    assert.equal(readTimeOf({ readAt: t(5000), log: [{ at: 4000, upTo: 3000 }] }, 3500), 5000);
    assert.equal(readTimeOf({ readAt: t(5000) }, 100), 5000);
  });

  it('is never earlier than the message itself', () => {
    assert.equal(readTimeOf({ log: [{ at: 50, upTo: 500 }] }, 400), 400);
  });

  it('is what the readers list carries', () => {
    const rs = { a: { readAt: t(SENT + 900), log: [{ at: SENT + 100, upTo: SENT }] } };
    assert.equal(receiptsFor(msg(), ['me', 'a'], rs).readers[0].at, SENT + 100);
  });
});

describe('read log', () => {
  it('keeps only valid entries, oldest first', () => {
    const raw = [{ at: 3, upTo: 30 }, { at: 1, upTo: 10 }, { at: 'x', upTo: 5 }, null, 7, { at: 2 }, { at: NaN, upTo: 1 }];
    assert.deepEqual(cleanReadLog(raw), [{ at: 1, upTo: 10 }, { at: 3, upTo: 30 }]);
    assert.deepEqual(cleanReadLog('nope'), []);
    assert.deepEqual(cleanReadLog(undefined), []);
  });

  it('adds a read that covers newer messages', () => {
    assert.deepEqual(appendReadLog([], 100, 5), [{ at: 5, upTo: 100 }]);
    assert.deepEqual(appendReadLog([{ at: 5, upTo: 100 }], 200, 9), [{ at: 5, upTo: 100 }, { at: 9, upTo: 200 }]);
  });

  it('leaves the log alone when nothing newer was read', () => {
    const log = [{ at: 5, upTo: 100 }];
    assert.deepEqual(appendReadLog(log, 100, 9), log);
    assert.deepEqual(appendReadLog(log, 50, 9), log);
    assert.deepEqual(appendReadLog(log, 0, 9), log);
  });

  it('keeps only the most recent reads', () => {
    let log: unknown = [];
    for (let i = 1; i <= MAX_READ_LOG + 5; i++) log = appendReadLog(log, i * 10, i);
    const kept = cleanReadLog(log);
    assert.equal(kept.length, MAX_READ_LOG);
    assert.equal(kept[kept.length - 1].upTo, (MAX_READ_LOG + 5) * 10);
    assert.equal(kept[0].upTo, 60);
  });
});
