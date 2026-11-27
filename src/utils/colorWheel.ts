/**
 * colorWheel.ts
 * Geometry of the colour wheel in the Me tab (components/profile/ColorWheel.tsx). Pure logic, unit tested in Node.
 *
 * The wheel is a square of `size` points with a ring of hues in it. Hue 0 is at 12 o'clock and the hue grows clockwise, so a
 * touch at 3 o'clock is hue 90. Nothing is imported: utils do not import each other by value.
 */

/** The ring's outer and inner edge, as a fraction of `size` (a radius of 0.5 touches the sides of the square). */
export const RING_OUTER = 0.5;
export const RING_INNER = 0.36;

/** A touch closer to the centre than this fraction of `size` says nothing about a hue and is ignored. */
export const DEAD_ZONE = 0.14;

/** How many slices the ring is drawn in (3 degrees each). */
export const SEGMENT_COUNT = 120;

/** An angle in degrees as 0 to 359.999 */
const wrap = (degrees: number): number => ((degrees % 360) + 360) % 360;

/** The hue under a touch at (x, y) inside the square, or null when it is too close to the centre to tell. */
export function hueFromPoint(x: number, y: number, size: number): number | null {
  const dx = x - size / 2;
  const dy = y - size / 2;
  if (Math.hypot(dx, dy) < size * DEAD_ZONE) return null;
  return wrap((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** Where a hue sits at `radius` from the centre of the square. */
export function pointForHue(hue: number, radius: number, size: number): { x: number; y: number } {
  const angle = (hue * Math.PI) / 180;
  return { x: size / 2 + radius * Math.sin(angle), y: size / 2 - radius * Math.cos(angle) };
}

/** The hue at the middle of each slice of the ring: 1.5, 4.5, ... when there are 120. */
export const segmentHues = (count: number = SEGMENT_COUNT): number[] =>
  Array.from({ length: count }, (_, index) => ((index + 0.5) * 360) / count);

/** Width of one slice at the ring's outer edge, a little more than the arc it covers so that neighbours overlap and no gap shows. */
export const segmentWidth = (size: number, count: number = SEGMENT_COUNT): number =>
  (2 * Math.PI * RING_OUTER * size) / count + 1;
