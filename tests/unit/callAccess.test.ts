import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCESS_STEPS,
  accessStepText,
  missingSteps,
  nextAccessStep,
  parseAsked,
  serializeAsked,
  usesMediaAudioPermission,
} from '../../src/utils/callAccess.ts';

const off = { android: true, native: true, ringtone: false, overApps: false, fullScreen: false };
const access = (patch: Partial<typeof off> = {}) => ({ ...off, ...patch });

describe('what is missing (missingSteps)', () => {
  it('lists all three, ringtone first, then display over other apps, then full-screen alerts', () => {
    assert.deepEqual(missingSteps(access()), ['ringtone', 'overApps', 'fullScreen']);
  });

  it('lists only what is off', () => {
    assert.deepEqual(missingSteps(access({ ringtone: true })), ['overApps', 'fullScreen']);
    assert.deepEqual(missingSteps(access({ overApps: true })), ['ringtone', 'fullScreen']);
    assert.deepEqual(missingSteps(access({ fullScreen: true })), ['ringtone', 'overApps']);
  });

  it('is empty when all three are on', () => {
    assert.deepEqual(missingSteps(access({ ringtone: true, overApps: true, fullScreen: true })), []);
  });

  it('leaves out the two settings pages in a build without the native helper (Expo Go, an older APK)', () => {
    assert.deepEqual(missingSteps(access({ native: false })), ['ringtone']);
  });

  it('is empty on iOS and web', () => {
    assert.deepEqual(missingSteps(access({ android: false })), []);
  });
});

describe('the next thing to ask (nextAccessStep)', () => {
  it('goes through them in order on a first start', () => {
    assert.equal(nextAccessStep(access(), []), 'ringtone');
    assert.equal(nextAccessStep(access(), ['ringtone']), 'overApps');
    assert.equal(nextAccessStep(access(), ['ringtone', 'overApps']), 'fullScreen');
  });

  it('does not ask again for one that was asked, even if it is still off', () => {
    assert.equal(nextAccessStep(access(), [...ACCESS_STEPS]), null);
    assert.equal(nextAccessStep(access({ ringtone: true }), ['overApps']), 'fullScreen');
  });

  it('skips one the person turned on in the meantime', () => {
    assert.equal(nextAccessStep(access({ overApps: true }), ['ringtone']), 'fullScreen');
  });

  it('asks only about a permission that is new to this phone', () => {
    assert.equal(nextAccessStep(access(), ['overApps', 'fullScreen']), 'ringtone');
  });

  it('has nothing to ask when all are on', () => {
    assert.equal(nextAccessStep(access({ ringtone: true, overApps: true, fullScreen: true }), []), null);
  });
});

describe('what is remembered on the phone (parseAsked, serializeAsked)', () => {
  it('round-trips, in the usual order and without repeats', () => {
    assert.equal(serializeAsked(['fullScreen', 'ringtone', 'ringtone']), '["ringtone","fullScreen"]');
    assert.deepEqual(parseAsked(serializeAsked(['overApps', 'ringtone'])), ['ringtone', 'overApps']);
  });

  it('treats nothing, rubbish and unknown names as "none asked"', () => {
    assert.deepEqual(parseAsked(null), []);
    assert.deepEqual(parseAsked(undefined), []);
    assert.deepEqual(parseAsked(''), []);
    assert.deepEqual(parseAsked('not json'), []);
    assert.deepEqual(parseAsked('{"ringtone":true}'), []);
    assert.deepEqual(parseAsked('["ringtone","camera",7]'), ['ringtone']);
  });
});

describe('which audio permission Android has', () => {
  it('uses the audio-only permission from Android 13 (API 33) and read-storage before', () => {
    assert.equal(usesMediaAudioPermission(33), true);
    assert.equal(usesMediaAudioPermission(35), true);
    assert.equal(usesMediaAudioPermission(32), false);
    assert.equal(usesMediaAudioPermission(26), false);
  });
});

describe('the wording', () => {
  it('has a title, an explanation and a button for every step', () => {
    for (const step of ACCESS_STEPS) {
      const text = accessStepText(step);
      assert.ok(text.title.length > 0 && text.message.length > 20 && text.action.length > 0);
    }
  });

  it('names each permission the way Android does, and says it can be changed later in the phone settings', () => {
    assert.match(accessStepText('ringtone').title, /ringtone/i);
    assert.match(accessStepText('overApps').title, /over other apps/i);
    assert.match(accessStepText('fullScreen').title, /full-screen/i);
    for (const step of ACCESS_STEPS) assert.match(accessStepText(step).message, /phone's settings/);
  });

  it('opens a settings page for the two special switches and asks directly for the ringtone', () => {
    assert.equal(accessStepText('ringtone').action, 'Allow');
    assert.equal(accessStepText('overApps').action, 'Open settings');
    assert.equal(accessStepText('fullScreen').action, 'Open settings');
  });
});
