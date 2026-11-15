/**
 * SYPH push gateway: lets the web version of the app wake people's phones. See pushGateway.js for what it does and
 * server/README.md for how to run and host it. It needs no npm install and no service account, only the project id.
 */

import { createServer } from 'node:http';
import { MAX_BODY_BYTES, createForwarder, createGateway, createKeyCache } from './pushGateway.js';

/** The project id: set on its own, the same variable the app uses, or read from the relay's service account key. */
function findProjectId() {
  const named = process.env.FIREBASE_PROJECT_ID || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (named) return named.trim();
  try {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}').project_id || '';
  } catch {
    return '';
  }
}

const projectId = findProjectId();
if (!projectId) {
  console.error('SYPH push gateway: set FIREBASE_PROJECT_ID in server/.env (the project id from the Firebase console).');
  process.exit(1);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const port = Number(process.env.PORT || process.env.GATEWAY_PORT || 8787);

const handle = createGateway({
  projectId,
  getKey: createKeyCache(),
  forward: createForwarder({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined }),
  allowedOrigins,
});

/**
 * The request body as text, or null when it is longer than MAX_BODY_BYTES. A body that is too long is answered at once and the
 * rest of it is read and thrown away, so the answer can still reach the sender (closing the connection would hide it).
 */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLong = false;
    request.on('data', (chunk) => {
      if (tooLong) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLong = true;
        chunks.length = 0;
        resolve(null);
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => {
      if (!tooLong) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://gateway');
    const body = await readBody(request);
    if (body === null) {
      response.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
      response.end(JSON.stringify({ error: 'request too large' }));
      return;
    }
    const answer = await handle({
      method: request.method ?? 'GET',
      path: url.pathname,
      origin: request.headers.origin,
      authorization: request.headers.authorization,
      body,
    });
    response.writeHead(answer.status, answer.headers);
    response.end(answer.body);
  } catch (error) {
    console.warn('SYPH push gateway: a request failed:', error instanceof Error ? error.message : error);
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'gateway error' }));
  }
}).listen(port, () => {
  console.log(`SYPH push gateway started on port ${port} for project ${projectId}`);
  console.log(`Allowed web addresses: ${allowedOrigins.join(', ')}`);
});
