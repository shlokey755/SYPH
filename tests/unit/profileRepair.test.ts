import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { profileRepairPatch } from '../../src/utils/profileRepair.ts';

describe('profile repair (so other people can find an account by username)', () => {
  it('leaves a healthy profile alone', () => {
    assert.equal(profileRepairPatch({ uid: 'u1', username: 'Shlok', usernameLowercase: 'shlok' }, 'u1'), null);
  });

  it('adds a missing lowercase name', () => {
    assert.deepEqual(profileRepairPatch({ uid: 'u1', username: 'Shlok' }, 'u1'), { usernameLowercase: 'shlok' });
  });

  it('lowercases a name that was saved with capitals', () => {
    assert.deepEqual(profileRepairPatch({ uid: 'u1', username: 'Shlok', usernameLowercase: 'Shlok' }, 'u1'), {
      usernameLowercase: 'shlok',
    });
  });

  it('adds a missing or wrong uid', () => {
    assert.deepEqual(profileRepairPatch({ username: 'a', usernameLowercase: 'a' }, 'u1'), { uid: 'u1' });
    assert.deepEqual(profileRepairPatch({ uid: 'other', username: 'a', usernameLowercase: 'a' }, 'u1'), { uid: 'u1' });
  });

  it('fixes both at once', () => {
    assert.deepEqual(profileRepairPatch({ username: ' Mixed.Case ' }, 'u1'), {
      uid: 'u1',
      usernameLowercase: 'mixed.case',
    });
  });

  it('does not invent a name when the profile has none', () => {
    assert.deepEqual(profileRepairPatch({ uid: 'u1' }, 'u1'), null);
    assert.deepEqual(profileRepairPatch({ uid: 'u1', username: '   ' }, 'u1'), null);
    assert.deepEqual(profileRepairPatch({ uid: 'u1', username: 42 as unknown }, 'u1'), null);
  });
});
