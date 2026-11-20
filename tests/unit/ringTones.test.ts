import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RING_CYCLE_S, RING_MAX_MS, RINGBACK_CYCLE_S, RINGBACK_MAX_MS, ringbackNotes, ringNotes } from '../../src/utils/ringTones.ts';

const END_SLACK = 1e-9;

describe('ringNotes', () => {
  it('starts at once and goes on in time order', () => {
    const notes = ringNotes();
    assert.equal(notes[0].at, 0);
    for (let i = 1; i < notes.length; i++) assert.ok(notes[i].at >= notes[i - 1].at, `note ${i} is out of order`);
  });

  it('plays two runs of four notes in every cycle, and repeats the cycle', () => {
    const notes = ringNotes();
    assert.equal(notes.length, 8 * Math.ceil(RING_MAX_MS / 1000 / RING_CYCLE_S));
    assert.equal(notes[8].at, RING_CYCLE_S);
    assert.equal(notes[8].freq, notes[0].freq);
    // The notes rise within a run.
    assert.ok(notes[0].freq < notes[1].freq && notes[1].freq < notes[2].freq && notes[2].freq < notes[3].freq);
  });

  it('leaves a quiet stretch before the next cycle', () => {
    const [first] = ringNotes(RING_CYCLE_S * 1000);
    const last = ringNotes(RING_CYCLE_S * 1000).at(-1)!;
    assert.equal(first.at, 0);
    assert.ok(last.at + last.length < RING_CYCLE_S - 0.5);
  });

  it('never runs past the time asked for: a note that would is cut short, a note that starts after is left out', () => {
    const notes = ringNotes(500);
    assert.deepEqual(
      notes.map((note) => note.at),
      [0, 0.18, 0.36]
    );
    assert.ok(Math.abs(notes[2].length - 0.14) < 1e-9);
    for (const total of [500, 3000, 12_345, RING_MAX_MS]) {
      for (const note of ringNotes(total)) assert.ok(note.at + note.length <= total / 1000 + END_SLACK, `${total}: ${note.at}`);
    }
  });

  it('plays nothing for a time that is not a time', () => {
    for (const total of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) assert.deepEqual(ringNotes(total), []);
  });

  it('keeps every note audible but well below full scale', () => {
    for (const note of ringNotes()) {
      assert.ok(note.gain > 0 && note.gain <= 0.5);
      assert.ok(note.length > 0);
      assert.ok(note.freq > 200 && note.freq < 4000);
    }
  });
});

describe('ringbackNotes', () => {
  it('is 440 Hz and 480 Hz together for two seconds, every six seconds', () => {
    const notes = ringbackNotes();
    assert.equal(notes.length, 2 * Math.ceil(RINGBACK_MAX_MS / 1000 / RINGBACK_CYCLE_S));
    assert.deepEqual(
      notes.slice(0, 4).map((note) => [note.at, note.freq, note.length]),
      [
        [0, 440, 2],
        [0, 480, 2],
        [6, 440, 2],
        [6, 480, 2],
      ]
    );
    assert.ok(notes.every((note) => note.shape === 'sine'));
  });

  it('is cut off at the time asked for', () => {
    const notes = ringbackNotes(7000);
    assert.equal(notes.length, 4);
    assert.ok(Math.abs(notes[2].length - 1) < 1e-9); // the second burst starts at 6 s and is cut at 7 s
    assert.deepEqual(ringbackNotes(0), []);
  });

  it('does not push the two tones past full scale together', () => {
    const [a, b] = ringbackNotes();
    assert.ok(a.gain + b.gain <= 1);
  });
});
