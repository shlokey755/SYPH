import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PEOPLE_ON_DIRECT_CALL,
  addableResults,
  limitText,
  maxAddable,
  movedConversationId,
  togglePick,
  upgradeGroupName,
} from '../../src/utils/callUpgrade.ts';
import { endReasonText } from '../../src/utils/call.ts';

const person = (uid: string, username = uid) => ({ uid, username });

describe('how many people can be added', () => {
  it('two are already on the call', () => {
    assert.equal(PEOPLE_ON_DIRECT_CALL, 2);
  });

  it('follows the group call limits: 6 voice, 4 video', () => {
    assert.equal(maxAddable(6), 4);
    assert.equal(maxAddable(4), 2);
  });

  it('never goes below zero', () => {
    assert.equal(maxAddable(2), 0);
    assert.equal(maxAddable(1), 0);
    assert.equal(maxAddable(0), 0);
  });
});

describe('search results to offer', () => {
  it('leaves out you, the person on the call and anyone already picked', () => {
    const results = [person('me'), person('bob'), person('cy'), person('di')];
    assert.deepEqual(
      addableResults(results, ['me', 'bob', 'cy']).map((r) => r.uid),
      ['di']
    );
  });

  it('lists each person once', () => {
    assert.deepEqual(
      addableResults([person('a'), person('a'), person('b')], []).map((r) => r.uid),
      ['a', 'b']
    );
  });

  it('keeps the extra fields of a result', () => {
    const [kept] = addableResults([{ uid: 'a', username: 'a', displayName: 'Asha' }], []);
    assert.equal(kept.displayName, 'Asha');
  });
});

describe('picking people', () => {
  it('adds, then removes on a second pick', () => {
    const first = togglePick([], person('a'), 2);
    assert.equal(first.outcome, 'added');
    assert.deepEqual(first.picked, [person('a')]);
    const second = togglePick(first.picked, person('a'), 2);
    assert.equal(second.outcome, 'removed');
    assert.deepEqual(second.picked, []);
  });

  it('refuses people beyond the limit but still lets a picked person be removed', () => {
    const full = [person('a'), person('b')];
    const refused = togglePick(full, person('c'), 2);
    assert.equal(refused.outcome, 'full');
    assert.deepEqual(refused.picked, full);
    assert.equal(togglePick(full, person('b'), 2).outcome, 'removed');
  });

  it('does not change the list it was given', () => {
    const list = [person('a')];
    togglePick(list, person('b'), 3);
    togglePick(list, person('a'), 3);
    assert.deepEqual(list, [person('a')]);
  });

  it('a limit of zero adds no one', () => {
    assert.equal(togglePick([], person('a'), 0).outcome, 'full');
  });
});

describe('limit line', () => {
  it('says how many more can be added', () => {
    assert.equal(limitText(0, 4), 'You can add 4 more people');
    assert.equal(limitText(3, 4), 'You can add 1 more person');
  });

  it('says when the call is full', () => {
    assert.equal(limitText(2, 2), 'Call is full (2 added)');
    assert.equal(limitText(0, 0), 'This call is full');
  });
});

describe('name of the new group chat', () => {
  it('lists everyone', () => {
    assert.equal(upgradeGroupName(['asha', 'ravi', 'sam']), 'asha, ravi, sam');
  });

  it('shortens a long list to at most 40 characters, without a dangling space', () => {
    const name = upgradeGroupName(['alexandrina', 'bartholomew', 'constantine', 'dominique']);
    assert.ok(name.length <= 40);
    assert.ok(name.endsWith('…'));
    assert.ok(!name.endsWith(' …'));
    assert.ok(name.startsWith('alexandrina, bartholomew'));
  });

  it('keeps a list that just fits', () => {
    const fits = 'a'.repeat(18) + ', ' + 'b'.repeat(20);
    assert.equal(fits.length, 40);
    assert.equal(upgradeGroupName(['a'.repeat(18), 'b'.repeat(20)]), fits);
  });

  it('ignores blanks and has a fallback', () => {
    assert.equal(upgradeGroupName(['  asha ', '', '  ']), 'asha');
    assert.equal(upgradeGroupName([]), 'Group call');
    assert.equal(upgradeGroupName(['', ' ']), 'Group call');
  });
});

describe('a call that moved to a group chat', () => {
  it('names the chat only for an ended call that carries one', () => {
    assert.equal(movedConversationId({ status: 'ended', movedTo: 'g1' }), 'g1');
  });

  it('is null for a plain hang-up', () => {
    assert.equal(movedConversationId({ status: 'ended' }), null);
    assert.equal(movedConversationId({ status: 'ended', movedTo: '' }), null);
  });

  it('is null for anything that is not ended, or not a text id', () => {
    assert.equal(movedConversationId({ status: 'accepted', movedTo: 'g1' }), null);
    assert.equal(movedConversationId({ status: 'ringing', movedTo: 'g1' }), null);
    assert.equal(movedConversationId({ status: 'ended', movedTo: 7 }), null);
    assert.equal(movedConversationId(null), null);
    assert.equal(movedConversationId(undefined), null);
  });

  it('shows a closing line while the group call opens', () => {
    assert.equal(endReasonText('moved', true), 'Moving to a group call…');
    assert.equal(endReasonText('moved', false), 'Moving to a group call…');
  });
});
