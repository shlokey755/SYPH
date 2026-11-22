import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';
import { createGatewayServer } from '../src/gatewayServer.js';
import { createGateway } from '../src/pushGateway.js';

// The real HTTP server on a spare port, with Google's keys and Expo replaced: what a browser (or this test) sends is read, answered
// and written to the log the way it is when a person runs `npm run gateway`.

const PROJECT = 'syph-abc123';
const TOKEN = 'ExponentPushToken[abc-123]';
const ORIGIN = 'http://localhost:8081';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function makeToken(project = PROJECT) {
  const seconds = Math.floor(Date.now() / 1000);
  const head = encode({ alg: 'RS256', kid: 'key-1', typ: 'JWT' });
  const body = encode({ aud: project, iss: `https://securetoken.google.com/${project}`, sub: 'user-1234567', iat: seconds - 60, exp: seconds + 3600 });
  return `${head}.${body}.${sign('sha256', Buffer.from(`${head}.${body}`), pair.privateKey).toString('base64url')}`;
}

const call = { to: TOKEN, title: 'Ana', body: 'Incoming voice call', priority: 'high', data: { type: 'call', callId: 'c1' } };

async function run(options = {}) {
  const lines = [];
  const handle =
    options.handle ??
    createGateway({
      projectId: PROJECT,
      getKey: async (kid) => (kid === 'key-1' ? jwk : null),
      forward: async () => ({ status: 200, body: '{"data":[{"status":"ok","id":"r1"}]}' }),
      log: (line) => lines.push(line),
      ...options,
    });
  const server = createGatewayServer({ handle, log: (line) => lines.push(line) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () =>
    new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  const post = (body, { token = makeToken(), origin = ORIGIN } = {}) =>
    fetch(`${base}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  return { base, lines, close, post };
}

async function within(options, test) {
  const gateway = await run(options);
  try {
    await test(gateway);
  } finally {
    await gateway.close();
  }
}

describe('the gateway server', () => {
  it('has a page at / that says it is running and what it has done, and answers /health', () =>
    within({}, async ({ base, post }) => {
      const first = await (await fetch(`${base}/`)).text();
      assert.match(first, /SYPH push gateway: running\./);
      assert.match(first, /Project: syph-abc123/);
      assert.match(first, /0 request\(s\)/);
      assert.match(first, /Last problem: none\./);
      assert.equal(await (await fetch(`${base}/health`)).text(), 'ok');

      await post([call]);
      await post([call], { token: makeToken('another-proj') });
      const later = await (await fetch(`${base}/`)).text();
      assert.match(later, /2 request\(s\) from the app, 1 notification\(s\) passed on to Expo, 1 refused/);
      assert.match(later, /Last problem \(\d\d:\d\d:\d\d\): the sign-in was not accepted/);
    }));

  it('answers the browser\'s check before a post, and says that it did', () =>
    within({}, async ({ base, lines }) => {
      const response = await fetch(`${base}/push`, {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' },
      });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
      assert.match(response.headers.get('access-control-allow-headers'), /authorization/);
      assert.equal(response.headers.get('access-control-allow-private-network'), 'true');
      assert.equal(lines.length, 1);
      assert.match(lines[0], /page at http:\/\/localhost:8081 may send here: yes/);
    }));

  it('passes a signed-in person\'s notification to Expo, returns Expo\'s answer, and writes what happened', () =>
    within({}, async ({ post, lines }) => {
      const response = await post([call]);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
      assert.deepEqual(await response.json(), { data: [{ status: 'ok', id: 'r1' }] });
      assert.equal(lines.length, 1);
      assert.match(lines[0], /^user user-1… sent 1 notification\(s\) \(call\) from http:\/\/localhost:8081\. Expo accepted 1\.$/);
    }));

  it('writes what Expo said when it would not take a notification', () =>
    within(
      { forward: async () => ({ status: 200, body: '{"data":[{"status":"error","message":"gone","details":{"error":"DeviceNotRegistered"}}]}' }) },
      async ({ post, lines }) => {
        await post([call]);
        assert.match(lines[0], /Expo accepted 0 of 1, and said:/);
        assert.match(lines[1], /^ {2}- DeviceNotRegistered: .*no longer valid/);
      }
    ));

  it('says which project the app is signed in to when the gateway was given another, and not to the sender', () =>
    within({ projectId: 'syph' }, async ({ post, lines }) => {
      const response = await post([call]);
      assert.equal(response.status, 401);
      assert.doesNotMatch(await response.text(), /syph-abc123/, 'the sender is told only to sign in again');
      assert.equal(lines.length, 1);
      assert.match(lines[0], /^Refused: the sign-in was not accepted \(token is for another project\)\./);
      assert.match(lines[0], /signed in to the Firebase project "syph-abc123" but the gateway is set to "syph"/);
      assert.match(lines[0], /FIREBASE_PROJECT_ID=syph-abc123/);
    }));

  it('says when a request has no sign-in at all', () =>
    within({}, async ({ post, lines }) => {
      assert.equal((await post([call], { token: null })).status, 401);
      assert.match(lines[0], /without a sign-in token/);
    }));

  it('refuses a page whose address is not allowed, and says where to allow it', () =>
    within({ allowedOrigins: ['https://syph.web.app'] }, async ({ post, lines }) => {
      const response = await post([call]);
      assert.equal(response.status, 403);
      assert.match(lines[0], /page at http:\/\/localhost:8081 tried to use the gateway.*not in ALLOWED_ORIGINS \(https:\/\/syph\.web\.app\)/);
    }));

  it('refuses a body that is not a list of push messages, and says why', () =>
    within({}, async ({ post, lines }) => {
      assert.equal((await post('nonsense')).status, 400);
      assert.match(lines[0], /not a list of push messages.*not JSON/);
    }));

  it('answers a request that is too large at once', () =>
    within({}, async ({ post, lines }) => {
      const response = await post(JSON.stringify([{ ...call, body: 'x' }]) + ' '.repeat(300 * 1024));
      assert.equal(response.status, 413);
      assert.match(lines[0], /larger than the gateway takes/);
    }));

  it('says when Expo cannot be reached', () =>
    within(
      { forward: async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }); } },
      async ({ post, lines }) => {
        assert.equal((await post([call])).status, 502);
        assert.match(lines[0], /could not reach Expo's push service \(fetch failed \(ENOTFOUND\)\)/);
      }
    ));

  it('says when Google\'s keys cannot be reached, so sign-ins cannot be checked', () =>
    within(
      { getKey: async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }); } },
      async ({ post, lines }) => {
        assert.equal((await post([call])).status, 503);
        assert.match(lines[0], /could not check a sign-in: fetch failed \(ENOTFOUND\).*www\.googleapis\.com/);
      }
    ));

  it('tells the log, and answers 500, when a request breaks inside the gateway', () =>
    within({ handle: async () => { throw new Error('a bug'); } }, async ({ base, lines }) => {
      const response = await fetch(`${base}/push`, { method: 'POST', body: '[]' });
      assert.equal(response.status, 500);
      assert.match(lines[0], /broke inside the gateway|failed inside the gateway: a bug/);
    }));
});
