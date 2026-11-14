import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INTRO_TEXT,
  accessStepText,
  nextAccessStep,
  shouldAskForCallAccess,
} from '../../src/utils/callAccess.ts';

const access = (patch: Partial<{ available: boolean; overApps: boolean; fullScreen: boolean }> = {}) => ({
  available: true,
  overApps: false,
  fullScreen: false,
  ...patch,
});

describe('the next settings page to open (nextAccessStep)', () => {
  it('asks for "Display over other apps" first, then full-screen alerts', () => {
    assert.equal(nextAccessStep(access()), 'overApps');
    assert.equal(nextAccessStep(access({ overApps: true })), 'fullScreen');
  });

  it('asks for full-screen alerts alone when only that is missing', () => {
    assert.equal(nextAccessStep(access({ overApps: true, fullScreen: false })), 'fullScreen');
    assert.equal(nextAccessStep(access({ overApps: false, fullScreen: true })), 'overApps');
  });

  it('has nothing to ask when both are on', () => {
    assert.equal(nextAccessStep(access({ overApps: true, fullScreen: true })), null);
  });

  it('has nothing to ask in a build without the native side (Expo Go, iOS, an older APK)', () => {
    assert.equal(nextAccessStep(access({ available: false })), null);
  });
});

describe('the first prompt (shouldAskForCallAccess)', () => {
  it('shows once, when something is missing', () => {
    assert.equal(shouldAskForCallAccess({ alreadyAsked: false, access: access() }), true);
    assert.equal(shouldAskForCallAccess({ alreadyAsked: true, access: access() }), false);
  });

  it('does not show when everything is already on, or this build cannot use it', () => {
    assert.equal(shouldAskForCallAccess({ alreadyAsked: false, access: access({ overApps: true, fullScreen: true }) }), false);
    assert.equal(shouldAskForCallAccess({ alreadyAsked: false, access: access({ available: false }) }), false);
  });
});

describe('the wording', () => {
  it('says plainly that the sounds need nothing from the person', () => {
    assert.match(INTRO_TEXT.message, /nothing to allow for sound/);
    assert.match(INTRO_TEXT.message, /ringtone/);
  });

  it('has text for both settings pages', () => {
    assert.match(accessStepText('overApps').title, /over other apps/i);
    assert.match(accessStepText('fullScreen').title, /full-screen/i);
    for (const step of ['overApps', 'fullScreen'] as const) assert.ok(accessStepText(step).message.length > 20);
  });
});
