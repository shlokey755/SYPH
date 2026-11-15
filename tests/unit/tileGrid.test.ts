import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestGrid } from '../../src/utils/tileGrid.ts';

const WINDOWS: Array<[number, number]> = [
  [390, 520], // a phone held upright
  [980, 600], // a desktop window
  [1400, 700], // a wide one
  [600, 600],
  [320, 200],
];

describe('bestGrid', () => {
  it('puts two people side by side in a wide window', () => {
    const grid = bestGrid(2, 980, 600);
    assert.deepEqual([grid.columns, grid.rows], [2, 1]);
  });

  it('stacks two people in a tall window', () => {
    const grid = bestGrid(2, 390, 600);
    assert.deepEqual([grid.columns, grid.rows], [1, 2]);
  });

  it('makes a square of four in a window of the picture shape', () => {
    const grid = bestGrid(4, 800, 600);
    assert.deepEqual([grid.columns, grid.rows], [2, 2]);
  });

  it('gives one person the biggest picture of the shape that fits', () => {
    const wide = bestGrid(1, 1200, 300);
    assert.deepEqual([wide.columns, wide.rows, wide.height], [1, 1, 300]);
    assert.ok(Math.abs(wide.width - 400) <= 1);
    const tall = bestGrid(1, 300, 1200);
    assert.deepEqual([tall.columns, tall.rows, tall.width], [1, 1, 300]);
    assert.ok(Math.abs(tall.height - 225) <= 1);
  });

  it('has a place for everyone and never overflows the window', () => {
    for (const [width, height] of WINDOWS) {
      for (let count = 1; count <= 9; count++) {
        const grid = bestGrid(count, width, height);
        assert.ok(grid.columns * grid.rows >= count, `${count} tiles in ${width}x${height}`);
        assert.ok(grid.columns * grid.width <= width, `${count} tiles wide in ${width}x${height}`);
        assert.ok(grid.rows * grid.height <= height, `${count} tiles high in ${width}x${height}`);
        assert.ok(grid.width > 0 && grid.height > 0);
      }
    }
  });

  it('does not leave a whole empty row', () => {
    for (const [width, height] of WINDOWS) {
      for (let count = 1; count <= 9; count++) {
        const grid = bestGrid(count, width, height);
        assert.ok((grid.rows - 1) * grid.columns < count, `${count} tiles in ${width}x${height}`);
      }
    }
  });

  it('keeps every tile the shape of a picture', () => {
    for (const [width, height] of WINDOWS) {
      const grid = bestGrid(3, width, height);
      assert.ok(Math.abs(grid.width / grid.height - 4 / 3) < 0.1, `${width}x${height}`);
    }
  });

  it('asks for no size while the window has not been measured', () => {
    assert.deepEqual(bestGrid(3, 0, 0), { columns: 1, rows: 3, width: 0, height: 0 });
    assert.deepEqual(bestGrid(3, 500, 0), { columns: 1, rows: 3, width: 0, height: 0 });
    assert.deepEqual(bestGrid(3, Number.NaN, 400), { columns: 1, rows: 3, width: 0, height: 0 });
  });

  it('counts a missing or fractional number of people as at least one', () => {
    assert.equal(bestGrid(0, 800, 600).columns * bestGrid(0, 800, 600).rows, 1);
    assert.equal(bestGrid(Number.NaN, 800, 600).columns, 1);
    assert.equal(bestGrid(2.7, 980, 600).columns, 2);
  });
});
