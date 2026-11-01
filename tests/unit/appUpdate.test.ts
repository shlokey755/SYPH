import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decideUpdate,
  isActionable,
  isNewerApk,
  parseAppConfig,
  parseBuild,
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

test('parseBuild accepts positive whole numbers only', () => {
  assert.equal(parseBuild('2'), 2);
  assert.equal(parseBuild(' 12 '), 12);
  assert.equal(parseBuild(3), 3);
  for (const bad of ['', '0', '-1', '1.5', '7.5.5', 'abc', '1e3', null, undefined, 0, 1.5]) assert.equal(parseBuild(bad), null);
});

test('parseAppConfig needs a build number and an https link', () => {
  const ok = parseAppConfig({ latestBuild: 2, apkUrl: ' https://expo.dev/artifacts/a.apk ', notes: ' New ' });
  assert.deepEqual(ok, { latestBuild: 2, apkUrl: 'https://expo.dev/artifacts/a.apk', notes: 'New' });
  // typed as text in the Firebase Console is fine too
  assert.equal(parseAppConfig({ latestBuild: '3', apkUrl: 'https://x.dev/a.apk' })!.latestBuild, 3);
  assert.equal(parseAppConfig({ latestBuild: 2, apkUrl: 'http://insecure.example/a.apk' }), null);
  assert.equal(parseAppConfig({ latestBuild: 2, apkUrl: 'javascript:alert(1)' }), null);
  assert.equal(parseAppConfig({ latestBuild: 'soon', apkUrl: 'https://x.dev/a.apk' }), null);
  // the old field name no longer counts: the visible version is not used to compare builds
  assert.equal(parseAppConfig({ latestVersion: '7.6.0', apkUrl: 'https://x.dev/a.apk' }), null);
  assert.equal(parseAppConfig(null), null);
  assert.equal(parseAppConfig({ latestBuild: 1, apkUrl: 'https://x.dev/a.apk', notes: 'x'.repeat(500) })!.notes.length, 300);
});

test('isNewerApk only claims an update for a known, older build', () => {
  const cfg = parseAppConfig({ latestBuild: 2, apkUrl: 'https://x.dev/a.apk' });
  assert.equal(isNewerApk(1, cfg), true);
  assert.equal(isNewerApk(2, cfg), false);
  assert.equal(isNewerApk(3, cfg), false);
  assert.equal(isNewerApk(null, cfg), false);
  assert.equal(isNewerApk(undefined, cfg), false);
  assert.equal(isNewerApk(1, null), false);
});

test('every preview APK gets a higher build number, so the version people see never has to change', () => {
  // The Update button compares build numbers (Android versionCode). Without autoIncrement it would stay 1 forever.
  const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
  assert.equal(eas.build.preview.autoIncrement, true);
  assert.equal(eas.cli.appVersionSource, 'remote');
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
