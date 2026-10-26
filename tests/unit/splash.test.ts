import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SPLASH_MAX_WAIT_MS, SPLASH_MIN_VISIBLE_MS, splashHideDelay } from '../../src/utils/splash.ts';

const START = 1_000_000;

test('waits while the app is not ready', () => {
  assert.equal(splashHideDelay({ startedAt: START, now: START + 100, ready: false }), null);
  assert.equal(splashHideDelay({ startedAt: START, now: START + SPLASH_MAX_WAIT_MS - 1, ready: false }), null);
});

test('a fast start still shows the logo for the minimum time', () => {
  assert.equal(splashHideDelay({ startedAt: START, now: START + 100, ready: true }), SPLASH_MIN_VISIBLE_MS - 100);
  assert.equal(splashHideDelay({ startedAt: START, now: START, ready: true }), SPLASH_MIN_VISIBLE_MS);
});

test('hides at once when the minimum time has already passed', () => {
  assert.equal(splashHideDelay({ startedAt: START, now: START + SPLASH_MIN_VISIBLE_MS, ready: true }), 0);
  assert.equal(splashHideDelay({ startedAt: START, now: START + 3_000, ready: true }), 0);
});

test('hides after the maximum wait even when the app never becomes ready', () => {
  assert.equal(splashHideDelay({ startedAt: START, now: START + SPLASH_MAX_WAIT_MS, ready: false }), 0);
  assert.equal(splashHideDelay({ startedAt: START, now: START + SPLASH_MAX_WAIT_MS + 5_000, ready: false }), 0);
});

test('a clock that moved backwards does not break the answer', () => {
  assert.equal(splashHideDelay({ startedAt: START, now: START - 5_000, ready: true }), SPLASH_MIN_VISIBLE_MS);
  assert.equal(splashHideDelay({ startedAt: START, now: START - 5_000, ready: false }), null);
});

test('limits can be overridden', () => {
  assert.equal(splashHideDelay({ startedAt: 0, now: 50, ready: true, minVisibleMs: 200 }), 150);
  assert.equal(splashHideDelay({ startedAt: 0, now: 600, ready: false, maxWaitMs: 500 }), 0);
});

test('the minimum is shorter than the maximum', () => {
  assert.ok(SPLASH_MIN_VISIBLE_MS < SPLASH_MAX_WAIT_MS);
});

test('the splash in app.json uses an image that exists, on a black background in light and dark', () => {
  const config = JSON.parse(readFileSync('app.json', 'utf8'));
  const entry = (config.expo.plugins as unknown[]).find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen') as
    | [string, { image: string; backgroundColor: string; dark?: { backgroundColor?: string; image?: string } }]
    | undefined;
  assert.ok(entry, 'app.json must configure expo-splash-screen');
  const options = entry[1];
  assert.ok(existsSync(options.image), `splash image is missing: ${options.image}`);
  // The app is always dark ("userInterfaceStyle": "dark") and its first screen is black: a white splash would flash.
  assert.equal(options.backgroundColor.toLowerCase(), '#000000');
  assert.equal((options.dark?.backgroundColor ?? options.backgroundColor).toLowerCase(), '#000000');
  assert.ok(!options.dark?.image || existsSync(options.dark.image), 'dark splash image is missing');
});
