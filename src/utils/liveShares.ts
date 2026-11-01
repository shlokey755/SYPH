/**
 * liveShares.ts
 * Pure logic for the list of live location shares that is saved on the phone, so sharing can keep going while SYPH is in
 * the background (a background task wakes up with a new position and has to know which shares are running) and can
 * resume after the app is reopened. No React Native imports, so it is unit tested.
 */

/** Name of the background location task. Defined in services/liveLocationTask.ts. */
export const LIVE_LOCATION_TASK = 'syph-live-location';

/** AsyncStorage key for the saved shares. */
export const SHARES_STORAGE_KEY = 'syph.liveShares';

export interface ShareFix {
  lat: number;
  lng: number;
  /** Epoch ms. */
  at: number;
}

export interface StoredShare {
  /** Id of the location message, which is also the id of the location document. */
  id: string;
  conversationId: string;
  /** Who is sharing. A share saved by another account is never continued. */
  senderUid: string;
  /** Epoch ms when the share ends by itself. */
  expiresAt: number;
  /** The last position written, for throttling. */
  last: ShareFix | null;
}

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isStr = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function toShare(raw: unknown): StoredShare | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isStr(r.id) || !isStr(r.conversationId) || !isStr(r.senderUid) || !isNum(r.expiresAt)) return null;
  let last: ShareFix | null = null;
  const l = r.last as Record<string, unknown> | null | undefined;
  if (l && isNum(l.lat) && isNum(l.lng) && isNum(l.at)) last = { lat: l.lat, lng: l.lng, at: l.at };
  return { id: r.id, conversationId: r.conversationId, senderUid: r.senderUid, expiresAt: r.expiresAt, last };
}

/** Reads the saved text. Anything that is not a valid list gives an empty list, bad entries are dropped. */
export function parseStoredShares(raw: string | null | undefined): StoredShare[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(toShare).filter((share): share is StoredShare => share !== null);
  } catch {
    return [];
  }
}

export const serializeShares = (shares: StoredShare[]): string => JSON.stringify(shares);

/** Adds a share, or replaces the one with the same id. */
export function upsertShare(shares: StoredShare[], share: StoredShare): StoredShare[] {
  return [...shares.filter((s) => s.id !== share.id), share];
}

export const removeShare = (shares: StoredShare[], id: string): StoredShare[] => shares.filter((s) => s.id !== id);

export interface FixPlan {
  /** Shares that get this position written. */
  publish: StoredShare[];
  /** Shares whose time is up: end them. */
  expired: StoredShare[];
  /** What to save afterwards: the running shares, with `last` updated where a position is being written. */
  keep: StoredShare[];
}

/**
 * Decides what a new position means for every saved share. `canPublish` is the throttle (utils/location.ts
 * shouldPublish), passed in so this file needs no imports. Shares saved by another account are dropped without
 * being touched.
 */
export function planFix(
  shares: StoredShare[],
  fix: ShareFix,
  uid: string,
  canPublish: (previous: ShareFix | null, next: ShareFix) => boolean
): FixPlan {
  const plan: FixPlan = { publish: [], expired: [], keep: [] };
  for (const share of shares) {
    if (share.senderUid !== uid) continue;
    if (fix.at >= share.expiresAt) {
      plan.expired.push(share);
      continue;
    }
    if (canPublish(share.last, fix)) {
      const updated = { ...share, last: fix };
      plan.publish.push(updated);
      plan.keep.push(updated);
    } else {
      plan.keep.push(share);
    }
  }
  return plan;
}
