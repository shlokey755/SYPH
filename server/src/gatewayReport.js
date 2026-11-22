/**
 * gatewayReport.js
 * What the push gateway tells the person who runs it: why a notification was or was not sent, in plain words. What Expo answered
 * goes in, a sentence comes out. No dependencies; the only network is the fetch that is passed in, so test/gatewayReport.test.js
 * runs without any. gateway.js prints these lines and pushTest.js uses the same ones.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

const EXPO_TOKEN = /^(?:Expo|Exponent)PushToken\[[^\]\s]+\]$/;

/** A phone's push token as Expo hands it out, for example ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]. */
export const isExpoPushToken = (value) => typeof value === 'string' && EXPO_TOKEN.test(value);

/**
 * Firebase project ids are 6 to 30 characters: lower case letters, digits and hyphens, starting with a letter. The project's name
 * ("SYPH") and its number are different things, and the sign-in checks need the id.
 */
export const looksLikeProjectId = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value);

const EXPLANATIONS = {
  DeviceNotRegistered:
    "that phone's push token is no longer valid (the app was removed or reinstalled). It gets a new one the next time someone signs in on it",
  InvalidCredentials:
    'Expo has no working Google (FCM) key for this app, so it cannot reach Android phones. Upload the FCM V1 service account key with `eas credentials` (API.md 1.5)',
  MismatchSenderId:
    "the phone's push token and the Google (FCM) key Expo holds come from different Firebase projects. The app and the key must come from the same project",
  MessageTooBig: 'the notification was over 4 KB',
  MessageRateExceeded: 'too many notifications to that phone in a short time, so Expo is slowing them down',
};

/** A sentence for one ticket or receipt that says `error`. */
export function explainTicketError(ticket) {
  const code = typeof ticket?.details?.error === 'string' ? ticket.details.error : '';
  const message = typeof ticket?.message === 'string' ? ticket.message : '';
  if (code && EXPLANATIONS[code]) return `${code}: ${EXPLANATIONS[code]}`;
  return [code, message].filter(Boolean).join(': ') || 'an error that Expo did not describe';
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Reads Expo's answer to a send: how many notifications it took and what it said about the rest.
 * @returns {{ accepted: number, ids: string[], problems: string[] }}
 */
export function readExpoAnswer(status, text) {
  const value = parseJson(text);
  if (status < 200 || status >= 300) {
    const first = Array.isArray(value?.errors) ? value.errors[0] : null;
    const why = first ? [first.code, first.message].filter(Boolean).join(': ') : 'no reason given';
    return { accepted: 0, ids: [], problems: [`Expo refused the request (HTTP ${status}): ${why}`] };
  }
  const data = value?.data;
  const tickets = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
  if (tickets.length === 0) return { accepted: 0, ids: [], problems: ['Expo answered without saying what became of the notifications'] };

  const ids = [];
  const problems = [];
  let accepted = 0;
  for (const ticket of tickets) {
    if (ticket?.status === 'ok') {
      accepted += 1;
      if (typeof ticket.id === 'string') ids.push(ticket.id);
    } else {
      problems.push(explainTicketError(ticket));
    }
  }
  return { accepted, ids, problems };
}

/**
 * Reads Expo's receipts, which say whether Google took each notification after Expo accepted it.
 * @returns {{ ok: number, seen: string[], problems: string[] }}
 */
export function readReceipts(text) {
  const data = parseJson(text)?.data;
  const seen = [];
  const problems = [];
  let ok = 0;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [id, receipt] of Object.entries(data)) {
      seen.push(id);
      if (receipt?.status === 'ok') ok += 1;
      else problems.push(explainTicketError(receipt));
    }
  }
  return { ok, seen, problems };
}

/** "fetch failed (ENOTFOUND)": the word Node gives and the reason underneath it, which is the part that helps. */
export function describeNetworkError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : undefined;
  const reason = cause && typeof cause === 'object' ? cause.code || cause.message : '';
  return reason && reason !== message ? `${message} (${reason})` : message;
}

/**
 * Asks Expo, a little while after a send, whether Google took what Expo accepted (the receipts). A problem here (an uninstalled app,
 * a missing Google key) never shows in Expo's first answer, so without this it would stay invisible. Receipts are usually ready
 * within seconds; a missing one is asked for again once, then dropped without comment.
 *
 * @param {object} options
 * @param {(line: string) => void} options.log
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.accessToken]
 * @param {number[]} [options.delaysMs]   when to ask, from the send
 * @param {(run: () => void, ms: number) => { unref?: () => void } | void} [options.schedule]
 * @param {number} [options.maxWatched]   most notifications waited on at once
 */
export function createReceiptWatcher({
  log,
  fetchImpl = fetch,
  accessToken,
  delaysMs = [20_000, 120_000],
  schedule = setTimeout,
  maxWatched = 500,
}) {
  let watched = 0;

  async function look(ids, attempt) {
    let remaining = ids;
    try {
      const response = await fetchImpl(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ ids }),
      });
      if (response.ok) {
        const report = readReceipts(await response.text());
        if (report.ok > 0) log(`Google's push service took ${report.ok} notification(s) without a problem.`);
        for (const problem of report.problems) log(`Problem after sending: ${problem}`);
        remaining = ids.filter((id) => !report.seen.includes(id));
      }
    } catch {
      // No answer this time: the ids stay on the list for the next look.
    }
    watched -= ids.length - remaining.length;
    if (remaining.length > 0 && attempt + 1 < delaysMs.length) {
      plan(remaining, attempt + 1, delaysMs[attempt + 1] - delaysMs[attempt]);
    } else {
      watched -= remaining.length;
    }
  }

  function plan(ids, attempt, wait) {
    const timer = schedule(() => void look(ids, attempt), wait);
    timer?.unref?.();
  }

  return function watch(ids) {
    const list = ids.filter((id) => typeof id === 'string');
    if (list.length === 0 || delaysMs.length === 0 || watched + list.length > maxWatched) return;
    watched += list.length;
    plan(list, 0, delaysMs[0]);
  };
}
