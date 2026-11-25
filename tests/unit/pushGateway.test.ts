import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { installPushGateway, pushThroughGateway } from '../../src/services/pushGateway.ts';

const EXPO = 'https://exp.host/--/api/v2/push/send';
const GATEWAY = 'http://localhost:8787/push';

type Seen = { input: RequestInfo | URL; init?: RequestInit };

/** A stand-in for the browser's fetch that records what it was asked for. */
function fakeFetch(behaviour: () => Response | Promise<Response> = () => new Response('{"data":[]}', { status: 200 })) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ input, init });
    return behaviour();
  }) as typeof fetch;
  return { seen, fetchImpl };
}

const post = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[{"to":"x"}]' };
const signedIn = async () => 'id-token';

/** Lets what was started without being waited for (a copy of an answer being read) finish. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

/** What `console[method]` was called with while `run` ran. */
async function capture(method: 'info' | 'warn', run: () => Promise<void>): Promise<unknown[][]> {
  const told: unknown[][] = [];
  const original = console[method];
  console[method] = (...args: unknown[]) => void told.push(args);
  try {
    await run();
  } finally {
    console[method] = original;
  }
  return told;
}

describe('pushThroughGateway', () => {
  it('sends the request meant for Expo to the gateway, with the sign-in token and everything else it had', async () => {
    const real = fakeFetch();
    const wrapped = pushThroughGateway(real.fetchImpl, { expoUrl: EXPO, gatewayUrl: GATEWAY, getToken: signedIn });
    const response = await wrapped(EXPO, post);
    assert.equal(response.status, 200);
    assert.equal(real.seen.length, 1);
    assert.equal(real.seen[0].input, GATEWAY);
    assert.equal(real.seen[0].init?.method, 'POST');
    assert.equal(real.seen[0].init?.body, post.body);
    const headers = new Headers(real.seen[0].init?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer id-token');
    assert.equal(headers.get('Content-Type'), 'application/json');
  });

  it('knows the address whether it is given as a string, a URL or a Request', async () => {
    const real = fakeFetch();
    const wrapped = pushThroughGateway(real.fetchImpl, { expoUrl: EXPO, gatewayUrl: GATEWAY, getToken: signedIn });
    await wrapped(new URL(EXPO), post);
    await wrapped(new Request(EXPO, { method: 'POST', body: '[]' }));
    assert.deepEqual(real.seen.map((call) => call.input), [GATEWAY, GATEWAY]);
  });

  it('leaves every other request alone', async () => {
    const real = fakeFetch();
    const wrapped = pushThroughGateway(real.fetchImpl, { expoUrl: EXPO, gatewayUrl: GATEWAY, getToken: signedIn });
    const init = { headers: { Accept: 'x' } };
    await wrapped('https://firestore.googleapis.com/v1/projects', init);
    await wrapped(`${EXPO}?other=1`);
    assert.equal(real.seen[0].input, 'https://firestore.googleapis.com/v1/projects');
    assert.equal(real.seen[0].init, init);
    assert.equal(real.seen[1].input, `${EXPO}?other=1`);
  });

  it('answers "nothing to deliver" without sending anything, and explains once, when there is no gateway', async () => {
    const real = fakeFetch();
    const wrapped = pushThroughGateway(real.fetchImpl, { expoUrl: EXPO, gatewayUrl: undefined, getToken: signedIn });
    const told: unknown[][] = [];
    const info = console.info;
    console.info = (...args: unknown[]) => void told.push(args);
    try {
      const first = await wrapped(EXPO, post);
      const second = await wrapped(EXPO, post);
      assert.equal(first.status, 200);
      assert.deepEqual(await second.json(), { data: [] });
    } finally {
      console.info = info;
    }
    assert.equal(real.seen.length, 0);
    assert.equal(told.length, 1);
    assert.match(String(told[0][0]), /EXPO_PUBLIC_PUSH_GATEWAY_URL/);
  });

  it('answers 401 and sends nothing when nobody is signed in', async () => {
    const real = fakeFetch();
    for (const getToken of [async () => null, async () => { throw new Error('auth not ready'); }]) {
      const wrapped = pushThroughGateway(real.fetchImpl, { expoUrl: EXPO, gatewayUrl: GATEWAY, getToken });
      assert.equal((await wrapped(EXPO, post)).status, 401);
    }
    assert.equal(real.seen.length, 0);
  });

  it('lets the failure through, and says once that the gateway may not be running, when it does not answer', async () => {
    const real = fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const wrapped = pushThroughGateway(real.fetchImpl, { expoUrl: EXPO, gatewayUrl: GATEWAY, getToken: signedIn });
    const warned: unknown[][] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => void warned.push(args);
    try {
      await assert.rejects(wrapped(EXPO, post), /Failed to fetch/);
      await assert.rejects(wrapped(EXPO, post), /Failed to fetch/);
    } finally {
      console.warn = warn;
    }
    assert.equal(warned.length, 1);
    assert.match(String(warned[0][0]), /Is it running/);
    assert.match(String(warned[0][0]), /Open http:\/\/localhost:8787\/ in this browser/, 'the page that shows the gateway is there');
  });

  it('says, once for each kind of refusal, what the gateway said, and still hands the answer on whole', async () => {
    const real = fakeFetch(
      () => new Response('{"error":"sign in again (token is for another project)"}', { status: 401, headers: { 'Content-Type': 'application/json' } })
    );
    const wrapped = pushThroughGateway(real.fetchImpl, { expoUrl: EXPO, gatewayUrl: GATEWAY, getToken: signedIn });
    const told = await capture('warn', async () => {
      const first = await wrapped(EXPO, post);
      await wrapped(EXPO, post);
      assert.equal(first.status, 401);
      assert.deepEqual(await first.json(), { error: 'sign in again (token is for another project)' }, 'the body was not used up by reading it');
      await settle();
    });
    assert.equal(told.length, 1);
    assert.match(String(told[0][0]), /Phones were not notified: the push gateway answered HTTP 401: sign in again \(token is for another project\)/);
    assert.match(String(told[0][0]), /window the gateway runs in says why/);
  });

  it('copes with a refusal that is not the gateway\'s own words', async () => {
    const real = fakeFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    const wrapped = pushThroughGateway(real.fetchImpl, { expoUrl: EXPO, gatewayUrl: GATEWAY, getToken: signedIn });
    const told = await capture('warn', async () => {
      assert.equal((await wrapped(EXPO, post)).status, 502);
      await settle();
    });
    assert.equal(told.length, 1);
    assert.match(String(told[0][0]), /answered HTTP 502\. The window/);
  });

  it('says once, when the gateway takes a notification, that phones are notified through it', async () => {
    const real = fakeFetch();
    const wrapped = pushThroughGateway(real.fetchImpl, { expoUrl: EXPO, gatewayUrl: GATEWAY, getToken: signedIn });
    const told = await capture('info', async () => {
      await wrapped(EXPO, post);
      await wrapped(EXPO, post);
      await settle();
    });
    assert.equal(told.length, 1);
    assert.match(String(told[0][0]), /notified through the push gateway at http:\/\/localhost:8787\/push/);
  });
});

describe('installPushGateway', () => {
  it('replaces fetch once, however many times it is asked', async () => {
    const real = fakeFetch();
    const scope = { fetch: real.fetchImpl };
    const options = { expoUrl: EXPO, gatewayUrl: GATEWAY, getToken: signedIn };
    installPushGateway(scope, options);
    const installed = scope.fetch;
    installPushGateway(scope, options);
    assert.equal(scope.fetch, installed);
    assert.notEqual(installed, real.fetchImpl);

    await scope.fetch(EXPO, post);
    assert.equal(real.seen[0].input, GATEWAY);
  });
});
