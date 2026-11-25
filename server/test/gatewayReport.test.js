import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createReceiptWatcher,
  describeNetworkError,
  explainTicketError,
  isExpoPushToken,
  looksLikeProjectId,
  readExpoAnswer,
  readReceipts,
} from '../src/gatewayReport.js';

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

describe('looksLikeProjectId', () => {
  it('accepts what Firebase hands out as a project id', () => {
    for (const id of ['syph-1a2b3', 'my-chat-app', 'syph123', 'a12345', 'a'.padEnd(30, 'b')]) assert.equal(looksLikeProjectId(id), true, id);
  });

  it('refuses a project name, a project number and anything else', () => {
    for (const id of ['SYPH', 'syph', 'My Chat App', '123456789012', 'syph-', '-syph1', 'a'.padEnd(31, 'b'), '', undefined, 42]) {
      assert.equal(looksLikeProjectId(id), false, String(id));
    }
  });
});

describe('isExpoPushToken', () => {
  it('knows a phone\'s push token from anything else', () => {
    assert.equal(isExpoPushToken('ExponentPushToken[abc-123]'), true);
    assert.equal(isExpoPushToken('ExpoPushToken[abc]'), true);
    for (const value of ['', 'abc', 'ExponentPushToken[]', 'ExponentPushToken[a b]', 'ExponentPushToken[abc', undefined, 7]) {
      assert.equal(isExpoPushToken(value), false, String(value));
    }
  });
});

describe('explainTicketError', () => {
  it('says what to do about the errors Expo and Google give', () => {
    assert.match(explainTicketError({ details: { error: 'DeviceNotRegistered' } }), /no longer valid/);
    assert.match(explainTicketError({ details: { error: 'InvalidCredentials' } }), /eas credentials/);
    assert.match(explainTicketError({ details: { error: 'MismatchSenderId' } }), /different Firebase projects/);
    assert.match(explainTicketError({ details: { error: 'MessageRateExceeded' } }), /slowing/);
  });

  it('keeps the code in front of the explanation, and passes on what it does not know', () => {
    assert.match(explainTicketError({ details: { error: 'DeviceNotRegistered' } }), /^DeviceNotRegistered: /);
    assert.equal(explainTicketError({ message: 'Something odd', details: { error: 'NewKindOfError' } }), 'NewKindOfError: Something odd');
    assert.equal(explainTicketError({ message: 'Only a message' }), 'Only a message');
    assert.equal(explainTicketError({}), 'an error that Expo did not describe');
    assert.equal(explainTicketError(null), 'an error that Expo did not describe');
  });
});

describe('readExpoAnswer', () => {
  it('counts what Expo accepted and keeps the ids for the receipts', () => {
    const answer = readExpoAnswer(200, '{"data":[{"status":"ok","id":"a"},{"status":"ok","id":"b"}]}');
    assert.deepEqual(answer, { accepted: 2, ids: ['a', 'b'], problems: [] });
  });

  it('reports each notification Expo would not take', () => {
    const answer = readExpoAnswer(
      200,
      '{"data":[{"status":"ok","id":"a"},{"status":"error","message":"gone","details":{"error":"DeviceNotRegistered"}}]}'
    );
    assert.equal(answer.accepted, 1);
    assert.deepEqual(answer.ids, ['a']);
    assert.equal(answer.problems.length, 1);
    assert.match(answer.problems[0], /DeviceNotRegistered/);
  });

  it('reads one result on its own as well as a list', () => {
    assert.equal(readExpoAnswer(200, '{"data":{"status":"ok","id":"a"}}').accepted, 1);
  });

  it('says when Expo refused the whole request, with its reason', () => {
    const answer = readExpoAnswer(400, '{"errors":[{"code":"VALIDATION_ERROR","message":"bad token"}]}');
    assert.equal(answer.accepted, 0);
    assert.deepEqual(answer.problems, ['Expo refused the request (HTTP 400): VALIDATION_ERROR: bad token']);
  });

  it('copes with an answer that is not Expo\'s own', () => {
    assert.match(readExpoAnswer(502, '<html>Bad gateway</html>').problems[0], /HTTP 502.*no reason given/);
    assert.match(readExpoAnswer(200, '{"data":[]}').problems[0], /without saying/);
    assert.match(readExpoAnswer(200, 'nonsense').problems[0], /without saying/);
  });
});

