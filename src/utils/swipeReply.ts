/**
 * swipeReply.ts
 * The numbers behind "swipe a message to the right to reply". No React, no gesture code, so plain Node can test it.
 *
 *   - `shouldCaptureSwipe`  when a finger movement is a sideways swipe (and not the start of scrolling the list)
 *   - `swipeOffset`         how far the message follows the finger (it slows down and stops)
 *   - `swipeTriggers`       whether letting go here replies
 *   - `swipeProgress`       0 to 1: how far towards "reply" the arrow icon has faded in
 */

/** Sideways movement (px) before a swipe is claimed, so a tap or a long-press is never taken for one. */
export const SWIPE_START = 12;
/** Letting go after dragging this far (px of finger movement) replies. */
export const SWIPE_TRIGGER = 64;
/** The message never moves further than this (px). */
export const SWIPE_MAX = 80;
/** How much of the finger's movement the message follows: a little less than 1, so it feels weighty. */
const FOLLOW = 0.85;

/**
 * A swipe to the right that is clearly more sideways than up or down. Anything else is left to the list, which scrolls
 * up and down.
 */
export const shouldCaptureSwipe = (dx: number, dy: number): boolean =>
  dx > SWIPE_START && dx > Math.abs(dy) * 2;

/** The distance the message is drawn moved to the right. Never negative (no swiping left), never past SWIPE_MAX. */
export const swipeOffset = (dx: number): number => (dx <= 0 ? 0 : Math.min(SWIPE_MAX, dx * FOLLOW));

export const swipeTriggers = (dx: number): boolean => dx >= SWIPE_TRIGGER;

/** 0 at rest, 1 once the offset reaches the point where letting go replies. */
export const swipeProgress = (offset: number): number => Math.max(0, Math.min(1, offset / (SWIPE_TRIGGER * FOLLOW)));

/** The offset at which the arrow icon is fully shown, for interpolating an Animated value. */
export const SWIPE_ICON_FULL_AT = SWIPE_TRIGGER * FOLLOW;
