/**
 * SYPH push gateway: lets the web version of the app wake people's phones. See pushGateway.js for what it does and
 * server/README.md for how to run and host it. It needs no npm install and no service account, only the project id.
 *
 * It writes what it does to the window it runs in: every request from the app, and for a refusal the reason and what to change.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPO_PUSH_URL, createReceiptWatcher, describeNetworkError } from './gatewayReport.js';
import { createGatewayServer } from './gatewayServer.js';
import { applySettingsFiles, chooseProjectId } from './gatewaySettings.js';
import { createForwarder, createGateway, createKeyCache } from './pushGateway.js';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = resolve(serverDir, '..');

const log = (line) => console.log(`${new Date().toTimeString().slice(0, 8)}  ${line}`);

// Most important first: the host's own variables, then server/.env, then the app's settings (.env.local over .env, as Expo reads them).
const { read, missing } = applySettingsFiles([join(serverDir, '.env'), join(appDir, '.env.local'), join(appDir, '.env')], process.env, readFileSync);

const { projectId, source, warnings } = chooseProjectId(process.env);
if (!projectId) {
  console.error('SYPH push gateway: no Firebase project id found.');
  console.error(`  Settings read:      ${read.length > 0 ? read.join(', ') : 'none'}`);
  console.error(`  Settings not found: ${missing.join(', ')}`);
  console.error('  Put this line in server/.env, with the Project ID from Firebase console > Project settings > General:');
  console.error('    FIREBASE_PROJECT_ID=your-project-id');
  process.exit(1);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
// GATEWAY_PORT first: a PORT left in server/.env for the relay must not move the gateway away from the address the app was given.
const port = Number(process.env.GATEWAY_PORT || process.env.PORT || 8787);
const accessToken = process.env.EXPO_ACCESS_TOKEN || undefined;
const getKey = createKeyCache();

const handle = createGateway({
  projectId,
  getKey,
  forward: createForwarder({ accessToken }),
  allowedOrigins,
  log,
  watchReceipts: createReceiptWatcher({ log, accessToken }),
});

/** Says early whether the two things the gateway depends on can be reached, so a firewall or a lost connection shows at once. */
async function checkConnections() {
  try {
    await getKey('self-check');
    log("Check: Google's sign-in keys can be reached, so sign-ins can be verified.");
  } catch (error) {
    log(`CHECK FAILED: cannot reach Google's sign-in keys (${describeNetworkError(error)}). Every request will be refused until this computer can reach www.googleapis.com.`);
  }
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '[]',
      signal: AbortSignal.timeout(10_000),
    });
    log(`Check: Expo's push service can be reached (it answered HTTP ${response.status}).`);
  } catch (error) {
    log(`CHECK FAILED: cannot reach Expo's push service (${describeNetworkError(error)}). Nothing can be delivered until this computer can reach exp.host.`);
  }
}

const server = createGatewayServer({ handle, log });
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`SYPH push gateway: port ${port} is already in use. Is the gateway already running in another window? Close that one, or set GATEWAY_PORT in server/.env.`);
    process.exit(1);
  }
  throw error;
});
server.listen(port, () => {
  const address = `http://localhost:${port}`;
  console.log('SYPH push gateway');
  console.log(`  Project:   ${projectId}  (from ${source})`);
  console.log(`  Settings:  read ${read.length > 0 ? read.join(', ') : 'no file'}${missing.length > 0 ? `; not found: ${missing.join(', ')}` : ''}`);
  console.log(`  Web pages: ${allowedOrigins.includes('*') ? 'any (people still have to be signed in)' : allowedOrigins.join(', ')}`);
  console.log(`  Listening: ${address}/push`);
  console.log("  The app must be told this address: in its .env (or .env.local) put  EXPO_PUBLIC_PUSH_GATEWAY_URL=\"" + address + '/push"');
  console.log('  and restart the web app with  npx expo start --web --clear');
  console.log(`  To see from your browser that it is here, open ${address}/`);
  for (const warning of warnings) console.log(`  WARNING: ${warning}`);
  console.log('  Each request from the app is written below, and the reason when one is refused.');
  console.log('');
  checkConnections().catch(() => {});
});
