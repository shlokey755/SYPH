/**
 * location.ts
 * Pure logic for live location sharing. No I/O and no framework imports, so it is unit tested in Node.
 *
 * How sharing works without a server: while a share is on, the sharer's phone writes its position to
 * conversations/{id}/locations/{messageId} (at most every few seconds, and only when it moved or as a heartbeat) and
 * the other members watch that one document. Updates only run while SYPH is open on the sharer's phone.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

export interface ShareDuration {
  id: '15m' | '1h' | '8h';
  label: string;
  ms: number;
}

/** What the share sheet offers. The rules cap a share at 8 hours (plus a little slack for clock differences). */
export const SHARE_DURATIONS: readonly ShareDuration[] = [
  { id: '15m', label: '15 minutes', ms: 15 * MINUTE_MS },
  { id: '1h', label: '1 hour', ms: HOUR_MS },
  { id: '8h', label: '8 hours', ms: 8 * HOUR_MS },
];

export const MAX_SHARE_MS = 8 * HOUR_MS;

/** Writes closer together than this are skipped (each one is a Firestore write). */
export const PUBLISH_MIN_INTERVAL_MS = 8_000;
/** Moving less than this since the last write is not worth a new one... */
export const PUBLISH_MIN_MOVE_METERS = 10;
/** ...unless this long has passed, so a person standing still still looks "live" rather than stale. */
export const PUBLISH_HEARTBEAT_MS = 60_000;
/** A share with no update for this long is shown as "last updated ..." instead of "Live". */
export const STALE_AFTER_MS = 3 * MINUTE_MS;

export interface Fix {
  lat: number;
  lng: number;
}

export const isValidCoords = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: Fix, b: Fix): number {
  const R = 6_371_000;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether a new position from the location service should be written, given the last one that was. */
export function shouldPublish(
  previous: (Fix & { at: number }) | null,
  next: Fix & { at: number }
): boolean {
  if (!previous) return true;
  const elapsed = next.at - previous.at;
  if (elapsed < PUBLISH_MIN_INTERVAL_MS) return false;
  if (elapsed >= PUBLISH_HEARTBEAT_MS) return true;
  return distanceMeters(previous, next) >= PUBLISH_MIN_MOVE_METERS;
}

/** 90_000 -> "2 min", 3_900_000 -> "1 h 5 min". Rounds up so "1 min left" never reads "0 min left". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / MINUTE_MS));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** "just now", "3 min ago", "1 h 5 min ago". */
export function formatAgo(ms: number): string {
  if (ms < MINUTE_MS) return 'just now';
  return `${formatDuration(ms)} ago`;
}

/** The line under a location bubble in the chat. Needs no listener: it only compares the end time with the clock. */
export function bubbleStatus(expiresAt: number, now: number): { live: boolean; label: string } {
  if (!(expiresAt > now)) return { live: false, label: 'Live location ended' };
  return { live: true, label: `Live location · ${formatDuration(expiresAt - now)} left` };
}

export type ShareState = 'live' | 'stale' | 'ended';

/** The status line in the map viewer, from the share's own document. `updatedAtMs` is 0 when unknown. */
export function describeShare(input: {
  now: number;
  expiresAt: number;
  active: boolean;
  updatedAtMs: number;
}): { state: ShareState; label: string } {
  if (!input.active || !(input.expiresAt > input.now)) return { state: 'ended', label: 'Sharing ended' };
  if (input.updatedAtMs > 0 && input.now - input.updatedAtMs > STALE_AFTER_MS) {
    return { state: 'stale', label: `Last updated ${formatAgo(input.now - input.updatedAtMs)}` };
  }
  return { state: 'live', label: `Live · ${formatDuration(input.expiresAt - input.now)} left` };
}

/** A link that opens the position in the phone's maps app (or the browser). Coordinates are validated first. */
export function mapsUrl(lat: number, lng: number): string | null {
  if (!isValidCoords(lat, lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// ---------- one-time pin ("Send current location") ----------

/** The position stored on a pin message. A pin never ends and has no document of its own. */
export interface PinPosition {
  lat: number;
  lng: number;
}

/** The `location` field of a pin message, or null when the coordinates are not real numbers. */
export function buildPin(lat: number, lng: number): { expiresAt: 0; pin: true; lat: number; lng: number } | null {
  if (!isValidCoords(lat, lng)) return null;
  return { expiresAt: 0, pin: true, lat, lng };
}

/** The position of a pin message, or null when it is a live share (or not a valid pin). */
export function pinPosition(
  location: { pin?: boolean; lat?: number; lng?: number } | null | undefined
): PinPosition | null {
  if (!location || location.pin !== true) return null;
  const { lat, lng } = location;
  return isValidCoords(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}
