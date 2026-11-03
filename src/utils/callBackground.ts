/**
 * callBackground.ts
 * Pure rules for keeping a call alive while SYPH is not on screen (FR-06, background calls).
 * No React, no native code: keep it dependency-free so it can be unit tested with plain Node.
 *
 *   - which call the person is in, and what to do when a screen asks to start or show one (`classifyCallRequest`)
 *   - what the ongoing "call in progress" notification says and where tapping it goes (`callNotificationInfo`)
 *   - when the camera is switched off and back on as SYPH leaves and returns to the screen (`cameraAction`)
 */

import type { CallType } from '../types';

export type CallKind = 'direct' | 'group';

/** Where a call is in its life, in terms both call types share. */
export type CallStage = 'starting' | 'ringing' | 'live';

/** The screens that show a running call. `active` always means "whichever call is running now". */
export const CALL_ROUTE: Record<CallKind, string> = {
  direct: '/call/active',
  group: '/group-call/active',
};

/** The id used in the route when a screen should show the call that is already running. */
export const ACTIVE_CALL_ID = 'active';

/** Link the notification opens. SYPH's own scheme, so it needs no extra Android setup. */
export const callDeepLink = (kind: CallKind): string => `syph://${CALL_ROUTE[kind]}`;

/** What identifies a call well enough to tell "this is the call I am already in" from "a different call". */
export interface CallRef {
  kind: CallKind;
  /** Firestore call id. Null while a call is being placed (not created yet). */
  callId: string | null;
  conversationId: string | null;
}

export type CallRequestOutcome =
  /** Nothing is running: begin this call. */
  | 'start'
  /** This is the call already running: just show it. */
  | 'attach'
  /** A different call is running: show that one instead. */
  | 'busy';

/**
 * Decides what to do when a call screen opens. One call at a time:
 *   - nothing running, or the running one has already ended -> start the new one
 *   - the same call (same id, or the same group chat) -> attach, e.g. coming back from the chat
 *   - anything else (placing a second call, a second group) -> show the call that is running
 */
export function classifyCallRequest(
  active: CallRef | null,
  activeEnded: boolean,
  request: CallRef
): CallRequestOutcome {
  if (!active || activeEnded) return 'start';
  if (active.kind !== request.kind) return 'busy';
  if (request.kind === 'group') return active.conversationId === request.conversationId ? 'attach' : 'busy';
  return request.callId !== null && active.callId === request.callId ? 'attach' : 'busy';
}

export interface CallNotificationInput {
  kind: CallKind;
  type: CallType;
  /** The other person, or the group's name. */
  name: string;
  stage: CallStage;
}

export interface CallNotificationInfo {
  title: string;
  text: string;
  /** Link opened when the notification is tapped. */
  route: string;
}

const kindLabel = (type: CallType) => (type === 'video' ? 'Video' : 'Voice');

/** The text of the ongoing notification. Short on purpose: it sits in the notification shade and lock screen. */
export function callNotificationInfo({ kind, type, name, stage }: CallNotificationInput): CallNotificationInfo {
  const title = name.trim() || (kind === 'group' ? 'Group call' : 'SYPH call');
  const label = kind === 'group' ? `Group ${kindLabel(type).toLowerCase()} call` : `${kindLabel(type)} call`;
  let text: string;
  if (stage === 'live') text = `${label} in progress · Tap to return`;
  else if (stage === 'ringing') text = `Ringing… · Tap to return`;
  else text = `Starting ${label.toLowerCase()}… · Tap to return`;
  return { title, text, route: callDeepLink(kind) };
}

/**
 * Seconds-since-connected to the moment the notification clock should start from, or 0 when the call is not live yet
 * (the notification then shows no clock). `now` is injectable for tests.
 */
export const clockStart = (stage: CallStage, seconds: number, now: number = Date.now()): number =>
  stage === 'live' ? now - Math.max(0, seconds) * 1000 : 0;

export type AppVisibility = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export type CameraAction = 'off' | 'on' | null;

/**
 * Android takes the camera away from an app that is not on screen, so a video call turns its own camera off when SYPH
 * goes to the background (the other side sees "Camera off" instead of a frozen picture) and back on when SYPH returns.
 * `autoOff` is true when it was this rule, not the person, that switched the camera off, so a camera the person turned
 * off themselves is never switched on behind their back.
 */
export function cameraAction(input: {
  appState: AppVisibility;
  isVideo: boolean;
  cameraOff: boolean;
  autoOff: boolean;
}): CameraAction {
  if (!input.isVideo) return null;
  if (input.appState === 'background') return input.cameraOff ? null : 'off';
  if (input.appState === 'active') return input.autoOff && input.cameraOff ? 'on' : null;
  return null;
}

/** True while the person is looking at a call screen, where the "return to call" banner is not needed. */
export const isCallRoute = (segments: readonly string[]): boolean =>
  segments[0] === 'call' || segments[0] === 'group-call';

/** How long an ended call stays registered, so its closing message can be read, before it is let go. */
export const ENDED_LINGER_MS = 4_000;

// ----- the floating "return to call" bubble -----

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/** Keeps the bubble fully on screen, clear of the status bar (`top`) and the navigation bar (`bottom`). */
export function clampBubble(point: Point, screen: Size, bubble: Size, margin: { top: number; bottom: number }): Point {
  return {
    x: clamp(point.x, 0, screen.width - bubble.width),
    y: clamp(point.y, margin.top, screen.height - bubble.height - margin.bottom),
  };
}

/** Lets go of the bubble against the nearer side edge, so it never sits in the middle of the content. */
export function snapBubbleToEdge(point: Point, screen: Size, bubble: Size, gap = 8): Point {
  const toRight = point.x + bubble.width / 2 > screen.width / 2;
  return { x: toRight ? screen.width - bubble.width - gap : gap, y: point.y };
}
