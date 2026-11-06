/**
 * callOverlay.ts
 * Pure rules for showing calls over other apps and the lock screen. No React, no native code, so plain Node can test it.
 *
 *   - when the native incoming-call screen is wanted (`incomingScreenWanted`)
 *   - when the floating "return to call" bubble is wanted (`bubbleWanted`)
 *   - what Accept / Decline on that screen sends back (`parseIncomingAction`)
 *   - what the Me tab says about the two permissions (`overlayStatus`)
 */

export type IncomingAction = 'accept' | 'decline';

export interface IncomingPress {
  action: IncomingAction;
  /** The ring the press is about (a 1-to-1 call id, or `group:<call id>`). */
  key: string;
}

/**
 * The native screen sends "accept:<key>" or "decline:<key>" (a press nobody heard is kept in that form). The key may itself
 * contain colons, so only the first one splits.
 */
export function parseIncomingAction(raw: string | null | undefined): IncomingPress | null {
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  const action = raw.slice(0, at);
  const key = raw.slice(at + 1);
  if ((action !== 'accept' && action !== 'decline') || key.length === 0) return null;
  return { action, key };
}

/**
 * The call screen over other apps is for a call that rings while SYPH is in the background. With SYPH on screen the ordinary
 * ring screen inside the app does the job ('inactive' is the brief state while a shade or a dialog covers the app).
 */
export const incomingScreenWanted = (ringKey: string | null, appState: string): boolean =>
  ringKey !== null && appState === 'background';

/** The floating bubble is for a call that is running while SYPH is in the background. */
export const bubbleWanted = (input: { live: boolean; ended: boolean; movedTo: boolean; appState: string }): boolean =>
  input.live && !input.ended && !input.movedTo && input.appState === 'background';

export type PermissionStatus = 'unavailable' | 'granted' | 'needed';

export interface OverlayAccess {
  /** This build has the native side (an older APK does not). */
  available: boolean;
  /** "Display over other apps" is on for SYPH. */
  overApps: boolean;
  /** Full-screen call alerts are allowed (always true before Android 14). */
  fullScreen: boolean;
}

export interface OverlayStatus {
  overApps: PermissionStatus;
  fullScreen: PermissionStatus;
}

export function overlayStatus(access: OverlayAccess): OverlayStatus {
  if (!access.available) return { overApps: 'unavailable', fullScreen: 'unavailable' };
  return {
    overApps: access.overApps ? 'granted' : 'needed',
    fullScreen: access.fullScreen ? 'granted' : 'needed',
  };
}

/** The accent colour as Android reads it (#RRGGBB or #AARRGGBB); anything else becomes SYPH's green. */
export const FALLBACK_BUBBLE_COLOR = '#22C55E';
export const bubbleColor = (value: string | undefined | null): string =>
  typeof value === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : FALLBACK_BUBBLE_COLOR;
