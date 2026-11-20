/**
 * ringTones.ts
 * The two tones a browser plays during a call, as plain data: the ring the person being called hears, and the "tu-tu" the
 * caller hears while the other end rings. A phone plays its own ringtone and tone (services/callAudio.ts). A browser has
 * neither, and SYPH ships no sound files, so the web build draws them with the Web Audio API (services/callAudio.web.ts).
 *
 * Every note is scheduled up front, in seconds from the start, instead of by a timer that repeats: a browser slows timers in
 * a tab nobody is looking at, which would turn a ring into one chime, while the audio clock keeps its time.
 * No React and no imports, so plain Node can test it (tests/unit/ringTones.test.ts).
 */

export type ToneShape = 'sine' | 'triangle';

export interface ToneNote {
  /** Seconds from the start of the tone. */
  at: number;
  /** Seconds it sounds for. */
  length: number;
  /** Hertz. */
  freq: number;
  /** 0 to 1, before the volume of the whole tone. */
  gain: number;
  shape: ToneShape;
}

/** The longest a call rings: the same as the phone's buzz (utils/alertPrefs.ts), a little over the longest a call is rung. */
export const RING_MAX_MS = 50_000;
/** The longest the caller waits (a group call is rung for 45 seconds). */
export const RINGBACK_MAX_MS = 60_000;

/** One turn of the ring: a rising run of four notes, twice, then a pause. */
export const RING_CYCLE_S = 3;
const RING_RUN: ReadonlyArray<{ at: number; length: number; freq: number }> = [
  { at: 0, length: 0.16, freq: 659.25 }, // E5
  { at: 0.18, length: 0.16, freq: 783.99 }, // G5
  { at: 0.36, length: 0.16, freq: 987.77 }, // B5
  { at: 0.54, length: 0.34, freq: 1318.51 }, // E6
];
/** The second run starts this long after the first. */
const RING_RUN_GAP_S = 1.1;

/** The caller's tone: 440 Hz and 480 Hz together for 2 seconds, then 4 seconds of quiet (the usual "ringback"). */
export const RINGBACK_CYCLE_S = 6;
const RINGBACK_ON_S = 2;

/** Repeats `cycle` (notes timed from 0) until `totalMs`, cutting off whatever would run past it. */
function repeat(cycleS: number, totalMs: number, cycle: () => ToneNote[]): ToneNote[] {
  const total = totalMs / 1000;
  if (!Number.isFinite(total) || total <= 0) return [];
  const notes: ToneNote[] = [];
  for (let offset = 0; offset < total; offset += cycleS) {
    for (const note of cycle()) {
      const at = offset + note.at;
      if (at >= total) continue;
      notes.push({ ...note, at, length: Math.min(note.length, total - at) });
    }
  }
  return notes;
}

/** What the person being called hears, from 0 to `totalMs`. */
export function ringNotes(totalMs: number = RING_MAX_MS): ToneNote[] {
  return repeat(RING_CYCLE_S, totalMs, () =>
    [0, RING_RUN_GAP_S].flatMap((shift) =>
      RING_RUN.map((note): ToneNote => ({ at: shift + note.at, length: note.length, freq: note.freq, gain: 0.5, shape: 'triangle' }))
    )
  );
}

/** What the caller hears while the other end rings, from 0 to `totalMs`. */
export function ringbackNotes(totalMs: number = RINGBACK_MAX_MS): ToneNote[] {
  return repeat(RINGBACK_CYCLE_S, totalMs, () =>
    [440, 480].map((freq): ToneNote => ({ at: 0, length: RINGBACK_ON_S, freq, gain: 0.5, shape: 'sine' }))
  );
}
