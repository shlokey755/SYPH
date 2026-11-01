/**
 * splash.ts
 * When the splash screen may be hidden. Pure logic, unit tested in Node.
 *
 * Without this the native splash disappears the moment the first React view mounts, which on a fast phone is a blink
 * and on a slow one is followed by an empty screen while sign-in state loads. The rules here are:
 *   - never hide before the app is ready: signed-in state known, saved theme loaded, icon font loaded and the first real
 *     screen chosen, so nothing (spinner, wrong colours, missing icons, a sliding screen) shows after the logo,
 *   - never hide sooner than SPLASH_MIN_VISIBLE_MS after the app started, so the logo is actually seen,
 *   - once ready, wait SPLASH_SETTLE_MS so the first screen is drawn before the logo is taken away,
 *   - always hide by SPLASH_MAX_WAIT_MS, so a stuck sign-in check can never leave the splash up forever.
 */

/** The logo stays at least this long, even when the app is ready sooner. */
export const SPLASH_MIN_VISIBLE_MS = 700;

/** After the app reports ready, the first screen needs a moment to be laid out and painted under the splash. */
export const SPLASH_SETTLE_MS = 150;

/** Hard limit: after this the splash is removed whatever state the app is in. */
export const SPLASH_MAX_WAIT_MS = 8_000;

export interface SplashState {
  /** Epoch ms when the app's JavaScript started (module load of the root layout). */
  startedAt: number;
  now: number;
  /** True once the signed-in state is known and the first real screen can show. */
  ready: boolean;
  minVisibleMs?: number;
  maxWaitMs?: number;
  settleMs?: number;
}

/**
 * How many ms from now the splash should be hidden, or null to keep waiting (not ready yet).
 * Once the maximum wait has passed the answer is always 0 (hide right away).
 */
export function splashHideDelay({
  startedAt,
  now,
  ready,
  minVisibleMs = SPLASH_MIN_VISIBLE_MS,
  maxWaitMs = SPLASH_MAX_WAIT_MS,
  settleMs = SPLASH_SETTLE_MS,
}: SplashState): number | null {
  const elapsed = Math.max(0, now - startedAt);
  if (elapsed >= maxWaitMs) return 0;
  if (!ready) return null;
  return Math.max(settleMs, minVisibleMs - elapsed);
}

/** True for the entry route (`app/index.tsx`), which is only a hand-off to the first real screen. */
export function isIndexRoute(segments: readonly string[]): boolean {
  return segments.length === 0 || segments[0] === 'index';
}

/**
 * Whether the first real screen has been chosen. Normally the entry route reports it after it navigates; when the app
 * opens straight onto another screen (a link or a notification), the entry route never shows and nothing is awaited.
 */
export function firstScreenChosen({ onIndexRoute, routed }: { onIndexRoute: boolean; routed: boolean }): boolean {
  return routed || !onIndexRoute;
}
