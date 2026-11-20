import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { createRinger, type AudioLike, type RingerEnv } from '../../src/services/webRinger.ts';
import { ringbackNotes, ringNotes } from '../../src/utils/ringTones.ts';

const FLASH = '📞 Incoming call';

// ----- stand-ins for the browser's audio -----

class FakeParam {
  value = 1;
  events: Array<[string, number, number?]> = [];
  cancelScheduledValues(at: number) {
    this.events.push(['cancel', at]);
  }
  setValueAtTime(value: number, at: number) {
    this.events.push(['set', value, at]);
  }
  linearRampToValueAtTime(value: number, at: number) {
    this.events.push(['ramp', value, at]);
  }
}
class FakeNode {
  to: unknown[] = [];
  apart = false;
  connect(target: unknown) {
    this.to.push(target);
  }
  disconnect() {
    this.apart = true;
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = { value: 0 };
  startedAt: number | null = null;
  stops: number[] = [];
  start(at: number) {
    this.startedAt = at;
  }
  stop(at: number) {
    this.stops.push(at);
  }
}
class FakeAudio {
  state = 'running';
  currentTime = 10;
  destination = { speakers: true };
  gains: FakeGain[] = [];
  oscillators: FakeOscillator[] = [];
  resumes = 0;
  /** Whether resume() works, as it does once the person has clicked. */
  allowed = true;
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  resume() {
    this.resumes++;
    if (this.allowed) this.state = 'running';
    return Promise.resolve();
  }
}

function setup(audio: FakeAudio | null = new FakeAudio()) {
  const page = { title: 'SYPH' };
  let waits = 0;
  const env: RingerEnv = {
    audio: () => audio as unknown as AudioLike | null,
    title: {
      get: () => page.title,
      set: (value) => {
        page.title = value;
      },
    },
    waitForGesture: () => {
      waits++;
    },
  };
  return { audio, page, waits: () => waits, ringer: createRinger(env) };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const near = (actual: number | undefined, expected: number) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-6, `${actual} is not ${expected}`);

describe('createRinger', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }));
  afterEach(() => mock.timers.reset());

  it('schedules every note up front, on the audio clock', () => {
    const { audio, ringer } = setup();
    const notes = ringNotes(3000);
    assert.equal(ringer.start('ring', notes, 3000), true);
    assert.equal(audio!.oscillators.length, notes.length);
    const [first] = audio!.oscillators;
    near(first.startedAt ?? undefined, 10.05);
    assert.equal(first.frequency.value, notes[0].freq);
    assert.equal(first.type, 'triangle');
    const master = audio!.gains[0];
    assert.equal(master.gain.value, 0.4);
    assert.deepEqual(master.to, [audio!.destination]);
  });

  it('fades every note in and out, so it does not click', () => {
    const { audio, ringer } = setup();
    ringer.start('ring', ringNotes(500), 500);
    const note = audio!.gains[1].gain.events; // gains[0] is the whole tone's
    assert.deepEqual(
      note.map((event) => event[0]),
      ['set', 'ramp', 'set', 'ramp']
    );
    assert.equal(note[0][1], 0);
    assert.equal(note[3][1], 0);
  });

  it('waits for the first click when the browser has not allowed sound yet', async () => {
    const audio = new FakeAudio();
    audio.state = 'suspended';
    audio.allowed = false;
    const { page, waits, ringer } = setup(audio);
    assert.equal(ringer.start('ring', ringNotes(3000), 3000), true);
    await flush();
    assert.equal(audio.oscillators.length, 0);
    assert.equal(waits(), 1);
    assert.equal(page.title, FLASH, 'the title still flashes, so the call is seen');

    audio.allowed = true;
    assert.equal(await ringer.unlock(), true);
    assert.equal(audio.oscillators.length, ringNotes(3000).length);
    assert.equal(await ringer.unlock(), true);
    assert.equal(audio.oscillators.length, ringNotes(3000).length, 'a second click does not ring it twice');
  });

  it('starts by itself when the browser wakes the audio up on its own', async () => {
    const audio = new FakeAudio();
    audio.state = 'suspended';
    const { ringer } = setup(audio);
    ringer.start('ringback', ringbackNotes(7000), 7000);
    await flush();
    assert.equal(audio.oscillators.length, ringbackNotes(7000).length);
  });

  it('does not start a tone that was stopped while it waited', async () => {
    const audio = new FakeAudio();
    audio.state = 'suspended';
    audio.allowed = false;
    const { ringer } = setup(audio);
    ringer.start('ring', ringNotes(3000), 3000);
    ringer.stop('ring');
    audio.allowed = true;
    await ringer.unlock();
    assert.equal(audio.oscillators.length, 0);
  });

  it('says so when the browser has no Web Audio, and leaves the title alone', () => {
    const { page, ringer } = setup(null);
    assert.equal(ringer.start('ring', ringNotes(3000), 3000), false);
    assert.equal(page.title, 'SYPH');
    assert.equal(ringer.stop('ring'), false);
  });

  it('stops by fading out, silencing every oscillator and taking the audio apart', () => {
    const { audio, ringer } = setup();
    ringer.start('ring', ringNotes(3000), 3000);
    audio!.currentTime = 12;
    assert.equal(ringer.stop('ring'), true);
    const master = audio!.gains[0];
    const fade = master.gain.events.at(-1)!;
    assert.equal(fade[0], 'ramp');
    assert.equal(fade[1], 0);
    near(fade[2], 12.04);
    for (const oscillator of audio!.oscillators) assert.ok(oscillator.stops.some((at) => at > 12 && at < 12.2));
    assert.equal(master.apart, false);
    mock.timers.tick(200);
    assert.equal(master.apart, true);
    assert.equal(ringer.stop('ring'), false, 'stopping twice is harmless');
  });

  it('flashes the tab title while it rings, and puts it back', () => {
    const { page, ringer } = setup();
    ringer.start('ring', ringNotes(10_000), 10_000);
    assert.equal(page.title, FLASH);
    mock.timers.tick(1000);
    assert.equal(page.title, 'SYPH');
    mock.timers.tick(1000);
    assert.equal(page.title, FLASH);
    ringer.stop('ring');
    assert.equal(page.title, 'SYPH');
  });

  it('keeps a name that the app gave the tab while it was ringing', () => {
    const { page, ringer } = setup();
    ringer.start('ring', ringNotes(10_000), 10_000);
    page.title = 'Chats';
    mock.timers.tick(1000);
    assert.equal(page.title, 'Chats');
    mock.timers.tick(1000);
    assert.equal(page.title, FLASH);
    ringer.stop('ring');
    assert.equal(page.title, 'Chats');
  });

  it('leaves the title alone for the caller, who is not being rung', () => {
    const { page, ringer } = setup();
    ringer.start('ringback', ringbackNotes(10_000), 10_000);
    mock.timers.tick(2000);
    assert.equal(page.title, 'SYPH');
  });

  it('ends a tone that nobody stopped, title included', () => {
    const { page, ringer } = setup();
    ringer.start('ring', ringNotes(2000), 2000);
    mock.timers.tick(2499);
    assert.equal(page.title, FLASH);
    mock.timers.tick(1);
    assert.equal(page.title, 'SYPH');
    assert.equal(ringer.stop('ring'), false);
  });

  it('keeps the ring and the caller\'s tone apart', () => {
    const { audio, ringer } = setup();
    ringer.start('ringback', ringbackNotes(7000), 7000);
    const caller = audio!.oscillators.length;
    ringer.start('ring', ringNotes(3000), 3000);
    assert.equal(ringer.stop('ring'), true);
    // Every oscillator was given its end time when it was scheduled; stopping the ring gives the ring's a second, earlier one.
    assert.ok(audio!.oscillators.slice(0, caller).every((oscillator) => oscillator.stops.length === 1));
    assert.ok(audio!.oscillators.slice(caller).every((oscillator) => oscillator.stops.length === 2));
    assert.equal(ringer.stop('ringback'), true);
  });

  it('replaces a tone of the same kind that is still going', () => {
    const { audio, ringer } = setup();
    const notes = ringNotes(3000);
    ringer.start('ring', notes, 3000);
    ringer.start('ring', notes, 3000);
    assert.equal(audio!.oscillators.length, notes.length * 2);
    assert.ok(audio!.gains[0].gain.events.some((event) => event[0] === 'ramp' && event[1] === 0), 'the first one was faded out');
  });

  it('unlock reports whether sound is allowed', async () => {
    const audio = new FakeAudio();
    audio.state = 'suspended';
    audio.allowed = false;
    const { ringer } = setup(audio);
    assert.equal(await ringer.unlock(), false);
    audio.allowed = true;
    assert.equal(await ringer.unlock(), true);
    assert.equal(await setup(null).ringer.unlock(), false);
  });

  it('copes with a browser that throws', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const broken = new FakeAudio();
    broken.createOscillator = () => {
      throw new Error('no oscillators today');
    };
    assert.equal(setup(broken).ringer.start('ring', ringNotes(3000), 3000), true);

    const refusing = new FakeAudio();
    refusing.state = 'suspended';
    refusing.resume = () => Promise.reject(new Error('not allowed'));
    const { ringer } = setup(refusing);
    assert.equal(ringer.start('ring', ringNotes(3000), 3000), true);
    assert.equal(await ringer.unlock(), false);
    await flush();
    assert.ok(warn.mock.callCount() >= 2);
    warn.mock.restore();
  });
});
