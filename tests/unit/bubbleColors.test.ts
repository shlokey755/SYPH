import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  contrastRatio,
  darkenColor,
  IDLE_TICK_OPACITY,
  ownBubbleColors,
  parseHex,
  readableTextOn,
} from '../../src/utils/bubbleColors.ts';

// The six themes: accent and the colour the theme puts on top of it (src/hooks/themeContext.tsx).
const THEMES: Record<string, { accent: string; buttonText: string }> = {
  cyber: { accent: '#00E5FF', buttonText: '#000000' },
  monochrome: { accent: '#000000', buttonText: '#FFFFFF' },
  candy: { accent: '#800080', buttonText: '#FFFFFF' },
  ocean: { accent: '#4DA3FF', buttonText: '#06121F' },
  forest: { accent: '#3DDC84', buttonText: '#06130B' },
  sunset: { accent: '#FF7A59', buttonText: '#1A0A05' },
};

describe('parseHex', () => {
  it('reads the colour forms the themes use', () => {
    assert.deepEqual(parseHex('#00E5FF'), [0, 229, 255]);
    assert.deepEqual(parseHex('#0af'), [0, 170, 255]);
    assert.deepEqual(parseHex('#10203040'), [16, 32, 48]); // alpha ignored
  });

  it('gives null for anything else', () => {
    for (const bad of ['', 'red', '#12', '#12345', '00E5FF', 'rgb(0,0,0)', null, undefined]) {
      assert.equal(parseHex(bad as string), null);
    }
  });
});

describe('darkenColor', () => {
  it('scales every channel towards black', () => {
    assert.equal(darkenColor('#FFFFFF', 0.5), '#808080');
    assert.equal(darkenColor('#00E5FF', 0.18), '#00BCD1');
  });

  it('leaves the colour alone at 0, goes to black at 1, and clamps nonsense', () => {
    assert.equal(darkenColor('#4DA3FF', 0), '#4DA3FF');
    assert.equal(darkenColor('#4DA3FF', 1), '#000000');
    assert.equal(darkenColor('#4DA3FF', 5), '#000000');
    assert.equal(darkenColor('#4DA3FF', -1), '#4DA3FF');
  });

  it('is slightly darker by default, never lighter', () => {
    for (const { accent } of Object.values(THEMES)) {
      const darker = parseHex(darkenColor(accent))!;
      const original = parseHex(accent)!;
      for (let i = 0; i < 3; i++) assert.ok(darker[i] <= original[i]);
      assert.ok(darker.some((value, i) => value < original[i]) || accent === '#000000');
    }
  });

  it('returns a colour it cannot read unchanged', () => {
    assert.equal(darkenColor('not-a-colour'), 'not-a-colour');
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself, in either order', () => {
    assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 0.01);
    assert.ok(Math.abs(contrastRatio('#FFFFFF', '#000000') - 21) < 0.01);
    assert.equal(contrastRatio('#4DA3FF', '#4DA3FF'), 1);
  });
});

describe('readableTextOn', () => {
  it('keeps the preferred colour when it reads well', () => {
    assert.equal(readableTextOn('#800080', '#FFFFFF'), '#FFFFFF');
    assert.equal(readableTextOn('#4286D9', '#06121F'), '#06121F');
  });

  it('swaps it for white or black when it does not', () => {
    assert.equal(readableTextOn('#000000', '#06121F'), '#FFFFFF');
    assert.equal(readableTextOn('#F0F0F0', '#FFFFFF'), '#000000');
  });

  it('chooses white or black without a preference, or with an unreadable one', () => {
    assert.equal(readableTextOn('#101010'), '#FFFFFF');
    assert.equal(readableTextOn('#EEEEEE', 'nope'), '#000000');
  });
});

describe('ownBubbleColors', () => {
  it('fills with the accent a little darker', () => {
    assert.equal(ownBubbleColors('#00E5FF', '#000000').background, '#00BCD1');
    assert.equal(ownBubbleColors('#800080', '#FFFFFF').background, darkenColor('#800080'));
  });

  for (const [name, { accent, buttonText }] of Object.entries(THEMES)) {
    it(`reads well in the ${name} theme`, () => {
      const own = ownBubbleColors(accent, buttonText);
      assert.ok(contrastRatio(own.text, own.background) >= 4.5, 'message text');
      assert.ok(contrastRatio(own.readTick, own.background) >= 3, 'read tick');
      assert.notEqual(own.readTick.toUpperCase(), own.text.toUpperCase(), 'a read tick differs from the text colour');
    });
  }

  it('shows the read tick in a blue, not the text colour', () => {
    // Blue-ish: the blue channel is the largest.
    for (const { accent, buttonText } of Object.values(THEMES)) {
      const [r, g, b] = parseHex(ownBubbleColors(accent, buttonText).readTick)!;
      assert.ok(b > r && b > g);
    }
  });

  it('copes with an accent it cannot read', () => {
    const own = ownBubbleColors('broken');
    assert.equal(own.background, 'broken');
    assert.ok(own.text === '#FFFFFF' || own.text === '#000000');
  });

  it('draws sent and delivered ticks fainter than the text', () => {
    assert.ok(IDLE_TICK_OPACITY > 0 && IDLE_TICK_OPACITY < 1);
  });
});
