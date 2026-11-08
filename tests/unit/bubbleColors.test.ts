import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  contrastRatio,
  darkenColor,
  parseHex,
  readableTextOn,
  readBubbleColors,
} from '../../src/utils/bubbleColors.ts';
import { vintage } from '../../src/theme/colors.ts';

// An accent and the colour put on top of it: the app's own (src/theme/colors.ts), then a spread of other pairs so the maths
// is also checked on black, dark, light and saturated accents.
const ACCENTS: Record<string, { accent: string; buttonText: string }> = {
  vintage: { accent: vintage.accent, buttonText: vintage.buttonText },
  black: { accent: '#000000', buttonText: '#FFFFFF' },
  plum: { accent: '#800080', buttonText: '#FFFFFF' },
  cyan: { accent: '#00E5FF', buttonText: '#000000' },
  blue: { accent: '#4DA3FF', buttonText: '#06121F' },
  green: { accent: '#3DDC84', buttonText: '#06130B' },
  coral: { accent: '#FF7A59', buttonText: '#1A0A05' },
};

describe('parseHex', () => {
  it('reads the colour forms the app uses', () => {
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
    for (const { accent } of Object.values(ACCENTS)) {
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

describe('readBubbleColors', () => {
  it('fills with the accent a little darker', () => {
    assert.equal(readBubbleColors('#00E5FF', '#000000').background, '#00BCD1');
    assert.equal(readBubbleColors('#800080', '#FFFFFF').background, darkenColor('#800080'));
  });

  it('is darker than the accent for every accent (black stays black)', () => {
    for (const { accent, buttonText } of Object.values(ACCENTS)) {
      const own = readBubbleColors(accent, buttonText);
      const darker = parseHex(own.background)!;
      const original = parseHex(accent)!;
      for (let i = 0; i < 3; i++) assert.ok(darker[i] <= original[i]);
    }
  });

  for (const [name, { accent, buttonText }] of Object.entries(ACCENTS)) {
    it(`keeps the text readable on the ${name} accent`, () => {
      const own = readBubbleColors(accent, buttonText);
      assert.ok(contrastRatio(own.text, own.background) >= 4.5);
    });
  }

  it('keeps the preferred text colour where it still reads well', () => {
    assert.equal(readBubbleColors('#4DA3FF', '#06121F').text, '#06121F');
    assert.equal(readBubbleColors('#00E5FF', '#000000').text, '#000000');
  });

  it('copes with an accent it cannot read', () => {
    const own = readBubbleColors('broken');
    assert.equal(own.background, 'broken');
    assert.ok(own.text === '#FFFFFF' || own.text === '#000000');
  });
});
