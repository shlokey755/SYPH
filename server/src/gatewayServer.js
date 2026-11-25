/**
 * gatewayServer.js
 * The HTTP side of the push gateway: reads each request, hands it to the gateway (pushGateway.js) and writes the answer back.
 * Kept apart from gateway.js, which starts it from the command line, so that test/gatewayServer.test.js can run the real thing on
 * a spare port with nothing but Node.
 */

import { createServer } from 'node:http';
import { MAX_BODY_BYTES } from './pushGateway.js';

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

/**
 * @param {object} options
 * @param {(request: object) => Promise<{ status: number, headers: Record<string, string>, body: string }>} options.handle   see createGateway
 * @param {(line: string) => void} [options.log]
 * @returns {import('node:http').Server} not listening yet
 */
export function createGatewayServer({ handle, log = () => {} }) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://gateway');
      const body = await readBody(request);
      if (body === null) {
        log('Refused: a request was larger than the gateway takes (256 KB).');
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
      log(`A request failed inside the gateway: ${error instanceof Error ? error.message : error}`);
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'gateway error' }));
    }
  });
}
