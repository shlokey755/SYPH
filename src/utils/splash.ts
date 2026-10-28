/**
 * splash.ts
 * When the splash screen may be hidden. Pure logic, unit tested in Node.
 *
 * Without this the native splash disappears the moment the first React view mounts, which on a fast phone is a blink
 * and on a slow one is followed by an empty screen while sign-in state loads. The rules here are:
 *   - never hide before the app is ready (signed-in state known),
 *   - never hide sooner than SPLASH_MIN_VISIBLE_MS after the app started, so the logo is actually seen,
 *   - always hide by SPLASH_MAX_WAIT_MS, so a stuck sign-in check can never leave the splash up forever.
 */

/** The logo stays at least this long, even when the app is ready sooner. */
export const SPLASH_MIN_VISIBLE_MS = 700;

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
}

/**
 * How many ms from now the splash should be hidden, or null to keep waiting (not ready yet).
 * 0 means hide right away. Once the maximum wait has passed the answer is always 0.
 */
export function splashHideDelay({
  startedAt,
  now,
  ready,
  minVisibleMs = SPLASH_MIN_VISIBLE_MS,
  maxWaitMs = SPLASH_MAX_WAIT_MS,
}: SplashState): number | null {
  const elapsed = Math.max(0, now - startedAt);
  if (elapsed >= maxWaitMs) return 0;
  if (!ready) return null;
  return Math.max(0, minVisibleMs - elapsed);
}
