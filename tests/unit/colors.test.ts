import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { vintage } from '../../src/theme/colors.ts';
import { mixColors } from '../../src/theme/parchment.ts';
import { contrastRatio, parseHex } from '../../src/utils/bubbleColors.ts';

const HEX_TOKENS = [
  'background',
  'cardBackground',
  'text',
  'subText',
  'accent',
  'border',
  'inputBg',
  'buttonText',
  'danger',
  'paper',
  'paperAlt',
  'ink',
  'inkSoft',
  'stamp',
  'shadow',
  'brass',
  'gilt',
  'wood',
  'burn',
  'night',
  'nightInk',
  'nightSoft',
] as const;

describe('the vintage palette', () => {
  it('only uses colours the rest of the app can read', () => {
    for (const key of HEX_TOKENS) assert.ok(parseHex(vintage[key]), `${key} is not a hex colour`);
    for (const pin of vintage.pins) assert.ok(parseHex(pin));
    assert.equal(vintage.pins.length, 3);
    assert.match(vintage.trail, /^rgba\(\d+, \d+, \d+, 0?\.\d+\)$/);
  });

  it('is a light page, and the older colour names follow the paper names', () => {
    assert.equal(vintage.isDark, false);
    assert.equal(vintage.cardBackground, vintage.paper);
    assert.equal(vintage.inputBg, vintage.paper);
    assert.equal(vintage.text, vintage.ink);
    assert.equal(vintage.subText, vintage.inkSoft);
  });

  it('reads well wherever a piece of text can land', () => {
    const inactiveTab = mixColors(vintage.buttonText, vintage.wood, 0.3);
    const pairs: Array<[string, string, string, number]> = [
      ['ink on paper', vintage.ink, vintage.paper, 7],
      ['ink on tea-stained paper', vintage.ink, vintage.paperAlt, 7],
      ['soft ink on paper', vintage.inkSoft, vintage.paper, 4.5],
      ['soft ink on tea-stained paper', vintage.inkSoft, vintage.paperAlt, 4.5],
      ['wax-red ink on paper', vintage.stamp, vintage.paper, 4.5],
      ['wax-red ink on tea-stained paper', vintage.stamp, vintage.paperAlt, 4.5],
      ['text on the page', vintage.text, vintage.background, 7],
      ['soft text on the page', vintage.subText, vintage.background, 4.5],
      ['accent on the page', vintage.accent, vintage.background, 4.5],
      ['errors on the page', vintage.danger, vintage.background, 4.5],
      ['text on a sea-blue button or own message', vintage.buttonText, vintage.accent, 4.5],
      ['text on red wax', vintage.buttonText, vintage.stamp, 4.5],
      ['text on dark red wax', vintage.buttonText, vintage.danger, 4.5],
      ['ink on a gold medallion or ribbon', vintage.ink, vintage.pins[0], 4.5],
      ['ink on the gold tab medallion', vintage.ink, vintage.gilt, 4.5],
      ['text on the night sea', vintage.nightInk, vintage.night, 7],
      ['soft text on the night sea', vintage.nightSoft, vintage.night, 4.5],
      ['gold on the night sea', vintage.gilt, vintage.night, 7],
      ['the open tab on the timber', vintage.gilt, vintage.wood, 4.5],
      ['the other tabs on the timber', inactiveTab, vintage.wood, 4.5],
      ['plank button text on the timber', vintage.buttonText, vintage.wood, 7],
    ];
    for (const [name, fg, bg, min] of pairs) {
      const ratio = contrastRatio(fg, bg);
      assert.ok(ratio >= min, `${name}: ${ratio.toFixed(2)} is below ${min}`);
    }
  });
});
