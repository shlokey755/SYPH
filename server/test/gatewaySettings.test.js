import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applySettingsFiles, chooseProjectId, decodeEnvFile } from '../src/gatewaySettings.js';

describe('decodeEnvFile', () => {
  it('reads plain UTF-8, with or without a byte order mark', () => {
    assert.equal(decodeEnvFile(Buffer.from('A=1\n')), 'A=1\n');
    assert.equal(decodeEnvFile(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('A=1\n')])), 'A=1\n');
  });

  it('reads UTF-16, which Windows PowerShell\'s > makes', () => {
    const little = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('A=1\r\n', 'utf16le')]);
    assert.equal(decodeEnvFile(little), 'A=1\r\n');
    const big = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(Buffer.from('A=1\r\n', 'utf16le')).swap16()]);
    assert.equal(decodeEnvFile(big), 'A=1\r\n');
  });

  it('copes with an empty file', () => {
    assert.equal(decodeEnvFile(Buffer.alloc(0)), '');
  });
});

describe('applySettingsFiles', () => {
  const files = { first: 'A=one\nB=\n', second: 'A=two\nB=from second\nC="quoted value"\r\nD = spaced\r\n' };
  const readFile = (file) => {
    if (!(file in files)) throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
    return Buffer.from(files[file]);
  };

  it('fills in what is missing from the files, most important first', () => {
    const env = {};
    const result = applySettingsFiles(['first', 'second'], env, readFile);
    assert.equal(env.A, 'one', 'the file read first wins');
    assert.equal(env.B, 'from second', 'a blank line does not hide a real value');
    assert.equal(env.C, 'quoted value');
    assert.equal(env.D, 'spaced');
    assert.deepEqual(result, { read: ['first', 'second'], missing: [] });
  });

  it('leaves alone what the host has already set', () => {
    const env = { A: 'from the host' };
    applySettingsFiles(['first', 'second'], env, readFile);
    assert.equal(env.A, 'from the host');
  });

  it('says which files were not there, and carries on without them', () => {
    const env = {};
    const result = applySettingsFiles(['nothing', 'second', 'nothing-either'], env, readFile);
    assert.deepEqual(result, { read: ['second'], missing: ['nothing', 'nothing-either'] });
    assert.equal(env.A, 'two');
  });

  it('reads a file that PowerShell wrote in UTF-16', () => {
    const env = {};
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('FIREBASE_PROJECT_ID=syph-abc123\r\n', 'utf16le')]);
    applySettingsFiles(['x'], env, () => utf16);
    assert.equal(env.FIREBASE_PROJECT_ID, 'syph-abc123');
  });
});

describe('chooseProjectId', () => {
  it('uses the app\'s own project id, which every sign-in token carries', () => {
    const result = chooseProjectId({ EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'syph-abc123' });
    assert.equal(result.projectId, 'syph-abc123');
    assert.match(result.source, /EXPO_PUBLIC_FIREBASE_PROJECT_ID/);
    assert.deepEqual(result.warnings, []);
  });

  it('uses FIREBASE_PROJECT_ID when there is no copy of the app\'s settings, as on a host', () => {
    const result = chooseProjectId({ FIREBASE_PROJECT_ID: ' syph-abc123 ' });
    assert.equal(result.projectId, 'syph-abc123');
    assert.equal(result.source, 'FIREBASE_PROJECT_ID');
  });

  it('falls back to the relay\'s service account key', () => {
    const result = chooseProjectId({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'syph-abc123' }) });
    assert.equal(result.projectId, 'syph-abc123');
    assert.match(result.source, /service account/);
  });

  it('prefers the app\'s id when FIREBASE_PROJECT_ID says something else, and says so', () => {
    const result = chooseProjectId({ FIREBASE_PROJECT_ID: 'syph-old1', EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'syph-abc123' });
    assert.equal(result.projectId, 'syph-abc123');
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /syph-old1.*syph-abc123.*ignored/);
  });

  it('says so when what it was given is not a project id (a project\'s name, say)', () => {
    const result = chooseProjectId({ FIREBASE_PROJECT_ID: 'syph' });
    assert.equal(result.projectId, 'syph');
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /does not look like a Firebase project ID/);
  });

  it('finds nothing without complaint, and survives a damaged key', () => {
    assert.deepEqual(chooseProjectId({}), { projectId: '', source: '', warnings: [] });
    assert.equal(chooseProjectId({ FIREBASE_SERVICE_ACCOUNT_JSON: '{not json' }).projectId, '');
  });
});
