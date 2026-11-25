/**
 * pushGateway.ts
 * Sends the web version's push requests through the push gateway (server/src/pushGateway.js) instead of straight to Expo.
 *
 * A phone wakes the other person's phone by posting to Expo's push service itself (services/pushSender.ts). A browser may not:
 * the service sends no CORS headers, so the browser refuses the request ("Failed to fetch") and nothing is ever delivered. The
 * gateway is a small server that takes the same messages from the web app, checks the sender is signed in, and posts them to
 * Expo from a place where that rule does not apply.
 *
 * pushSender.ts is shared with the phone and must not change for this, so the web layout (app/_layout.web.tsx) replaces the
 * browser's `fetch` with one that sends the single request to Expo's address to the gateway, with the user's Firebase sign-in
 * token, and leaves every other request alone. Nothing here runs on a phone.
 *
 * Where no gateway is set up, the request is answered with an empty "nothing to deliver" instead of being sent: it could only
 * fail, and failing six times a minute in the console hides real problems.
 *
 * The console says what happens to the one request that matters: once that the gateway is in use, once for each way it refuses
 * (the gateway's own window says why in detail), and once when it does not answer at all. Before this a refusal showed only as
 * "Push service answered 401", which says nothing about which side to fix.
 */

export interface PushGatewayOptions {
  /** Where Expo's push service is, as services/pushSender.ts addresses it (utils/push.ts EXPO_PUSH_URL). */
  expoUrl: string;
  /** The gateway's address (EXPO_PUBLIC_PUSH_GATEWAY_URL); nothing when none is set up. */
  gatewayUrl: string | undefined;
  /** The signed-in person's Firebase ID token, or null when nobody is signed in. */
  getToken: () => Promise<string | null>;
}

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The page the gateway shows at the root of its address, which a person can open to see that it is there. */
function statusPage(gatewayUrl: string): string {
  try {
    return new URL('/', gatewayUrl).href;
  } catch {
    return gatewayUrl;
  }
}

/** A `fetch` that sends the request to Expo's push service to the gateway and passes everything else to `realFetch`. */
export function pushThroughGateway(realFetch: typeof fetch, { expoUrl, gatewayUrl, getToken }: PushGatewayOptions): typeof fetch {
  let explained = false;
  let unreachableTold = false;
  let reachedTold = false;
  const refusalsTold = new Set<string>();

  /** Says, once for each kind, what the gateway answered when it did not take the notification. Reads a copy: the caller still gets the answer whole. */
  const reportAnswer = (response: Response) => {
    if (response.ok) {
      if (!reachedTold) {
        reachedTold = true;
        console.info(`Phones are notified through the push gateway at ${gatewayUrl}.`);
      }
      return;
    }
    void response
      .clone()
      .json()
      .catch(() => null)
      .then((body: { error?: unknown } | null) => {
        const why = typeof body?.error === 'string' && body.error ? `: ${body.error}` : '';
        const text = `Phones were not notified: the push gateway answered HTTP ${response.status}${why}. The window the gateway runs in says why.`;
        if (refusalsTold.has(text)) return;
        refusalsTold.add(text);
        console.warn(text);
      });
  };

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (address !== expoUrl) return realFetch(input, init);

    if (!gatewayUrl) {
      if (!explained) {
        explained = true;
        console.info(
          'Phones are not notified of what you send from a browser: Expo\'s push service refuses browsers. ' +
            'To change that, run the push gateway (server/README.md), put EXPO_PUBLIC_PUSH_GATEWAY_URL in .env or .env.local, ' +
            'and restart with `npx expo start --web --clear` (the setting is read when the web app starts).'
        );
      }
      return answer(200, { data: [] });
    }

    const token = await getToken().catch(() => null);
    if (!token) return answer(401, { error: 'not signed in' });

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    try {
      const response = await realFetch(gatewayUrl, { ...init, headers });
      reportAnswer(response);
      return response;
    } catch (error) {
      if (!unreachableTold) {
        unreachableTold = true;
        console.warn(
          `The push gateway at ${gatewayUrl} did not answer, so phones are not notified. Is it running? (server/README.md) ` +
            `Open ${statusPage(gatewayUrl)} in this browser: it should say "SYPH push gateway: running". If it does not, the gateway is not running, ` +
            'is at another address, or the browser is blocking this page from reaching it.'
        );
      }
      throw error;
    }
  }) as typeof fetch;
}

const INSTALLED = '__syphPushGateway';

/** Puts `pushThroughGateway` in place of `scope.fetch` (the browser's window), once, however often the layout is reloaded. */
export function installPushGateway(scope: { fetch: typeof fetch }, options: PushGatewayOptions): void {
  const marked = scope as { fetch: typeof fetch } & Record<string, unknown>;
  if (marked[INSTALLED]) return;
  marked[INSTALLED] = true;
  scope.fetch = pushThroughGateway(scope.fetch.bind(scope), options);
}
