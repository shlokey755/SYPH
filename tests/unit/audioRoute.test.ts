import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextRoute, parseRouteEvent, routeIcon, routeLabel } from '../../src/utils/audioRoute.ts';

// What react-native-incall-manager sends: the list is a JSON string, the selected route a name.
const event = (list, selected) => ({ availableAudioDeviceList: JSON.stringify(list), selectedAudioDevice: selected });

describe('parseRouteEvent', () => {
  it('reads the routes and the one in use, in the order the button steps through them', () => {
    assert.deepEqual(parseRouteEvent(event(['EARPIECE', 'BLUETOOTH', 'SPEAKER_PHONE'], 'BLUETOOTH')), {
      available: ['bluetooth', 'speaker', 'earpiece'],
      selected: 'bluetooth',
    });
  });

  it('knows a wired headset', () => {
    const state = parseRouteEvent(event(['SPEAKER_PHONE', 'WIRED_HEADSET', 'EARPIECE'], 'WIRED_HEADSET'));
    assert.deepEqual(state, { available: ['wired', 'speaker', 'earpiece'], selected: 'wired' });
  });

  it('accepts a real array too, and ignores unknown names and duplicates', () => {
    const state = parseRouteEvent({
      availableAudioDeviceList: ['SPEAKER_PHONE', 'SPEAKER_PHONE', 'NONE', 'HDMI', 7],
      selectedAudioDevice: 'SPEAKER_PHONE',
    });
    assert.deepEqual(state, { available: ['speaker'], selected: 'speaker' });
  });

  it('treats an empty or unknown selected name as none', () => {
    assert.equal(parseRouteEvent(event(['SPEAKER_PHONE'], '')).selected, null);
    assert.equal(parseRouteEvent(event(['SPEAKER_PHONE'], 'NONE')).selected, null);
    assert.equal(parseRouteEvent({ availableAudioDeviceList: '[]' }).selected, null);
  });

  it('returns null for payloads it cannot use', () => {
    for (const payload of [null, undefined, 'text', 5, {}, { availableAudioDeviceList: 'not json' }, { availableAudioDeviceList: '{}' }]) {
      assert.equal(parseRouteEvent(payload), null, JSON.stringify(payload));
    }
  });
});

describe('nextRoute', () => {
  const state = (available, selected) => ({ available, selected });

  it('toggles speaker and earpiece when nothing is plugged in, as the old button did', () => {
    assert.equal(nextRoute(state(['speaker', 'earpiece'], 'earpiece')), 'speaker');
    assert.equal(nextRoute(state(['speaker', 'earpiece'], 'speaker')), 'earpiece');
  });

  it('steps through earphones, speaker and earpiece and wraps around', () => {
    const all = ['bluetooth', 'speaker', 'earpiece'];
    assert.equal(nextRoute(state(all, 'bluetooth')), 'speaker');
    assert.equal(nextRoute(state(all, 'speaker')), 'earpiece');
    assert.equal(nextRoute(state(all, 'earpiece')), 'bluetooth');
  });

  it('puts Bluetooth before a wired headset when both are there', () => {
    const all = ['bluetooth', 'wired', 'speaker', 'earpiece'];
    assert.equal(nextRoute(state(all, 'bluetooth')), 'wired');
    assert.equal(nextRoute(state(all, 'wired')), 'speaker');
  });

  it('starts from the first route when none is selected yet or the selected one is gone', () => {
    assert.equal(nextRoute(state(['speaker', 'earpiece'], null)), 'speaker');
    assert.equal(nextRoute(state(['speaker', 'earpiece'], 'bluetooth')), 'speaker');
  });

  it('returns null when there is nothing to switch to', () => {
    assert.equal(nextRoute(state([], null)), null);
    assert.equal(nextRoute(state(['speaker'], 'speaker')), null);
  });
});

describe('labels and icons', () => {
  it('has one of each for every route', () => {
    for (const route of ['bluetooth', 'wired', 'speaker', 'earpiece']) {
      assert.ok(routeIcon(route));
      assert.ok(routeLabel(route));
    }
    assert.equal(routeIcon('earpiece'), 'ear');
    assert.equal(routeIcon('speaker'), 'volume-high');
  });
});
