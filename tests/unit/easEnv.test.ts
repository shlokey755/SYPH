import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { REQUIRED, missingKeys } = require('../../scripts/check-eas-env.cjs');
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));

test('eas.json holds no values and each profile names its EAS environment', () => {
  assert.ok(!JSON.stringify(eas).includes('EXPO_PUBLIC_'), 'keep EXPO_PUBLIC_ values out of eas.json');
  for (const name of ['development', 'preview', 'production']) {
    assert.equal(eas.build[name]?.environment, name);
  }
});

test('the pre-install hook is wired in package.json', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['eas-build-pre-install'], 'node scripts/check-eas-env.cjs');
});

test('missingKeys flags absent and blank values', () => {
  assert.deepEqual(missingKeys({}), REQUIRED);
  const full = Object.fromEntries(REQUIRED.map((k) => [k, 'x']));
  assert.deepEqual(missingKeys(full), []);
  assert.deepEqual(missingKeys({ ...full, EXPO_PUBLIC_FIREBASE_API_KEY: '  ' }), ['EXPO_PUBLIC_FIREBASE_API_KEY']);
});
