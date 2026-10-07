import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPushSender } from '../src/expoPush.js';

const silent = { info() {}, warn() {} };
const T = (n) => `ExponentPushToken[token-${n}]`; // valid Expo token format

/** Minimal stand-in for the Expo client. Chunks of 2 so multi-chunk behaviour is covered. */
function fakeExpo({ tickets, receipts = {}, failSend = false, failReceipts = false } = {}) {
  const calls = { sent: [], receiptRequests: [] };
  return {
    calls,
    chunkPushNotifications: (messages) => {
      const chunks = [];
      for (let i = 0; i < messages.length; i += 2) chunks.push(messages.slice(i, i + 2));
      return chunks;
    },
    sendPushNotificationsAsync: async (chunk) => {
      calls.sent.push(chunk.map((m) => m.to));
      if (failSend) throw new Error('network down');
      return chunk.map((m) => tickets?.[m.to] ?? { status: 'ok', id: `receipt-${m.to}` });
    },
    chunkPushNotificationReceiptIds: (ids) => [ids],
    getPushNotificationReceiptsAsync: async (ids) => {
      calls.receiptRequests.push(ids);
      if (failReceipts) throw new Error('receipts down');
      return receipts;
    },
  };
}

function setup(expoOptions) {
  const removed = [];
  const expo = fakeExpo(expoOptions);
  let clock = 1_000_000;
  const sender = createPushSender({
    expo,
    removeToken: async (uid, token) => removed.push([uid, token]),
    log: silent,
    now: () => clock,
  });
  return { expo, sender, removed, advance: (ms) => (clock += ms) };
}

const entry = (uid, n) => ({ uid, message: { to: T(n), title: 't', body: 'b' } });

describe('send', () => {
  it('sends every valid message across chunks and queues receipts', async () => {
    const { expo, sender } = setup();
    const result = await sender.send([entry('a', 1), entry('b', 2), entry('c', 3)]);
    assert.deepEqual(result, { sent: 3, failed: 0 });
    assert.equal(expo.calls.sent.length, 2); // 2 + 1
    assert.equal(sender.pendingCount(), 3);
  });

  it('prunes a token that Expo says is not registered, attributing it to the right user', async () => {
    const { sender, removed } = setup({
      tickets: { [T(2)]: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } },
    });
    const result = await sender.send([entry('a', 1), entry('b', 2), entry('c', 3)]);
    assert.deepEqual(result, { sent: 2, failed: 1 });
    assert.deepEqual(removed, [['b', T(2)]]);
    assert.equal(sender.pendingCount(), 2);
  });

  it('does not prune on other ticket errors', async () => {
    const { sender, removed } = setup({
      tickets: { [T(1)]: { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } } },
    });
    const result = await sender.send([entry('a', 1)]);
    assert.deepEqual(result, { sent: 0, failed: 1 });
    assert.deepEqual(removed, []);
  });

  it('prunes malformed tokens without sending them', async () => {
    const { expo, sender, removed } = setup();
    const result = await sender.send([
      { uid: 'a', message: { to: 'not-a-token', title: 't', body: 'b' } },
      entry('a', 1),
    ]);
    assert.deepEqual(result, { sent: 1, failed: 0 });
    assert.deepEqual(removed, [['a', 'not-a-token']]);
    assert.deepEqual(expo.calls.sent.flat(), [T(1)]);
  });

  it('keeps tokens and does not throw when the Expo request itself fails', async () => {
    const { sender, removed } = setup({ failSend: true });
    const result = await sender.send([entry('a', 1), entry('b', 2), entry('c', 3)]);
    assert.deepEqual(result, { sent: 0, failed: 3 });
    assert.deepEqual(removed, []);
    assert.equal(sender.pendingCount(), 0);
  });

  it('handles an empty batch', async () => {
    const { sender } = setup();
    assert.deepEqual(await sender.send([]), { sent: 0, failed: 0 });
  });
});

describe('checkReceipts', () => {
  it('waits until receipts are old enough', async () => {
    const { expo, sender } = setup();
    await sender.send([entry('a', 1)]);
    assert.deepEqual(await sender.checkReceipts(), { checked: 0, pruned: 0 });
    assert.equal(expo.calls.receiptRequests.length, 0);
    assert.equal(sender.pendingCount(), 1);
  });

  it('prunes DeviceNotRegistered receipts and clears finished ones', async () => {
    const { sender, removed, advance } = setup({
      receipts: {
        [`receipt-${T(1)}`]: { status: 'ok' },
        [`receipt-${T(2)}`]: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      },
    });
    await sender.send([entry('a', 1), entry('b', 2)]);
    advance(3 * 60 * 1000);
    assert.deepEqual(await sender.checkReceipts(), { checked: 2, pruned: 1 });
    assert.deepEqual(removed, [['b', T(2)]]);
    assert.equal(sender.pendingCount(), 0);
  });

  it('keeps receipts Expo has not produced yet, then drops them after 24 hours', async () => {
    const { sender, advance } = setup({ receipts: {} });
    await sender.send([entry('a', 1)]);
    advance(3 * 60 * 1000);
    assert.deepEqual(await sender.checkReceipts(), { checked: 0, pruned: 0 });
    assert.equal(sender.pendingCount(), 1);
    advance(25 * 60 * 60 * 1000);
    await sender.checkReceipts();
    assert.equal(sender.pendingCount(), 0);
  });

  it('retries later when the receipts request fails', async () => {
    const { sender, advance } = setup({ failReceipts: true });
    await sender.send([entry('a', 1)]);
    advance(3 * 60 * 1000);
    await sender.checkReceipts();
    assert.equal(sender.pendingCount(), 1);
  });
});
