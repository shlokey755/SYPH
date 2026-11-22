/**
 * pushTest.js
 * Sends one test notification straight to a phone, from this computer, and says what Expo and Google did with it. It takes the web
 * app and the gateway out of the picture, so when the web version does not wake a phone it shows which half is at fault:
 *
 *   - this works and the web app still does not: the gateway or the web app's settings (the gateway's window says which);
 *   - this does not work: Expo's Google (FCM) key, the phone's token, or the phone itself (the lines below say which).
 *
 *   npm run push:test -- "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"           a message notification
 *   npm run push:test -- "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" --call    a call (a phone with the newest build rings)
 *
 * The token is in Firebase console > Firestore > userPush > (the phone owner's user id) > tokens. Keep the quotes: the brackets
 * mean something to some shells.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { EXPO_PUSH_URL, EXPO_RECEIPTS_URL, describeNetworkError, isExpoPushToken, readExpoAnswer, readReceipts } from './gatewayReport.js';
import { applySettingsFiles } from './gatewaySettings.js';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
applySettingsFiles([join(serverDir, '.env')], process.env, readFileSync);
const accessToken = process.env.EXPO_ACCESS_TOKEN || undefined;

const args = process.argv.slice(2);
const asCall = args.includes('--call');
const token = args.find((arg) => !arg.startsWith('--'));

if (!isExpoPushToken(token)) {
  console.error('Give the phone\'s push token, in quotes:');
  console.error('  npm run push:test -- "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"');
  console.error('Add --call to send a call instead of a message. The token is in Firebase console > Firestore > userPush > (user id) > tokens.');
  process.exit(1);
}

const message = asCall
  ? {
      to: token,
      title: 'SYPH test',
      body: 'Incoming voice call',
      sound: 'default',
      priority: 'high',
      ttl: 30,
      channelId: 'calls',
      data: { type: 'call', conversationId: 'push-test', callId: 'push-test' },
    }
  : {
      to: token,
      title: 'SYPH test',
      body: 'If you can read this, notifications reach this phone.',
      sound: 'default',
      priority: 'high',
      channelId: 'messages',
      data: { type: 'message', conversationId: 'push-test' },
    };

async function post(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, text: await response.text() };
}

const SHORT = `${token.slice(0, 22)}…${token.slice(-6)}`;
console.log(`Sending a test ${asCall ? 'call' : 'message'} notification to ${SHORT} ...`);

let sent;
try {
  sent = await post(EXPO_PUSH_URL, [message]);
} catch (error) {
  console.error(`Could not reach Expo's push service (${describeNetworkError(error)}). This computer cannot reach exp.host: check the connection and any firewall.`);
  process.exit(1);
}

const answer = readExpoAnswer(sent.status, sent.text);
if (answer.accepted === 0) {
  console.error('Expo did NOT accept it:');
  for (const problem of answer.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('Expo accepted it. Now asking whether Google took it (this can take a little while) ...');

let verdict = 'none';
for (const wait of [10_000, 20_000, 30_000]) {
  await sleep(wait);
  let receipts;
  try {
    receipts = readReceipts((await post(EXPO_RECEIPTS_URL, { ids: answer.ids })).text);
  } catch {
    continue;
  }
  if (receipts.problems.length > 0) {
    console.error('Google did NOT take it:');
    for (const problem of receipts.problems) console.error(`  - ${problem}`);
    verdict = 'refused';
    break;
  }
  if (receipts.ok > 0) {
    console.log("Google's push service took it without a problem.");
    verdict = 'ok';
    break;
  }
}
if (verdict === 'refused') process.exit(1);
if (verdict === 'none') console.log('No receipt yet. That is normal for a minute or two; this does not mean it failed.');

console.log('');
console.log(asCall ? 'A phone with the newest build rings for up to 45 seconds (it is a made-up call: decline it or let it time out).' : 'Look at the phone now.');
console.log('If the phone showed nothing, the push got as far as Google, so check the phone:');
console.log('  - SYPH was opened and signed in on it once, and notifications were allowed (Android 13 and later ask).');
console.log('  - Android Settings > Apps > SYPH > Notifications is on, including the "Calls" and "Messages" kinds.');
console.log('  - Xiaomi, Oppo, Vivo, Realme, OnePlus, Huawei and Samsung (sleeping apps) stop notifications once the app is swiped away: set');
console.log('    SYPH\'s battery use to "Unrestricted" and allow auto-start.');
console.log('  - "Force stop" in the app\'s info page stops them until SYPH is opened again. Do Not Disturb silences them too.');
console.log('  - The token must be the phone\'s current one: it changes when the app is reinstalled (the sign-in registers a new one).');
