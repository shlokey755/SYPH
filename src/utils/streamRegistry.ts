/**
 * streamRegistry.ts
 * react-native-webrtc shows a stream by an address (`stream.toURL()`); a browser shows it by giving the stream itself to a
 * video element. The call screens are written for the first, so in a browser each stream gets an address here, and `RTCView`
 * (services/webrtcBrowser.tsx) turns the address back into the stream. Streams are held weakly, so a finished call is not
 * kept alive by its address.
 */

const addressOf = new WeakMap<object, string>();
const held = new Map<string, WeakRef<object>>();
let counter = 0;

/** Drops the addresses of streams that are gone, now and then, so the table does not grow over a long session. */
function forgetGone(): void {
  if (held.size < 32) return;
  for (const [address, ref] of held) {
    if (ref.deref() === undefined) held.delete(address);
  }
}

/** The same address every time for the same stream. */
export function streamAddress(stream: object): string {
  const known = addressOf.get(stream);
  if (known) return known;
  forgetGone();
  counter += 1;
  const address = `syph-stream:${counter}`;
  addressOf.set(stream, address);
  held.set(address, new WeakRef(stream));
  return address;
}

/** The stream at an address, or null when the address is unknown or its stream is gone. */
export function streamAt<T extends object = object>(address: string | null | undefined): T | null {
  if (!address) return null;
  return (held.get(address)?.deref() as T | undefined) ?? null;
}
