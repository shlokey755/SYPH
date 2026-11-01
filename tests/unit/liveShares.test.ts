import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStoredShares,
  planFix,
  removeShare,
  serializeShares,
  upsertShare,
  type StoredShare,
} from '../../src/utils/liveShares.ts';
import { buildPin, pinPosition, shouldPublish } from '../../src/utils/location.ts';

const share = (over: Partial<StoredShare> = {}): StoredShare => ({
  id: 'm1',
  conversationId: 'c1',
  senderUid: 'me',
  expiresAt: 10_000_000,
  last: null,
  ...over,
});

test('saved shares survive a round trip', () => {
  const list = [share(), share({ id: 'm2', last: { lat: 1, lng: 2, at: 5 } })];
  assert.deepEqual(parseStoredShares(serializeShares(list)), list);
});

test('bad saved text gives an empty list and bad entries are dropped', () => {
  assert.deepEqual(parseStoredShares(null), []);
  assert.deepEqual(parseStoredShares('not json'), []);
  assert.deepEqual(parseStoredShares('{"a":1}'), []);
  const mixed = JSON.stringify([share(), { id: 'x' }, null, 5, { ...share({ id: 'm3' }), expiresAt: 'soon' }]);
  assert.deepEqual(parseStoredShares(mixed).map((s) => s.id), ['m1']);
  // a broken "last" is ignored, the share itself is kept
  const brokenLast = JSON.stringify([{ ...share(), last: { lat: 'x' } }]);
  assert.equal(parseStoredShares(brokenLast)[0].last, null);
});

test('upsert replaces by id and remove deletes', () => {
  const a = share();
  const b = share({ id: 'm2' });
  assert.deepEqual(upsertShare([a, b], { ...a, expiresAt: 1 }).map((s) => [s.id, s.expiresAt]), [['m2', 10_000_000], ['m1', 1]]);
  assert.deepEqual(removeShare([a, b], 'm1'), [b]);
  assert.deepEqual(removeShare([a], 'nope'), [a]);
});

test('planFix writes the first position and remembers it', () => {
  const plan = planFix([share()], { lat: 10, lng: 20, at: 1_000 }, 'me', shouldPublish);
  assert.equal(plan.publish.length, 1);
  assert.deepEqual(plan.keep[0].last, { lat: 10, lng: 20, at: 1_000 });
  assert.equal(plan.expired.length, 0);
});

test('planFix throttles: too soon and not moved means no write, last stays', () => {
  const last = { lat: 10, lng: 20, at: 1_000 };
  const plan = planFix([share({ last })], { lat: 10, lng: 20, at: 3_000 }, 'me', shouldPublish);
  assert.equal(plan.publish.length, 0);
  assert.deepEqual(plan.keep[0].last, last);
});

test('planFix heartbeat: a minute later it writes even without moving', () => {
  const last = { lat: 10, lng: 20, at: 1_000 };
  const plan = planFix([share({ last })], { lat: 10, lng: 20, at: 62_000 }, 'me', shouldPublish);
  assert.equal(plan.publish.length, 1);
});

test('planFix ends shares whose time is up and keeps the rest', () => {
  const old = share({ id: 'old', expiresAt: 5_000 });
  const live = share({ id: 'live', expiresAt: 9_000_000 });
  const plan = planFix([old, live], { lat: 1, lng: 1, at: 6_000 }, 'me', shouldPublish);
  assert.deepEqual(plan.expired.map((s) => s.id), ['old']);
  assert.deepEqual(plan.keep.map((s) => s.id), ['live']);
});

test('planFix never touches a share saved by another account', () => {
  const plan = planFix([share({ senderUid: 'someone-else' })], { lat: 1, lng: 1, at: 1 }, 'me', shouldPublish);
  assert.deepEqual(plan, { publish: [], expired: [], keep: [] });
});

test('buildPin and pinPosition', () => {
  assert.deepEqual(buildPin(12.5, 77.5), { expiresAt: 0, pin: true, lat: 12.5, lng: 77.5 });
  assert.equal(buildPin(91, 0), null);
  assert.equal(buildPin(Number.NaN, 0), null);
  assert.deepEqual(pinPosition({ pin: true, lat: 12.5, lng: 77.5 }), { lat: 12.5, lng: 77.5 });
  assert.equal(pinPosition({ pin: true, lat: 200, lng: 0 }), null);
  assert.equal(pinPosition({ lat: 1, lng: 1 }), null, 'a live share is not a pin');
  assert.equal(pinPosition(undefined), null);
});
