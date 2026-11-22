/**
 * pushGateway.js
 * The way for a browser to wake someone's phone. A phone sends its own push notifications by asking Expo's push service
 * directly. A browser cannot: the service sends no CORS headers, so the browser refuses the request before it leaves
 * (the console says "Failed to fetch"). The web app posts the same messages here instead, and this service hands them to
 * Expo, which has no such rule for servers.
 *
 * Before it passes anything on it checks that
 *   - the request carries a Firebase sign-in token (ID token) of this project, so only people signed in to the app can use it;
 *   - the web address it comes from is allowed, and one person does not send more than a few hundred a minute;
 *   - the body is a list of at most 100 push messages of the kind the app sends (anything else is refused, unknown fields dropped).
 *
 * It has no dependencies and no network of its own: the fetching of Google's keys and the call to Expo are passed in, so
 * test/pushGateway.test.js runs without either. gateway.js is the small server that runs it.
 *
 * It says what it does, in plain words, to the `log` it is given (see gatewayReport.js): who was refused and why, and what Expo
 * answered to each send. Nothing was ever said before, so a gateway that refused every request looked the same as one that worked.
 */

import { createPublicKey, verify } from 'node:crypto';
import { EXPO_PUSH_URL, describeNetworkError, isExpoPushToken, readExpoAnswer } from './gatewayReport.js';

export { EXPO_PUSH_URL };
/** Google's public keys for Firebase ID tokens. */
export const GOOGLE_KEYS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_MESSAGES = 100; // what Expo accepts in one request

const MINUTE_MS = 60_000;

/**
 * A sign-in token that cannot be accepted (as opposed to a failure of ours while checking it). `message` is what the sender is
 * told; `hint` is for the person running the gateway and is only ever written to its log.
 */
export class TokenError extends Error {
  /** @param {string} message @param {string} [hint] */
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

/**
 * Google's keys, kept for as long as Google says (Cache-Control max-age) and fetched again when a token names a key that is
 * not in the list (Google rotates them), but not more than once a minute, so forged tokens cannot make this hammer Google.
 */
export function createKeyCache({ fetchImpl = fetch, now = () => Date.now(), url = GOOGLE_KEYS_URL } = {}) {
  let keys = new Map();
  let expiresAt = 0;
  let fetchedAt = -Infinity;

  async function refresh() {
    fetchedAt = now();
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`Google's keys answered ${response.status}`);
    const { keys: list } = await response.json();
    const next = new Map();
    for (const jwk of Array.isArray(list) ? list : []) {
      if (jwk && jwk.kty === 'RSA' && typeof jwk.kid === 'string') next.set(jwk.kid, jwk);
    }
    keys = next;
    const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '');
    expiresAt = now() + (maxAge ? Number(maxAge[1]) * 1000 : 60 * MINUTE_MS);
  }

  /** @returns {Promise<object | null>} the key (a JWK) with this id, or null */
  return async function getKey(kid) {
    if (now() >= expiresAt || (!keys.has(kid) && now() - fetchedAt >= MINUTE_MS)) await refresh();
    return keys.get(kid) ?? null;
  };
}

function readPart(part) {
  try {
    const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    // falls through to the error below
  }
  throw new TokenError('unreadable token');
}

/**
 * Checks a Firebase ID token the way Firebase's own libraries do: signed (RS256) by one of Google's keys, issued for this
 * project, not expired, and naming a user. Returns the user's uid; throws TokenError when the token cannot be accepted.
 *
 * @param {string} token
 * @param {{ projectId: string, getKey: (kid: string) => Promise<object | null>, now?: () => number }} deps
 */
export async function verifyIdToken(token, { projectId, getKey, now = () => Date.now() }) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw new TokenError('malformed token');
  const [head, body, signature] = parts;

  const header = readPart(head);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new TokenError('wrong signing method');
  const jwk = await getKey(header.kid);
  if (!jwk) throw new TokenError('unknown signing key');

  let genuine = false;
  try {
    genuine = verify(
      'RSA-SHA256',
      Buffer.from(`${head}.${body}`),
      createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(signature, 'base64url')
    );
  } catch {
    genuine = false;
  }
  if (!genuine) throw new TokenError('bad signature');

  const claims = readPart(body);
  const seconds = Math.floor(now() / 1000);
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) {
    // The signature held, so this is a real Firebase token and its project is the app's: the likeliest reason is that the gateway
    // was given something else (the project's name, or another project's id).
    const theirs = typeof claims.aud === 'string' ? claims.aud.slice(0, 80) : '?';
    throw new TokenError(
      'token is for another project',
      `The app is signed in to the Firebase project "${theirs}" but the gateway is set to "${projectId}". Set FIREBASE_PROJECT_ID=${theirs} ` +
        `in server/.env (it must be the app's EXPO_PUBLIC_FIREBASE_PROJECT_ID, the Project ID and not the project's name) and restart the gateway`
    );
  }
  if (typeof claims.exp !== 'number' || claims.exp <= seconds) {
    const late = typeof claims.exp === 'number' ? seconds - claims.exp : 0;
    throw new TokenError(
      'token expired',
      late > 120 ? `The sign-in ran out ${Math.round(late / 60)} minutes ago, which usually means this computer's clock is ahead: check its date and time` : undefined
    );
  }
  if (typeof claims.iat !== 'number' || claims.iat > seconds + 300) {
    const early = typeof claims.iat === 'number' ? claims.iat - seconds : 0;
    throw new TokenError(
      'token is from the future',
      early > 300 ? `The sign-in is dated ${Math.round(early / 60)} minutes ahead of this computer's clock, which is probably behind: check its date and time` : undefined
    );
  }
  if (typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 128) {
    throw new TokenError('token names no user');
  }
  return claims.sub;
}

