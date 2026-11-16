import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  TokenError,
  cleanMessage,
  corsHeaders,
  createForwarder,
  createGateway,
  createKeyCache,
  parsePushBody,
  verifyIdToken,
} from '../src/pushGateway.js';

const PROJECT = 'syph-test';
const NOW = 1_800_000_000_000;
const SECONDS = NOW / 1000;
const TOKEN = 'ExponentPushToken[abc-123]';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
// What Google publishes: the public key with its id.
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };
const getKey = async (kid) => (kid === 'key-1' ? jwk : null);
const deps = { projectId: PROJECT, getKey, now: () => NOW };

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A Firebase ID token for user-1, with whatever is overridden. */
function makeToken({ header = {}, claims = {}, key = pair.privateKey } = {}) {
  const head = encode({ alg: 'RS256', kid: 'key-1', typ: 'JWT', ...header });
  const body = encode({
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    sub: 'user-1',
    iat: SECONDS - 60,
    exp: SECONDS + 3600,
    ...claims,
  });
  return `${head}.${body}.${sign('sha256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
}

const rejects = (token, pattern) => assert.rejects(verifyIdToken(token, deps), (error) => error instanceof TokenError && pattern.test(error.message));

describe('verifyIdToken', () => {
  it('accepts a token of this project and returns the user', async () => {
    assert.equal(await verifyIdToken(makeToken(), deps), 'user-1');
  });

  it('refuses a token that has expired', () => rejects(makeToken({ claims: { exp: SECONDS - 1 } }), /expired/));
  it('refuses a token made for another project', async () => {
    await rejects(makeToken({ claims: { aud: 'other-app' } }), /another project/);
    await rejects(makeToken({ claims: { iss: 'https://securetoken.google.com/other-app' } }), /another project/);
  });
  it('refuses a token signed by a key that is not Google\'s', () => rejects(makeToken({ key: stranger.privateKey }), /signature/));
  it('refuses a token whose body was changed after signing', async () => {
    const [head, , signature] = makeToken().split('.');
    await rejects(`${head}.${encode({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'admin', iat: SECONDS - 60, exp: SECONDS + 3600 })}.${signature}`, /signature/);
  });
  it('refuses another signing method, such as none or HS256', async () => {
    await rejects(makeToken({ header: { alg: 'none' } }), /signing method/);
    await rejects(makeToken({ header: { alg: 'HS256' } }), /signing method/);
  });
  it('refuses a key id Google does not publish', () => rejects(makeToken({ header: { kid: 'unknown' } }), /unknown signing key/));
  it('refuses a token from the future, or one that names no user', async () => {
    await rejects(makeToken({ claims: { iat: SECONDS + 3600 } }), /future/);
    await rejects(makeToken({ claims: { sub: '' } }), /no user/);
    await rejects(makeToken({ claims: { sub: undefined } }), /no user/);
  });
  it('refuses anything that is not a token', async () => {
    await rejects(undefined, /malformed/);
    await rejects('', /malformed/);
    await rejects('a.b', /malformed/);
    await rejects('a..c', /malformed/);
    await rejects('not.json.at-all', /unreadable/);
  });
});

describe('createKeyCache', () => {
  function fakeGoogle(keys, cacheControl = 'public, max-age=3600') {
    const calls = [];
    return {
      calls,
      fetchImpl: async (url) => {
        calls.push(url);
        return { ok: true, json: async () => ({ keys }), headers: { get: () => cacheControl } };
      },
    };
  }

  it('fetches the keys once and keeps them for the time Google gives', async () => {
    let at = 0;
    const google = fakeGoogle([jwk]);
    const getCached = createKeyCache({ fetchImpl: google.fetchImpl, now: () => at });
    assert.equal((await getCached('key-1')).kid, 'key-1');
    at = 3_599_000;
    assert.equal((await getCached('key-1')).kid, 'key-1');
    assert.equal(google.calls.length, 1);
    at = 3_601_000;
    await getCached('key-1');
    assert.equal(google.calls.length, 2);
  });

  it('looks again for a key it does not know, but not more than once a minute', async () => {
    let at = 0;
    const google = fakeGoogle([jwk]);
    const getCached = createKeyCache({ fetchImpl: google.fetchImpl, now: () => at });
    await getCached('key-1');
    at = 10_000;
    assert.equal(await getCached('forged-1'), null);
    assert.equal(await getCached('forged-2'), null);
    assert.equal(google.calls.length, 1); // under a minute since the last fetch: no new fetch
    at = 70_000;
    assert.equal(await getCached('forged-3'), null);
    assert.equal(google.calls.length, 2);
  });

  it('keeps only RSA keys that have an id, and fails loudly when Google does not answer', async () => {
    const google = fakeGoogle([jwk, { kty: 'EC', kid: 'x' }, { kty: 'RSA' }]);
    const getCached = createKeyCache({ fetchImpl: google.fetchImpl });
    assert.equal(await getCached('x'), null);
    const down = createKeyCache({ fetchImpl: async () => ({ ok: false, status: 503 }) });
    await assert.rejects(down('key-1'), /503/);
  });
});

describe('cleanMessage and parsePushBody', () => {
  const call = {
    to: TOKEN,
    title: 'Ana',
    body: 'Incoming voice call',
    sound: 'default',
    priority: 'high',
    channelId: 'calls',
    ttl: 30,
    data: { type: 'call', callId: 'c1' },
  };

  it('keeps what the app sends', () => assert.deepEqual(cleanMessage(call), call));
  it('keeps a silent message without text', () => {
    const silent = { to: TOKEN, priority: 'high', data: { type: 'call-ended' } };
    assert.deepEqual(cleanMessage(silent), silent);
  });
  it('drops fields it does not know', () => assert.deepEqual(cleanMessage({ ...call, _contentAvailable: true, badge: 99, extra: 'x' }), call));
  it('refuses a recipient that is not an Expo token', () => {
    for (const to of ['', 'abc', 'ExponentPushToken[]', 'ExponentPushToken[a b]', 5, undefined]) assert.equal(cleanMessage({ ...call, to }), null);
  });
  it('refuses fields of the wrong kind or size', () => {
    assert.equal(cleanMessage({ ...call, title: 5 }), null);
    assert.equal(cleanMessage({ ...call, body: 'x'.repeat(1001) }), null);
    assert.equal(cleanMessage({ ...call, sound: 'siren.wav' }), null);
    assert.equal(cleanMessage({ ...call, priority: 'urgent' }), null);
    assert.equal(cleanMessage({ ...call, ttl: -1 }), null);
    assert.equal(cleanMessage({ ...call, ttl: 1.5 }), null);
    assert.equal(cleanMessage({ ...call, ttl: 3_000_000 }), null);
    assert.equal(cleanMessage({ ...call, data: [] }), null);
    assert.equal(cleanMessage({ ...call, data: { n: 1 } }), null);
    assert.equal(cleanMessage('text'), null);
    assert.equal(cleanMessage(null), null);
  });

  it('takes a list, or one message on its own', () => {
    assert.deepEqual(parsePushBody(JSON.stringify([call])).messages, [call]);
    assert.deepEqual(parsePushBody(JSON.stringify(call)).messages, [call]);
  });
  it('refuses an empty list, too long a list, bad JSON and any bad message in the list', () => {
    assert.match(parsePushBody('[]').error, /between 1 and 100/);
    assert.match(parsePushBody(JSON.stringify(Array(101).fill(call))).error, /between 1 and 100/);
    assert.equal(parsePushBody(JSON.stringify(Array(100).fill(call))).messages.length, 100);
    assert.match(parsePushBody('{nope').error, /not JSON/);
    assert.match(parsePushBody(JSON.stringify([call, { to: 'x' }])).error, /message 2/);
  });
});

describe('corsHeaders', () => {
  it('allows the listed web addresses and no others', () => {
    const allowed = ['https://syph.web.app'];
    assert.equal(corsHeaders('https://syph.web.app', allowed)['Access-Control-Allow-Origin'], 'https://syph.web.app');
    assert.deepEqual(corsHeaders('https://evil.example', allowed), {});
    assert.deepEqual(corsHeaders(undefined, allowed), {});
  });
  it('lets the sign-in token header through, which a wildcard would not', () => {
    const headers = corsHeaders('http://localhost:8081', ['*']);
    assert.equal(headers['Access-Control-Allow-Origin'], '*');
    assert.match(headers['Access-Control-Allow-Headers'], /authorization/);
  });
});

describe('createForwarder', () => {
  it('posts the messages to Expo, with the access token when there is one, and returns its answer as it came', async () => {
    const seen = [];
    const forward = createForwarder({
      accessToken: 'secret',
      fetchImpl: async (url, init) => {
        seen.push({ url, init });
        return { status: 200, text: async () => '{"data":[{"status":"ok"}]}', headers: { get: () => 'application/json; charset=utf-8' } };
      },
    });
    const result = await forward([{ to: TOKEN }]);
    assert.equal(seen[0].url, 'https://exp.host/--/api/v2/push/send');
    assert.equal(seen[0].init.headers.Authorization, 'Bearer secret');
    assert.equal(seen[0].init.body, '[{"to":"ExponentPushToken[abc-123]"}]');
    assert.deepEqual(result, { status: 200, body: '{"data":[{"status":"ok"}]}', contentType: 'application/json; charset=utf-8' });
  });
  it('sends no Authorization header without an access token', async () => {
    let headers;
    const forward = createForwarder({
      fetchImpl: async (_url, init) => {
        headers = init.headers;
        return { status: 200, text: async () => '{}', headers: { get: () => null } };
      },
    });
    assert.equal((await forward([{ to: TOKEN }])).contentType, 'application/json');
    assert.equal('Authorization' in headers, false);
  });
});

describe('createGateway', () => {
  const messages = [{ to: TOKEN, title: 'Ana', body: 'Hello', priority: 'high', data: { type: 'message' } }];

  function setup(options = {}) {
    const forwarded = [];
    const handle = createGateway({
      projectId: PROJECT,
      getKey,
      now: () => NOW,
      forward: async (list) => {
        forwarded.push(list);
        return { status: 200, body: '{"data":[{"status":"ok","id":"r1"}]}' };
      },
      ...options,
    });
    return { handle, forwarded };
  }
  const post = (overrides = {}) => ({
    method: 'POST',
    path: '/push',
    origin: 'http://localhost:8081',
    authorization: `Bearer ${makeToken()}`,
    body: JSON.stringify(messages),
    ...overrides,
  });

  it('passes a signed-in person\'s messages to Expo and returns Expo\'s answer with the page allowed to read it', async () => {
    const { handle, forwarded } = setup();
    const answer = await handle(post());
    assert.equal(answer.status, 200);
    assert.equal(answer.body, '{"data":[{"status":"ok","id":"r1"}]}');
    assert.equal(answer.headers['Access-Control-Allow-Origin'], '*');
    assert.deepEqual(forwarded, [messages]);
  });

  it('answers the browser\'s question before a post with the headers it asks for, and sends nothing', async () => {
    const { handle, forwarded } = setup({ allowedOrigins: ['http://localhost:8081'] });
    const answer = await handle({ method: 'OPTIONS', path: '/push', origin: 'http://localhost:8081', body: '' });
    assert.equal(answer.status, 204);
    assert.equal(answer.headers['Access-Control-Allow-Origin'], 'http://localhost:8081');
    assert.match(answer.headers['Access-Control-Allow-Headers'], /authorization/);
    assert.equal(forwarded.length, 0);
  });

  it('refuses a page whose address is not allowed', async () => {
    const { handle, forwarded } = setup({ allowedOrigins: ['https://syph.web.app'] });
    const answer = await handle(post({ origin: 'https://evil.example' }));
    assert.equal(answer.status, 403);
    assert.equal(answer.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(forwarded.length, 0);
  });

  it('refuses a request without a valid sign-in', async () => {
    const { handle, forwarded } = setup();
    for (const authorization of [undefined, '', 'Bearer', 'Bearer nonsense', `Bearer ${makeToken({ key: stranger.privateKey })}`, `Basic ${makeToken()}`]) {
      assert.equal((await handle(post({ authorization }))).status, 401, String(authorization));
    }
    assert.equal(forwarded.length, 0);
  });

  it('says it cannot check, rather than refusing, when Google\'s keys cannot be fetched', async () => {
    const { handle } = setup({ getKey: async () => { throw new Error('offline'); } });
    assert.equal((await handle(post())).status, 503);
  });

  it('refuses a body that is not a list of the app\'s push messages', async () => {
    const { handle, forwarded } = setup();
    assert.equal((await handle(post({ body: 'nope' }))).status, 400);
    assert.equal((await handle(post({ body: JSON.stringify([{ to: 'someone@example.com' }]) }))).status, 400);
    assert.equal(forwarded.length, 0);
  });

  it('allows one person a set number of requests a minute, then lets them send again', async () => {
    let at = NOW;
    const { handle } = setup({ perMinute: 2, now: () => at });
    const token = makeToken();
    const send = () => handle(post({ authorization: `Bearer ${token}` })).then((answer) => answer.status);
    assert.deepEqual([await send(), await send(), await send()], [200, 200, 429]);
    // Someone else is not held up by it.
    assert.equal((await handle(post({ authorization: `Bearer ${makeToken({ claims: { sub: 'user-2' } })}` }))).status, 200);
    at += 61_000;
    // (the token was issued for a minute before NOW and lasts an hour, so it is still good)
    assert.equal(await send(), 200);
  });

  it('says so when Expo cannot be reached, and passes Expo\'s own errors on', async () => {
    const down = setup({ forward: async () => { throw new Error('unreachable'); } });
    assert.equal((await down.handle(post())).status, 502);
    const refused = setup({ forward: async () => ({ status: 400, body: '{"errors":[{"code":"VALIDATION_ERROR"}]}' }) });
    const answer = await refused.handle(post());
    assert.equal(answer.status, 400);
    assert.match(answer.body, /VALIDATION_ERROR/);
  });

  it('answers /health and nothing else but posts', async () => {
    const { handle } = setup();
    assert.equal((await handle({ method: 'GET', path: '/health', body: '' })).body, 'ok');
    assert.equal((await handle({ method: 'GET', path: '/push', body: '' })).status, 404);
    assert.equal((await handle(post({ path: '/' }))).status, 200); // a gateway address given without /push still works
  });
});
