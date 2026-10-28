import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// EAS skips files listed in .gitignore (and .env is one), so the client values must live in eas.json.
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const REQUIRED = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

test('eas.json base profile carries the Firebase client values', () => {
  const env = eas.build.base?.env ?? {};
  for (const key of REQUIRED) {
    assert.ok(typeof env[key] === 'string' && env[key].length > 0, `${key} missing in eas.json build.base.env`);
  }
});

test('every build profile extends base', () => {
  for (const name of ['development', 'preview', 'production']) {
    assert.equal(eas.build[name]?.extends, 'base', `${name} must extend base`);
  }
});
