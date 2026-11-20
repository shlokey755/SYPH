/**
 * webRinger.ts
 * Plays the call tones in a browser (utils/ringTones.ts) and flashes the tab's title while a call rings, so it is noticed from
 * another tab too. The browser is handed in (`RingerEnv`), so plain Node can test it with a stand-in
 * (tests/unit/webRinger.test.ts); services/callAudio.web.ts gives it the real one.
 *
 * A browser only lets a page make sound once the person has clicked or pressed a key in it. A tone asked for before that waits:
 * `start` still answers true and the title still flashes, and the sound begins the moment `unlock` finds the audio running.
 * The page calls `unlock` on its first click or key press.
 */

import type { ToneNote } from '../utils/ringTones';

export type ToneKind = 'ring' | 'ringback';

interface ParamLike {
  value: number;
  cancelScheduledValues(at: number): unknown;
  setValueAtTime(value: number, at: number): unknown;
  linearRampToValueAtTime(value: number, at: number): unknown;
}
interface NodeLike {
  connect(to: unknown): unknown;
  disconnect(): unknown;
}
interface GainLike extends NodeLike {
  gain: ParamLike;
}
interface OscillatorLike extends NodeLike {
  type: string;
  frequency: { value: number };
  start(at: number): unknown;
  stop(at: number): unknown;
}

/** The part of a browser's AudioContext that the ringer uses. */
export interface AudioLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): GainLike;
  createOscillator(): OscillatorLike;
  resume(): Promise<void>;
}

export interface RingerEnv {
  /** The page's audio, made on first use. Null when the browser has none. */
  audio(): AudioLike | null;
  /** The tab's title. Null where there is no page. */
  title: { get(): string; set(value: string): void } | null;
  /** Called when a tone has to wait for the first click or key press, so the page can start listening for one. */
  waitForGesture?(): void;
}

/** How loud a whole tone is, before the volume the person has set on the computer. */
const VOLUME = 0.4;
/** A moment before the first note, so the audio clock has not already passed it. */
const LEAD_S = 0.05;
/** The fade at each end of a note, so it does not click. */
const EDGE_S = 0.01;
/** How long a stopped tone fades out. */
const STOP_FADE_S = 0.04;
/** How long after the fade the tone's audio is taken apart. */
const DISCONNECT_MS = 150;
/** A tone that nobody stopped ends this long after it should have. */
const LIMIT_SLACK_MS = 500;
const FLASH_MS = 1000;
const FLASH_TITLE = '📞 Incoming call';

interface Tone {
  notes: ToneNote[];
  started: boolean;
  audio: AudioLike | null;
  master: GainLike | null;
  oscillators: OscillatorLike[];
  limit: ReturnType<typeof setTimeout> | null;
  flash: { timer: ReturnType<typeof setInterval>; restore: () => void } | null;
}

const warn = (what: string) => (error: unknown) => console.warn(`Call tone (${what}):`, error instanceof Error ? error.message : error);

export function createRinger(env: RingerEnv) {
  const tones: Partial<Record<ToneKind, Tone>> = {};

  /** Schedules every note of the tone on the audio clock. Only once per tone. */
  function begin(tone: Tone, audio: AudioLike): void {
    if (tone.started) return;
    tone.started = true;
    tone.audio = audio;
    try {
      const master = audio.createGain();
      master.gain.value = VOLUME;
      master.connect(audio.destination);
      tone.master = master;
      const base = audio.currentTime + LEAD_S;
      for (const note of tone.notes) {
        const from = base + note.at;
        const to = from + note.length;
        const edge = Math.min(EDGE_S, note.length / 4);
        const oscillator = audio.createOscillator();
        oscillator.type = note.shape;
        oscillator.frequency.value = note.freq;
        const gain = audio.createGain();
        gain.gain.setValueAtTime(0, from);
        gain.gain.linearRampToValueAtTime(note.gain, from + edge);
        gain.gain.setValueAtTime(note.gain, to - edge);
        gain.gain.linearRampToValueAtTime(0, to);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(from);
        oscillator.stop(to + EDGE_S);
        tone.oscillators.push(oscillator);
      }
    } catch (error) {
      warn('start')(error);
    }
  }

  function startFlash(tone: Tone): void {
    const title = env.title;
    if (!title) return;
    let original = title.get();
    let lit = false;
    const tick = () => {
      const current = title.get();
      if (current !== FLASH_TITLE) original = current; // the app renamed the tab in the meantime: keep that name
      lit = !lit;
      title.set(lit ? FLASH_TITLE : original);
    };
    tick();
    tone.flash = {
      timer: setInterval(tick, FLASH_MS),
      restore: () => {
        if (title.get() === FLASH_TITLE) title.set(original);
      },
    };
  }

  /** Starts a tone, replacing one of the same kind that is still going. False when the browser cannot play sound at all. */
  function start(kind: ToneKind, notes: ToneNote[], totalMs: number): boolean {
    stop(kind);
    const audio = env.audio();
    if (!audio) return false;
    const tone: Tone = { notes, started: false, audio: null, master: null, oscillators: [], limit: null, flash: null };
    tones[kind] = tone;
    if (kind === 'ring') startFlash(tone);
    // Whatever happens to the call, the tone and the flashing title end by themselves.
    tone.limit = setTimeout(() => {
      if (tones[kind] === tone) stop(kind);
    }, totalMs + LIMIT_SLACK_MS);

    if (audio.state === 'running') {
      begin(tone, audio);
      return true;
    }
    env.waitForGesture?.();
    try {
      audio.resume().then(() => {
        if (tones[kind] === tone && audio.state === 'running') begin(tone, audio);
      }, warn('resume'));
    } catch (error) {
      warn('resume')(error);
    }
    return true;
  }

  /** Fades the tone out and puts the title back. False when that kind was not playing. */
  function stop(kind: ToneKind): boolean {
    const tone = tones[kind];
    if (!tone) return false;
    delete tones[kind];
    if (tone.limit) clearTimeout(tone.limit);
    if (tone.flash) {
      clearInterval(tone.flash.timer);
      tone.flash.restore();
    }
    const { audio, master } = tone;
    if (audio && master) {
      const now = audio.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + STOP_FADE_S);
      } catch (error) {
        warn('fade')(error);
      }
      for (const oscillator of tone.oscillators) {
        try {
          oscillator.stop(now + STOP_FADE_S + EDGE_S);
        } catch {
          // already finished
        }
      }
      setTimeout(() => {
        try {
          master.disconnect();
        } catch {
          // already apart
        }
      }, DISCONNECT_MS);
    }
    return true;
  }

  /**
   * Call this from a click or key press. Wakes the page's audio and starts any tone that was waiting for it. Resolves to
   * whether sound is allowed now.
   */
  async function unlock(): Promise<boolean> {
    const audio = env.audio();
    if (!audio) return false;
    try {
      await audio.resume();
    } catch (error) {
      warn('unlock')(error);
      return false;
    }
    if (audio.state !== 'running') return false;
    for (const tone of Object.values(tones)) if (tone && !tone.started) begin(tone, audio);
    return true;
  }

  return { start, stop, unlock };
}

export type Ringer = ReturnType<typeof createRinger>;
