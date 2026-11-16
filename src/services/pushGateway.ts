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

/** A `fetch` that sends the request to Expo's push service to the gateway and passes everything else to `realFetch`. */
export function pushThroughGateway(realFetch: typeof fetch, { expoUrl, gatewayUrl, getToken }: PushGatewayOptions): typeof fetch {
  let explained = false;
  let unreachableTold = false;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (address !== expoUrl) return realFetch(input, init);

    if (!gatewayUrl) {
      if (!explained) {
        explained = true;
        console.info(
          'Phones are not notified of what you send from a browser: Expo\'s push service refuses browsers. ' +
            'To change that, run the push gateway (server/README.md) and set EXPO_PUBLIC_PUSH_GATEWAY_URL.'
        );
      }
      return answer(200, { data: [] });
    }

    const token = await getToken().catch(() => null);
    if (!token) return answer(401, { error: 'not signed in' });

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    try {
      return await realFetch(gatewayUrl, { ...init, headers });
    } catch (error) {
      if (!unreachableTold) {
        unreachableTold = true;
        console.warn(`The push gateway at ${gatewayUrl} did not answer, so phones are not notified. Is it running? (server/README.md)`);
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
