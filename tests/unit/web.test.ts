import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DESKTOP_MIN_WIDTH,
  LIST_WIDTH,
  LIST_WIDTH_NARROW,
  MAIN_MIN_WIDTH,
  RAIL_WIDTH,
  boxShadowCss,
  desktopLayout,
} from '../../src/theme/web.ts';

describe('desktopLayout', () => {
  const phone = { desktop: false, railWidth: 0, listWidth: 0 };

  it('is the phone layout on a phone and in a narrow browser window', () => {
    for (const width of [320, 390, 430, 768, DESKTOP_MIN_WIDTH - 1]) {
      assert.deepEqual(desktopLayout(width), phone);
    }
  });

  it('is the desktop layout from the minimum width up, with a rail of one fixed width', () => {
    for (const width of [DESKTOP_MIN_WIDTH, 1024, 1366, 1920, 3840]) {
      const layout = desktopLayout(width);
      assert.equal(layout.desktop, true);
      assert.equal(layout.railWidth, RAIL_WIDTH);
    }
  });

  it('gives the list a narrower width on a window just over the minimum', () => {
    assert.equal(desktopLayout(DESKTOP_MIN_WIDTH).listWidth, LIST_WIDTH_NARROW);
    assert.equal(desktopLayout(1099).listWidth, LIST_WIDTH_NARROW);
    assert.equal(desktopLayout(1100).listWidth, LIST_WIDTH);
    assert.equal(desktopLayout(2560).listWidth, LIST_WIDTH);
  });

  it('always leaves the open page room next to the rail and the list', () => {
    for (const width of [DESKTOP_MIN_WIDTH, 950, 1099, 1100, 1280, 1920]) {
      const { railWidth, listWidth } = desktopLayout(width);
      assert.ok(width - railWidth - listWidth >= MAIN_MIN_WIDTH, `${width} leaves too little room`);
    }
  });

  it('treats a width that is not a number as a small window', () => {
    assert.deepEqual(desktopLayout(NaN), phone);
    assert.deepEqual(desktopLayout(Infinity), phone);
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
