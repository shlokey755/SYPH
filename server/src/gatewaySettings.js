/**
 * gatewaySettings.js
 * Where the push gateway gets its settings: the env files it reads, and which Firebase project it checks sign-ins against.
 * Pure but for the `readFile` passed in, so test/gatewaySettings.test.js needs no files.
 *
 * Node's own `--env-file` flag was used before. It reads only the files it is told to, so `.env.local` (where the app's own
 * settings usually are: .env.example says to copy it there) was never read and the project id was never found; it reads a file
 * written by Windows PowerShell's `>` (UTF-16) as nonsense; and it prints "not found" for every file that does not exist.
 */

import { parseEnv } from 'node:util';
import { looksLikeProjectId } from './gatewayReport.js';

/** The text of an env file whatever wrote it: UTF-8 with or without a byte order mark, or UTF-16 (what PowerShell's `>` makes). */
export function decodeEnvFile(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const even = buffer.subarray(2, 2 + ((buffer.length - 2) & ~1));
    return Buffer.from(even).swap16().toString('utf16le');
  }
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Reads the settings files, most important first, and fills `env` with what it does not have yet. A variable that is already set
 * (by the host, or by a file read before) wins. A blank one counts as not set, so a line copied from .env.example does not hide
 * a real value further down.
 *
 * @param {string[]} files
 * @param {Record<string, string | undefined>} env
 * @param {(file: string) => Buffer} readFile throws when there is no such file
 * @returns {{ read: string[], missing: string[] }}
 */
export function applySettingsFiles(files, env, readFile) {
  const read = [];
  const missing = [];
  for (const file of files) {
    let buffer;
    try {
      buffer = readFile(file);
    } catch {
      missing.push(file);
      continue;
    }
    read.push(file);
    let values = {};
    try {
      values = parseEnv(decodeEnvFile(buffer));
    } catch {
      values = {};
    }
    for (const [key, value] of Object.entries(values)) {
      if (env[key] === undefined || env[key] === '') env[key] = value;
    }
  }
  return { read, missing };
}

/**
 * The Firebase project whose sign-ins the gateway accepts: the app's own EXPO_PUBLIC_FIREBASE_PROJECT_ID, which is what every
 * sign-in token it will see carries; failing that FIREBASE_PROJECT_ID (for a host that has no copy of the app's settings), or the
 * relay's service account key. `warnings` are for the person running it.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ projectId: string, source: string, warnings: string[] }}
 */
export function chooseProjectId(env) {
  const own = (env.FIREBASE_PROJECT_ID ?? '').trim();
  const app = (env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '').trim();
  let account = '';
  try {
    account = String(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}').project_id ?? '').trim();
  } catch {
    account = '';
  }

  const warnings = [];
  let projectId = app || own || account;
  let source = app ? "the app's EXPO_PUBLIC_FIREBASE_PROJECT_ID" : own ? 'FIREBASE_PROJECT_ID' : account ? "the service account key's project_id" : '';
  if (own && app && own !== app) {
    // Every sign-in the gateway will see is for the app's project, so a different FIREBASE_PROJECT_ID could only make it refuse them all.
    warnings.push(`FIREBASE_PROJECT_ID says "${own}" but the app's EXPO_PUBLIC_FIREBASE_PROJECT_ID says "${app}". The app signs in to "${app}", so that is the one used and FIREBASE_PROJECT_ID is ignored. Delete it, or correct it.`);
  }
  if (projectId && !looksLikeProjectId(projectId)) {
    warnings.push(
      `"${projectId}" does not look like a Firebase project ID (6 to 30 characters: lower case letters, digits and hyphens). Use the Project ID from Firebase console > Project settings > General, not the project's name or number.`
    );
  }
  if (!projectId) source = '';
  return { projectId, source, warnings };
}
