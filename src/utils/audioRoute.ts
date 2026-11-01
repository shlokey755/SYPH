/**
 * audioRoute.ts
 * Pure helpers for choosing where call audio comes out: Bluetooth earphones, a wired headset, the loudspeaker or the
 * earpiece. react-native-incall-manager reports the routes it can use and the one in use; this turns that report into
 * something the call screen can show, and picks what the audio button switches to next. No native code here, so it is
 * unit-tested.
 */

export type AudioRoute = 'bluetooth' | 'wired' | 'speaker' | 'earpiece';

export interface RouteState {
  /** Routes the phone can use right now. */
  available: AudioRoute[];
  /** The route in use, or null before the audio library has reported one. */
  selected: AudioRoute | null;
}

/** The names react-native-incall-manager uses on Android. */
export const NATIVE_ROUTE: Record<AudioRoute, string> = {
  bluetooth: 'BLUETOOTH',
  wired: 'WIRED_HEADSET',
  speaker: 'SPEAKER_PHONE',
  earpiece: 'EARPIECE',
};

/** Order the button steps through: earphones first, then the speaker, then the earpiece. */
const ORDER: AudioRoute[] = ['bluetooth', 'wired', 'speaker', 'earpiece'];

const fromNative = (name: unknown): AudioRoute | null =>
  ORDER.find((route) => NATIVE_ROUTE[route] === name) ?? null;

/**
 * Reads an `onAudioDeviceChanged` event. The library sends the list as a JSON string (`'["SPEAKER_PHONE","BLUETOOTH"]'`)
 * and the selected route as a name; an empty or unknown name means none. Returns null if the payload is not usable.
 */
export function parseRouteEvent(payload: unknown): RouteState | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;

  let names: unknown = data.availableAudioDeviceList;
  if (typeof names === 'string') {
    try {
      names = JSON.parse(names);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(names)) return null;

  const found = new Set<AudioRoute>();
  for (const name of names) {
    const route = fromNative(name);
    if (route) found.add(route);
  }
  return { available: ORDER.filter((route) => found.has(route)), selected: fromNative(data.selectedAudioDevice) };
}

/**
 * Where the audio button goes next, stepping through the routes that are available. Returns null when there is
 * nothing to switch to (one route only, for example a tablet with no earpiece and nothing plugged in).
 */
export function nextRoute(state: RouteState): AudioRoute | null {
  const { available, selected } = state;
  if (available.length < 2) return null;
  const at = selected ? available.indexOf(selected) : -1;
  return available[(at + 1) % available.length];
}

export function routeIcon(route: AudioRoute): 'bluetooth' | 'headset' | 'volume-high' | 'ear' {
  switch (route) {
    case 'bluetooth':
      return 'bluetooth';
    case 'wired':
      return 'headset';
    case 'speaker':
      return 'volume-high';
    case 'earpiece':
      return 'ear';
  }
}

export function routeLabel(route: AudioRoute): string {
  switch (route) {
    case 'bluetooth':
      return 'Bluetooth earphones';
    case 'wired':
      return 'Wired headset';
    case 'speaker':
      return 'Speaker';
    case 'earpiece':
      return 'Earpiece';
  }
}