describe('readReceipts', () => {
  it('separates what Google took from what it refused', () => {
    const receipts = readReceipts(
      '{"data":{"a":{"status":"ok"},"b":{"status":"error","message":"x","details":{"error":"InvalidCredentials"}}}}'
    );
    assert.equal(receipts.ok, 1);
    assert.deepEqual(receipts.seen, ['a', 'b']);
    assert.equal(receipts.problems.length, 1);
    assert.match(receipts.problems[0], /InvalidCredentials/);
  });

  it('reads nothing from an answer that holds no receipts', () => {
    for (const text of ['{}', '{"data":[]}', 'nonsense', '{"data":null}']) {
      assert.deepEqual(readReceipts(text), { ok: 0, seen: [], problems: [] }, text);
    }
  });
});

describe('describeNetworkError', () => {
  it('adds the reason Node keeps underneath "fetch failed"', () => {
    assert.equal(describeNetworkError(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })), 'fetch failed (ENOTFOUND)');
    assert.equal(describeNetworkError(Object.assign(new Error('fetch failed'), { cause: new Error('connect timed out') })), 'fetch failed (connect timed out)');
  });

  it('says plainly what it is given otherwise', () => {
    assert.equal(describeNetworkError(new Error('offline')), 'offline');
    assert.equal(describeNetworkError('boom'), 'boom');
  });
});

describe('createReceiptWatcher', () => {
  function setup({ answers, ...options } = {}) {
    const lines = [];
    const queue = [];
    const requests = [];
    const watch = createReceiptWatcher({
      log: (line) => lines.push(line),
      schedule: (run, ms) => {
        queue.push({ run, ms });
        return { unref() {} };
      },
      fetchImpl: async (url, init) => {
        requests.push({ url, init, ids: JSON.parse(init.body).ids });
        const next = answers.shift();
        if (next instanceof Error) throw next;
        return { ok: next.ok ?? true, text: async () => next.text };
      },
      ...options,
    });
    const tick = async () => {
      queue.shift().run();
      await settle();
    };
    return { watch, lines, queue, requests, tick };
  }

  it('asks Expo for the receipts a little after the send and says what Google did', async () => {
    const { watch, lines, queue, requests, tick } = setup({
      answers: [{ text: '{"data":{"a":{"status":"ok"},"b":{"status":"error","details":{"error":"DeviceNotRegistered"}}}}' }],
    });
    watch(['a', 'b']);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].ms, 20_000);
    await tick();
    assert.equal(requests[0].url, 'https://exp.host/--/api/v2/push/getReceipts');
    assert.deepEqual(requests[0].ids, ['a', 'b']);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /took 1 notification/);
    assert.match(lines[1], /^Problem after sending: DeviceNotRegistered/);
    assert.equal(queue.length, 0, 'both receipts were in, so nothing is waited for');
  });

  it('asks once more for a receipt that was not ready, then lets it go', async () => {
    const { watch, lines, queue, requests, tick } = setup({
      answers: [{ text: '{"data":{"a":{"status":"ok"}}}' }, { text: '{"data":{}}' }],
    });
    watch(['a', 'b']);
    await tick();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].ms, 100_000, 'the second look is 120 s after the send, 100 s after the first');
    await tick();
    assert.deepEqual(requests.map((request) => request.ids), [['a', 'b'], ['b']]);
    assert.equal(queue.length, 0);
    assert.equal(lines.length, 1, 'a receipt that never came is not worth a line');
  });

  it('says nothing when Expo does not answer, and tries again', async () => {
    const { watch, lines, queue, tick } = setup({ answers: [new Error('offline'), { ok: false, text: '' }] });
    watch(['a']);
    await tick();
    assert.equal(queue.length, 1);
    await tick();
    assert.equal(queue.length, 0);
    assert.deepEqual(lines, []);
  });

  it('sends Expo\'s access token when there is one', async () => {
    const { watch, requests, tick } = setup({ accessToken: 'secret', answers: [{ text: '{"data":{}}' }, { text: '{"data":{}}' }] });
    watch(['a']);
    await tick();
    assert.equal(requests[0].init.headers.Authorization, 'Bearer secret');
  });

  it('does not wait on more notifications than it is allowed, and frees the room when it is done', async () => {
    const { watch, queue, tick } = setup({ maxWatched: 2, answers: [{ text: '{"data":{"a":{"status":"ok"},"b":{"status":"ok"}}}' }] });
    watch(['a', 'b', 'c']);
    assert.equal(queue.length, 0, 'three would be over the limit of two');
    watch(['a', 'b']);
    assert.equal(queue.length, 1);
    watch(['c']);
    assert.equal(queue.length, 1, 'the room is taken until the first two are done');
    await tick();
    watch(['c']);
    assert.equal(queue.length, 1);
  });

  it('ignores a list with nothing to look for', () => {
    const { watch, queue } = setup({ answers: [] });
    watch([]);
    watch([undefined, 7]);
    assert.equal(queue.length, 0);
  });
});
