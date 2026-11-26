import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEAD_ZONE,
  RING_INNER,
  RING_OUTER,
  SEGMENT_COUNT,
  hueFromPoint,
  pointForHue,
  segmentHues,
  segmentWidth,
} from '../../src/utils/colorWheel.ts';

const SIZE = 200;
const near = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} expected ${expected}, got ${actual}`);

describe('hueFromPoint', () => {
  it('is 0 at 12 o\'clock and grows clockwise', () => {
    near(hueFromPoint(100, 10, SIZE)!, 0, 'top');
    near(hueFromPoint(190, 100, SIZE)!, 90, 'right');
    near(hueFromPoint(100, 190, SIZE)!, 180, 'bottom');
    near(hueFromPoint(10, 100, SIZE)!, 270, 'left');
    near(hueFromPoint(190, 10, SIZE)!, 45, 'top right');
    near(hueFromPoint(10, 10, SIZE)!, 315, 'top left');
  });

  it('does not depend on how far from the middle the finger is', () => {
    near(hueFromPoint(150, 50, SIZE)!, 45);
    near(hueFromPoint(300, -100, SIZE)!, 45);
  });

  it('ignores the middle, where an angle means nothing', () => {
    assert.equal(hueFromPoint(100, 100, SIZE), null);
    assert.equal(hueFromPoint(100 + SIZE * DEAD_ZONE - 1, 100, SIZE), null);
    assert.notEqual(hueFromPoint(100 + SIZE * DEAD_ZONE + 1, 100, SIZE), null);
  });

  it('is always below 360', () => {
    for (let x = 0; x <= SIZE; x += 7) {
      for (let y = 0; y <= SIZE; y += 7) {
        const hue = hueFromPoint(x, y, SIZE);
        if (hue !== null) assert.ok(hue >= 0 && hue < 360, `${x},${y} -> ${hue}`);
      }
    }
  });
});

describe('pointForHue', () => {
  it('puts hue 0 above the middle and 90 to the right of it', () => {
    const top = pointForHue(0, 80, SIZE);
    near(top.x, 100);
    near(top.y, 20);
    const right = pointForHue(90, 80, SIZE);
    near(right.x, 180);
    near(right.y, 100);
  });

  it('is the inverse of hueFromPoint', () => {
    for (let hue = 0; hue < 360; hue += 10) {
      const point = pointForHue(hue, 80, SIZE);
      near(hueFromPoint(point.x, point.y, SIZE)!, hue, `hue ${hue}`);
    }
  });
});

describe('the ring', () => {
  it('lies inside the square and outside the dead zone, so every touch on it counts', () => {
    assert.ok(RING_OUTER <= 0.5);
    assert.ok(RING_INNER > DEAD_ZONE);
    assert.ok(RING_INNER < RING_OUTER);
  });

  it('is drawn in slices whose hues are the middle of each 3 degrees', () => {
    const hues = segmentHues();
    assert.equal(hues.length, SEGMENT_COUNT);
    near(hues[0], 1.5);
    near(hues[1], 4.5);
    near(hues[hues.length - 1], 358.5);
    assert.equal(segmentHues(4).join(), '45,135,225,315');
  });

  it('has slices wide enough to overlap their neighbours', () => {
    const arc = (2 * Math.PI * RING_OUTER * SIZE) / SEGMENT_COUNT;
    assert.ok(segmentWidth(SIZE) > arc);
  });
});
