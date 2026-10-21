import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  friendlyAuthError,
  isLegacyEmail,
  loginEmailFor,
  looksLikeEmail,
  normalizeUsername,
  usernameOnlyEmail,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../../src/utils/auth.ts';

describe('validateUsername', () => {
  it('accepts normal handles', () => {
    for (const name of ['shlok', 'Shlok_G', 'a.b.c', 'user123', 'abc']) {
      assert.equal(validateUsername(name), null, name);
    }
  });

  it('rejects wrong lengths', () => {
    assert.match(validateUsername('ab')!, /3-20/);
    assert.match(validateUsername('x'.repeat(21))!, /3-20/);
  });

  it('rejects characters that cannot go before @syph.com', () => {
    for (const name of ['has space', 'emoji😀x', 'a@b', 'a/b', 'a+b']) {
      assert.ok(validateUsername(name), name);
    }
  });

  it('rejects leading/trailing punctuation and double dots', () => {
    for (const name of ['.abc', 'abc.', '_abc', 'abc_', 'a..b']) {
      assert.ok(validateUsername(name), name);
    }
  });

  it('ignores surrounding spaces', () => {
    assert.equal(validateUsername('  shlok  '), null);
  });
});

describe('validateEmail', () => {
  it('accepts ordinary addresses', () => {
    assert.equal(validateEmail('me@example.com'), null);
    assert.equal(validateEmail('  first.last+tag@mail.co.in '), null);
  });

  it('rejects malformed addresses', () => {
    for (const e of ['', 'plain', 'a@b', 'a@b.c', 'a b@c.com', '@c.com']) {
      assert.ok(validateEmail(e), JSON.stringify(e));
    }
  });

  it('reserves the username-only domain', () => {
    assert.match(validateEmail('someone@syph.com')!, /reserved/);
    assert.match(validateEmail('x@SYPH.COM')!, /reserved/);
  });
});

describe('validatePassword', () => {
  it('needs six characters', () => {
    assert.ok(validatePassword('12345'));
    assert.equal(validatePassword('123456'), null);
  });
});

describe('sign-in identifiers', () => {
  it('turns a username into its username-only email', () => {
    assert.equal(usernameOnlyEmail('  Shlok '), 'shlok@syph.com');
    assert.equal(loginEmailFor('Shlok'), 'shlok@syph.com');
  });

  it('uses an email as typed, lower-cased', () => {
    assert.equal(loginEmailFor(' Me@Example.COM '), 'me@example.com');
  });

  it('tells emails from usernames', () => {
    assert.equal(looksLikeEmail('a@b.com'), true);
    assert.equal(looksLikeEmail('shlok'), false);
  });

  it('recognises username-only accounts', () => {
    assert.equal(isLegacyEmail('shlok@syph.com'), true);
    assert.equal(isLegacyEmail('Shlok@SYPH.com'), true);
    assert.equal(isLegacyEmail('me@gmail.com'), false);
    assert.equal(isLegacyEmail(null), false);
    assert.equal(isLegacyEmail(undefined), false);
  });

  it('normalises usernames for lookups', () => {
    assert.equal(normalizeUsername('  ShLoK '), 'shlok');
  });
});

describe('friendlyAuthError', () => {
  it('hides which half of the credentials was wrong', () => {
    for (const code of ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password']) {
      assert.equal(friendlyAuthError(code, 'login'), 'Wrong username/email or password.');
    }
  });

  it('reads "email in use" as "username taken" when no email was given', () => {
    assert.equal(friendlyAuthError('auth/email-already-in-use', 'register', false), 'That username is taken.');
    assert.match(friendlyAuthError('auth/email-already-in-use', 'register', true)!, /email already exists/);
  });

  it('covers network, rate limit and recent-login cases', () => {
    assert.match(friendlyAuthError('auth/network-request-failed', 'login')!, /internet/);
    assert.match(friendlyAuthError('auth/too-many-requests', 'login')!, /Too many/);
    assert.match(friendlyAuthError('auth/requires-recent-login', 'email')!, /log out/);
  });

  it('returns null for codes it does not know, so callers can show the raw message', () => {
    assert.equal(friendlyAuthError('auth/something-new', 'login'), null);
    assert.equal(friendlyAuthError(undefined, 'login'), null);
  });
});