const isText = (value, max) => typeof value === 'string' && value.length <= max;

/**
 * One push message as the app builds it (utils/push.ts), reduced to the fields it uses. Null when it is not one: a wrong
 * recipient, a field of the wrong kind or size.
 */
export function cleanMessage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!isExpoPushToken(raw.to)) return null;
  const message = { to: raw.to };

  for (const key of ['title', 'subtitle', 'body']) {
    if (raw[key] === undefined) continue;
    if (!isText(raw[key], 1000)) return null;
    message[key] = raw[key];
  }
  if (raw.sound !== undefined) {
    if (raw.sound !== 'default' && raw.sound !== null) return null;
    message.sound = raw.sound;
  }
  if (raw.priority !== undefined) {
    if (!['default', 'normal', 'high'].includes(raw.priority)) return null;
    message.priority = raw.priority;
  }
  if (raw.channelId !== undefined) {
    if (!isText(raw.channelId, 100)) return null;
    message.channelId = raw.channelId;
  }
  if (raw.ttl !== undefined) {
    if (!Number.isInteger(raw.ttl) || raw.ttl < 0 || raw.ttl > 2_419_200) return null; // Expo keeps a message 28 days at most
    message.ttl = raw.ttl;
  }
  if (raw.data !== undefined) {
    if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) return null;
    const entries = Object.entries(raw.data);
    if (entries.length > 40 || entries.some(([key, value]) => key.length > 100 || !isText(value, 2000))) return null;
    message.data = Object.fromEntries(entries);
  }
  return message;
}

/**
 * The messages in a request body: a list, or one message on its own (Expo takes both).
 * @returns {{ messages: object[] } | { error: string }}
 */
export function parsePushBody(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: 'the body is not JSON' };
  }
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0 || list.length > MAX_MESSAGES) return { error: `send between 1 and ${MAX_MESSAGES} messages` };
  const messages = [];
  for (const [index, item] of list.entries()) {
    const message = cleanMessage(item);
    if (!message) return { error: `message ${index + 1} is not a push message this service passes on` };
    messages.push(message);
  }
  return { messages };
}

/**
 * The headers that let a browser page at `origin` read the answer; none when the page is not allowed. The sign-in token, not
 * the address, is what keeps strangers out (a page of another site cannot get one), so "*" is a fair way to allow every page.
 */
