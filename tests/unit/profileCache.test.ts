import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCachedProfile, profileCacheKey, serializeProfile } from '../../src/utils/profileCache.ts';

const profile = {
  uid: 'u1',
  username: 'Alice',
  usernameLowercase: 'alice',
  displayName: 'Alice A',
  theme: 'ocean',
  createdAt: new Date(),
};

describe('profile cache', () => {
  it('round-trips the fields the app needs and drops timestamps', () => {
    const raw = serializeProfile(profile);
    assert.equal(raw.includes('createdAt'), false);
    assert.deepEqual(parseCachedProfile(raw, 'u1'), {
      uid: 'u1',
      username: 'Alice',
      usernameLowercase: 'alice',
      displayName: 'Alice A',
      theme: 'ocean',
    });
  });

  it('ignores a copy that belongs to another account', () => {
    assert.equal(parseCachedProfile(serializeProfile(profile), 'someone-else'), null);
  });

  it('ignores missing, corrupt or incomplete data', () => {
    assert.equal(parseCachedProfile(null, 'u1'), null);
    assert.equal(parseCachedProfile(undefined, 'u1'), null);
    assert.equal(parseCachedProfile('', 'u1'), null);
    assert.equal(parseCachedProfile('{not json', 'u1'), null);
    assert.equal(parseCachedProfile('"a string"', 'u1'), null);
    assert.equal(parseCachedProfile('null', 'u1'), null);
    assert.equal(parseCachedProfile(JSON.stringify({ uid: 'u1' }), 'u1'), null);
  });

  it('falls back to the username when there is no display name, and drops wrongly typed fields', () => {
    const raw = JSON.stringify({ uid: 'u1', username: 'bob', displayName: 5, theme: 7 });
    assert.deepEqual(parseCachedProfile(raw, 'u1'), {
      uid: 'u1',
      username: 'bob',
      usernameLowercase: undefined,
      displayName: 'bob',
      theme: undefined,
    });
  });

  it('still reads a copy saved before photos and status were removed, without the removed fields', () => {
    const raw = JSON.stringify({ uid: 'u1', username: 'bob', displayName: 'Bob', profileImageUrl: 'https://x/y.jpg', status: 'hi' });
    const parsed = parseCachedProfile(raw, 'u1');
    assert.equal(parsed?.username, 'bob');
    assert.equal('profileImageUrl' in (parsed ?? {}), false);
    assert.equal('status' in (parsed ?? {}), false);
  });

  it('uses a per-account, versioned storage key', () => {
    assert.notEqual(profileCacheKey('u1'), profileCacheKey('u2'));
    assert.match(profileCacheKey('u1'), /^syph\.profile\.v\d+\.u1$/);
  });
});
