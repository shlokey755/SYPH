import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emailLine,
  needsSharing,
  parseShared,
  serializeShared,
  shareKey,
  sharedEmailOf,
  withShared,
} from '../../src/utils/contactEmail.ts';

describe('what was found in the chat (sharedEmailOf)', () => {
  it('nothing there means it has not been shared yet', () => {
    assert.deepEqual(sharedEmailOf(false, undefined), { status: 'notShared', email: '' });
  });

  it('an empty email means no real email', () => {
    assert.deepEqual(sharedEmailOf(true, ''), { status: 'none', email: '' });
    assert.deepEqual(sharedEmailOf(true, '   '), { status: 'none', email: '' });
    assert.deepEqual(sharedEmailOf(true, undefined), { status: 'none', email: '' });
    assert.deepEqual(sharedEmailOf(true, 42), { status: 'none', email: '' });
  });

  it('an email is shown as it was shared', () => {
    assert.deepEqual(sharedEmailOf(true, ' a@b.co '), { status: 'email', email: 'a@b.co' });
  });
});

describe('the line under "Email" (emailLine)', () => {
  it('says what is going on in each case', () => {
    assert.equal(emailLine({ status: 'email', email: 'a@b.co' }), 'a@b.co');
    assert.equal(emailLine({ status: 'none', email: '' }), 'No email added');
    assert.equal(emailLine({ status: 'notShared', email: '' }), 'Not shared yet');
    assert.equal(emailLine({ status: 'error', email: '' }), 'Could not load');
    assert.equal(emailLine({ status: 'loading', email: '' }), '...');
  });
});

describe('what this phone has already shared', () => {
  it('shares into a chat that has not had it, and not again', () => {
    let map = parseShared(null);
    assert.equal(needsSharing(map, 'me', 'chat1', 'a@b.co'), true);
    map = withShared(map, 'me', 'chat1', 'a@b.co');
    assert.equal(needsSharing(map, 'me', 'chat1', 'a@b.co'), false);
    assert.equal(needsSharing(map, 'me', 'chat2', 'a@b.co'), true);
  });

  it('shares again when the email changed, or went away', () => {
    const map = withShared({}, 'me', 'chat1', 'a@b.co');
    assert.equal(needsSharing(map, 'me', 'chat1', 'new@b.co'), true);
    assert.equal(needsSharing(map, 'me', 'chat1', ''), true);
  });

  it('an empty email is shared once too', () => {
    const map = withShared({}, 'me', 'chat1', '');
    assert.equal(needsSharing(map, 'me', 'chat1', ''), false);
  });

  it('keeps accounts on one phone apart', () => {
    const map = withShared({}, 'me', 'chat1', 'a@b.co');
    assert.equal(needsSharing(map, 'someone-else', 'chat1', 'a@b.co'), true);
    assert.equal(shareKey('me', 'chat1'), 'me/chat1');
  });

  it('round-trips through the saved text, and shrugs off rubbish', () => {
    const map = withShared(withShared({}, 'me', 'c1', 'a@b.co'), 'me', 'c2', '');
    assert.deepEqual(parseShared(serializeShared(map)), map);
    assert.deepEqual(parseShared(''), {});
    assert.deepEqual(parseShared('not json'), {});
    assert.deepEqual(parseShared('[1,2]'), {});
    assert.deepEqual(parseShared('{"me/c1":"a@b.co","me/c2":5}'), { 'me/c1': 'a@b.co' });
  });
});
