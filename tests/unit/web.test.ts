import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COLUMN_WIDTH, DESK_MIN_WIDTH, boxShadowCss, deskLayout } from '../../src/theme/web.ts';

describe('deskLayout', () => {
  it('fills the window on a phone and in a narrow browser window', () => {
    for (const width of [320, 390, 430, 719]) {
      assert.deepEqual(deskLayout(width), { desk: false, columnWidth: null });
    }
  });

  it('puts the map on the table from the minimum width up, in a column of one fixed width', () => {
    for (const width of [DESK_MIN_WIDTH, 1024, 1920, 3840]) {
      assert.deepEqual(deskLayout(width), { desk: true, columnWidth: COLUMN_WIDTH });
    }
  });

  it('never makes the column wider than the window it sits in', () => {
    assert.ok(COLUMN_WIDTH < DESK_MIN_WIDTH);
  });

  it('treats a width that is not a number as a small window', () => {
    assert.deepEqual(deskLayout(NaN), { desk: false, columnWidth: null });
    assert.deepEqual(deskLayout(Infinity), { desk: false, columnWidth: null });
  });
});

describe('boxShadowCss', () => {
  it('writes a CSS shadow from the app shadow numbers', () => {
    assert.equal(boxShadowCss(3, 5, '#2A190B', 0.3), '0px 3px 5px rgba(42, 25, 11, 0.3)');
  });

  it('writes none when there is no shadow', () => {
    assert.equal(boxShadowCss(0, 0, '#2A190B', 0), 'none');
  });

  it('holds the opacity between 0 and 1 and falls back to black for a colour it cannot read', () => {
    assert.equal(boxShadowCss(1, 2, '#000000', 3), '0px 1px 2px rgba(0, 0, 0, 1)');
    assert.equal(boxShadowCss(1, 2, 'red', 0.5), '0px 1px 2px rgba(0, 0, 0, 0.5)');
  });
});