export function corsHeaders(origin, allowedOrigins) {
  if (!origin) return {};
  const any = allowedOrigins.includes('*');
  if (!any && !allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': any ? '*' : origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true', // a hosted page reaching a gateway running on the same computer
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** Passes messages on to Expo's push service and returns its answer unchanged, so the web app reads it like a phone does. */
export function createForwarder({ fetchImpl = fetch, accessToken, timeoutMs = 10_000 } = {}) {
  return async function forward(messages) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(messages),
        signal: controller.signal,
      });
      return {
        status: response.status,
        body: await response.text(),
        contentType: response.headers.get('content-type') ?? 'application/json',
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * The service itself, as a function from a request to an answer, so it needs no server to be tested.
 *
 * @param {object} deps
 * @param {string} deps.projectId                                       the Firebase project whose people may use it
 * @param {(kid: string) => Promise<object | null>} deps.getKey         see createKeyCache
 * @param {(messages: object[]) => Promise<{ status: number, body: string, contentType?: string }>} deps.forward
 * @param {string[]} [deps.allowedOrigins]
 * @param {number} [deps.perMinute]                                      how many requests one person may send in a minute
 * @param {() => number} [deps.now]
 * @param {(line: string) => void} [deps.log]                            where it says what it did, in plain words
 * @param {(ids: string[]) => void} [deps.watchReceipts]                 told the ids Expo gave, to look at the receipts later
 * @returns {((request: { method: string, path: string, origin?: string, authorization?: string, body: string }) =>
 *   Promise<{ status: number, headers: Record<string, string>, body: string }>) & { stats: object }}
 */
export function createGateway({
  projectId,
  getKey,
  forward,
  allowedOrigins = ['*'],
  perMinute = 120,
  now = () => Date.now(),
  log = () => {},
  watchReceipts = () => {},
}) {
  const windows = new Map(); // uid -> { start, count }
  /** What the page at "/" shows, so a person can see from the browser that the gateway is there and what it has been doing. */
  const stats = { requests: 0, passedOn: 0, refused: 0, lastProblem: null };
  const who = (uid) => `user ${uid.slice(0, 6)}…`;
  const clock = (at) => new Date(at).toTimeString().slice(0, 8);

  const statusText = () =>
    [
      'SYPH push gateway: running.',
      `Project: ${projectId}`,
      `Since it started: ${stats.requests} request(s) from the app, ${stats.passedOn} notification(s) passed on to Expo, ${stats.refused} refused.`,
      stats.lastProblem ? `Last problem (${clock(stats.lastProblem.at)}): ${stats.lastProblem.text}` : 'Last problem: none.',
      '',
    ].join('\n');

  function overLimit(uid) {
    const at = now();
    if (windows.size > 1000) {
      for (const [key, slot] of windows) if (at - slot.start >= MINUTE_MS) windows.delete(key);
    }
    const slot = windows.get(uid);
    if (!slot || at - slot.start >= MINUTE_MS) {
      windows.set(uid, { start: at, count: 1 });
      return false;
    }
    slot.count += 1;
    return slot.count > perMinute;
  }

  async function handle(request) {
    const cors = corsHeaders(request.origin, allowedOrigins);
    const answer = (status, payload) => ({
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    /** A refusal: answered to the sender in a few words, written to the log with the reason and what to do about it. */
    const refuse = (status, payload, why) => {
      stats.refused += 1;
      stats.lastProblem = { at: now(), text: why };
      log(`Refused: ${why}`);
      return answer(status, payload);
    };

    if (request.origin && Object.keys(cors).length === 0) {
      return refuse(
        403,
        { error: 'this web address may not use the gateway' },
        `a page at ${request.origin} tried to use the gateway, but that web address is not in ALLOWED_ORIGINS (${allowedOrigins.join(', ')}).`
      );
    }
    if (request.method === 'OPTIONS') {
      log(`The browser asked whether the page at ${request.origin ?? 'an unknown address'} may send here: yes.`);
      return { status: 204, headers: cors, body: '' };
    }
    if (request.method === 'GET' && request.path === '/health') {
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'ok' };
    }
    if (request.method === 'GET' && request.path === '/') {
      return { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: statusText() };
    }
    if (request.method !== 'POST') return answer(404, { error: 'not found' });

    stats.requests += 1;
    const bearer = /^Bearer\s+(\S+)$/i.exec(request.authorization ?? '');
    if (!bearer) {
      return refuse(
        401,
        { error: 'sign in again (no sign-in token)' },
        'a request came without a sign-in token: the app was not signed in at that moment, or something other than the app called the gateway.'
      );
    }
    let uid;
    try {
      uid = await verifyIdToken(bearer[1], { projectId, getKey, now });
    } catch (error) {
      if (error instanceof TokenError) {
        return refuse(401, { error: `sign in again (${error.message})` }, `the sign-in was not accepted (${error.message}).${error.hint ? ` ${error.hint}.` : ''}`);
      }
      return refuse(
        503,
        { error: 'could not check the sign-in just now' },
        `could not check a sign-in: ${describeNetworkError(error)}. The gateway has to reach Google (www.googleapis.com) for that: is this computer online?`
      );
    }
    if (overLimit(uid)) {
      return refuse(429, { error: 'too many requests; wait a minute' }, `${who(uid)} sent more than ${perMinute} requests in a minute; the rest are refused until the minute is over.`);
    }

    const parsed = parsePushBody(request.body);
    if ('error' in parsed) {
      return refuse(400, { error: parsed.error }, `the request was not a list of push messages that this gateway passes on (${parsed.error}).`);
    }

    try {
      const result = await forward(parsed.messages);
      const report = readExpoAnswer(result.status, result.body);
      stats.passedOn += report.accepted;
      const kinds = [...new Set(parsed.messages.map((message) => message.data?.type).filter(Boolean))].join(', ') || 'push';
      const from = request.origin ? ` from ${request.origin}` : '';
      const count = parsed.messages.length;
      log(
        `${who(uid)} sent ${count} notification(s) (${kinds})${from}. Expo accepted ${report.accepted}${report.problems.length > 0 ? ` of ${count}, and said:` : '.'}`
      );
      for (const problem of report.problems) {
        stats.lastProblem = { at: now(), text: problem };
        log(`  - ${problem}`);
      }
      watchReceipts(report.ids);
      return {
        status: result.status,
        headers: { ...cors, 'Content-Type': result.contentType ?? 'application/json' },
        body: result.body,
      };
    } catch (error) {
      return refuse(502, { error: 'Expo push service did not answer' }, `could not reach Expo's push service (${describeNetworkError(error)}). Is this computer online?`);
    }
  }

  return Object.assign(handle, { stats });
}
