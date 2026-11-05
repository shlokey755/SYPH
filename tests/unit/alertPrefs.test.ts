import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_ALERT_PREFS,
  MAX_RING_MS,
  MESSAGE_BUZZ_PATTERN,
  MESSAGE_TONES,
  RINGTONES,
  TOUCH_TICK_MS,
  callFeelPattern,
  messageAlertPlan,
  normalizeAlertPrefs,
  ringPlan,
  ringVibrationPattern,
  touchTickMs,
} from '../../src/utils/alertPrefs.ts';

const prefs = (patch: Partial<typeof DEFAULT_ALERT_PREFS> = {}) => ({ ...DEFAULT_ALERT_PREFS, ...patch });

describe('saved sound choices (normalizeAlertPrefs)', () => {
  it('uses the defaults when nothing was saved', () => {
    assert.deepEqual(normalizeAlertPrefs(undefined), DEFAULT_ALERT_PREFS);
    assert.deepEqual(normalizeAlertPrefs(null), DEFAULT_ALERT_PREFS);
    assert.deepEqual(normalizeAlertPrefs({}), DEFAULT_ALERT_PREFS);
  });

  it('keeps valid choices', () => {
    const saved = { vibrate: false, touchFeedback: false, ringtone: 'phone', messageTone: 'pop' } as const;
    assert.deepEqual(normalizeAlertPrefs(saved), saved);
  });

  it('ignores values it does not understand, one by one', () => {
    const result = normalizeAlertPrefs({ vibrate: 'yes', touchFeedback: false, ringtone: 'dubstep', messageTone: 'drop' });
    assert.equal(result.vibrate, DEFAULT_ALERT_PREFS.vibrate);
    assert.equal(result.touchFeedback, false);
    assert.equal(result.ringtone, DEFAULT_ALERT_PREFS.ringtone);
    assert.equal(result.messageTone, 'drop');
  });

  it('survives text and numbers where an object was expected', () => {
    assert.deepEqual(normalizeAlertPrefs('garbage'), DEFAULT_ALERT_PREFS);
    assert.deepEqual(normalizeAlertPrefs(42), DEFAULT_ALERT_PREFS);
  });

  it('the defaults are one of the offered choices', () => {
    assert.ok(RINGTONES.some((tone) => tone.id === DEFAULT_ALERT_PREFS.ringtone));
    assert.ok(MESSAGE_TONES.some((tone) => tone.id === DEFAULT_ALERT_PREFS.messageTone));
  });
});

describe('ringing vibration pattern', () => {
  it('lasts for the whole ring', () => {
    const pattern = ringVibrationPattern();
    const total = pattern.reduce((sum, part) => sum + part, 0);
    assert.ok(total >= MAX_RING_MS);
    // ...but is not wildly longer, so a call that ends early does not leave a long pattern to cancel.
    assert.ok(total < MAX_RING_MS + 4_000);
  });

  it('starts with no wait and ends on a pause, not a buzz', () => {
    const pattern = ringVibrationPattern();
    assert.equal(pattern[0], 0);
    assert.equal((pattern.length - 1) % 2, 0, 'positions 1, 3, 5... are buzzes, so the last one is a pause');
  });

  it('only holds positive lengths after the first', () => {
    assert.ok(ringVibrationPattern().slice(1).every((part) => part > 0));
  });

  it('can be made for a shorter time', () => {
    const total = ringVibrationPattern(5_000).reduce((sum, part) => sum + part, 0);
    assert.ok(total >= 5_000 && total < 9_000);
  });
});

describe('what a ringing call does (ringPlan)', () => {
  it('plays the SYPH ringtone when this build has it', () => {
    assert.equal(ringPlan(prefs({ ringtone: 'syph' }), true).source, '_BUNDLE_');
  });

  it('plays the phone ringtone when it was chosen', () => {
    assert.equal(ringPlan(prefs({ ringtone: 'phone' }), true).source, '_DEFAULT_');
    assert.equal(ringPlan(prefs({ ringtone: 'phone' }), false).source, '_DEFAULT_');
  });

  it('falls back to the phone ringtone in a build without the SYPH one, instead of ringing silently', () => {
    assert.equal(ringPlan(prefs({ ringtone: 'syph' }), false).source, '_DEFAULT_');
  });

  it('buzzes only when vibration is on', () => {
    assert.ok(Array.isArray(ringPlan(prefs({ vibrate: true }), true).pattern));
    assert.equal(ringPlan(prefs({ vibrate: false }), true).pattern, null);
  });

  it('touch feedback does not change how a call rings', () => {
    assert.deepEqual(ringPlan(prefs({ touchFeedback: false }), true), ringPlan(prefs({ touchFeedback: true }), true));
  });
});

describe('what a new message does (messageAlertPlan)', () => {
  it('plays the chosen tone loudly and buzzes for a message in another chat', () => {
    const plan = messageAlertPlan(prefs({ messageTone: 'pop' }), false);
    assert.deepEqual(plan, { tone: 'pop', volume: 1, buzz: 'buzz' });
  });

  it('is quieter and gentler for the chat being read', () => {
    const open = messageAlertPlan(prefs(), true);
    const elsewhere = messageAlertPlan(prefs(), false);
    assert.ok(open.volume < elsewhere.volume);
    assert.equal(open.buzz, 'tick');
  });

  it('plays no tone when the tone is off, and still buzzes', () => {
    const plan = messageAlertPlan(prefs({ messageTone: 'off' }), false);
    assert.equal(plan.tone, null);
    assert.equal(plan.buzz, 'buzz');
  });

  it('does not buzz when vibration is off, and still plays the tone', () => {
    const plan = messageAlertPlan(prefs({ vibrate: false }), false);
    assert.equal(plan.buzz, null);
    assert.equal(plan.tone, DEFAULT_ALERT_PREFS.messageTone);
    assert.equal(messageAlertPlan(prefs({ vibrate: false }), true).buzz, null);
  });

  it('the double pulse is an Android pattern: no wait, then buzz, pause, buzz', () => {
    assert.deepEqual([...MESSAGE_BUZZ_PATTERN], [0, 45, 70, 45]);
  });
});

describe('touch feedback', () => {
  it('ticks under the finger only when it is on', () => {
    assert.equal(touchTickMs(prefs({ touchFeedback: true })), TOUCH_TICK_MS);
    assert.equal(touchTickMs(prefs({ touchFeedback: false })), null);
  });

  it('pulses once when a call connects and twice when it ends', () => {
    assert.deepEqual(callFeelPattern(prefs(), 'connected'), [0, 70]);
    assert.deepEqual(callFeelPattern(prefs(), 'ended'), [0, 40, 80, 40]);
  });

  it('is silent when touch feedback is off, whatever else is on', () => {
    const off = prefs({ touchFeedback: false, vibrate: true });
    assert.equal(callFeelPattern(off, 'connected'), null);
    assert.equal(callFeelPattern(off, 'ended'), null);
  });

  it('does not depend on the ringing vibration switch', () => {
    const quiet = prefs({ vibrate: false, touchFeedback: true });
    assert.deepEqual(callFeelPattern(quiet, 'connected'), [0, 70]);
    assert.equal(touchTickMs(quiet), TOUCH_TICK_MS);
  });
});
