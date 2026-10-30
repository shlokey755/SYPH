import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareVersions,
  decideUpdate,
  isActionable,
  isNewerApk,
  parseAppConfig,
  parseVersion,
  type UpdateInputs,
} from '../../src/utils/appUpdate.ts';

const base: UpdateInputs = {
  otaEnabled: true,
  isChecking: false,
  isDownloading: false,
  isUpdatePending: false,
  isUpdateAvailable: false,
  hasError: false,
  apkNewer: false,
};

test('parseVersion accepts dotted numbers only', () => {
  assert.deepEqual(parseVersion('7.6.0'), [7, 6, 0]);
  assert.deepEqual(parseVersion(' v7.6 '), [7, 6]);
  for (const bad of ['', 'abc', '7..6', '7.6.0-beta', '1.2.3.4.5', null, 7]) assert.equal(parseVersion(bad), null);
});

test('compareVersions orders numerically, not as text', () => {
  assert.equal(compareVersions('7.5.5', '7.6.0'), -1);
  assert.equal(compareVersions('7.10.0', '7.9.9'), 1);
  assert.equal(compareVersions('7.6', '7.6.0'), 0);
  assert.equal(compareVersions('7.6.0', 'x'), null);
});

test('parseAppConfig needs a version and an https link', () => {
  const ok = parseAppConfig({ latestVersion: 'v7.6.0', apkUrl: ' https://expo.dev/artifacts/a.apk ', notes: ' New ' });
  assert.deepEqual(ok, { latestVersion: '7.6.0', apkUrl: 'https://expo.dev/artifacts/a.apk', notes: 'New' });
  assert.equal(parseAppConfig({ latestVersion: '7.6.0', apkUrl: 'http://insecure.example/a.apk' }), null);
  assert.equal(parseAppConfig({ latestVersion: '7.6.0', apkUrl: 'javascript:alert(1)' }), null);
  assert.equal(parseAppConfig({ latestVersion: 'soon', apkUrl: 'https://x.dev/a.apk' }), null);
  assert.equal(parseAppConfig(null), null);
  assert.equal(parseAppConfig({ latestVersion: '1.0.0', apkUrl: 'https://x.dev/a.apk', notes: 'x'.repeat(500) })!.notes.length, 300);
});

test('isNewerApk only claims an update for a known, older install', () => {
  const cfg = parseAppConfig({ latestVersion: '7.6.0', apkUrl: 'https://x.dev/a.apk' });
  assert.equal(isNewerApk('7.5.5', cfg), true);
  assert.equal(isNewerApk('7.6.0', cfg), false);
  assert.equal(isNewerApk('7.7.0', cfg), false);
  assert.equal(isNewerApk(null, cfg), false);
  assert.equal(isNewerApk('7.5.5', null), false);
});

test('decideUpdate priorities', () => {
  assert.equal(decideUpdate(base), 'current');
  assert.equal(decideUpdate({ ...base, otaEnabled: false }), 'dev');
  assert.equal(decideUpdate({ ...base, isChecking: true }), 'checking');
  assert.equal(decideUpdate({ ...base, isUpdateAvailable: true }), 'ota-available');
  assert.equal(decideUpdate({ ...base, isUpdateAvailable: true, isUpdatePending: true }), 'ota-ready');
  assert.equal(decideUpdate({ ...base, hasError: true }), 'error');
  // a newer APK wins over OTA, and works even where OTA is off
  assert.equal(decideUpdate({ ...base, apkNewer: true, isUpdateAvailable: true }), 'apk-available');
  assert.equal(decideUpdate({ ...base, apkNewer: true, otaEnabled: false }), 'apk-available');
  // a running download is never replaced by another offer
  assert.equal(decideUpdate({ ...base, apkNewer: true, isDownloading: true }), 'downloading');
});

test('only real updates make the button active', () => {
  const active = ['apk-available', 'ota-ready', 'ota-available'] as const;
  for (const kind of active) assert.equal(isActionable(kind), true);
  for (const kind of ['downloading', 'checking', 'error', 'current', 'dev'] as const) assert.equal(isActionable(kind), false);
});
