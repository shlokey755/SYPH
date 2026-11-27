import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HUE_ICON_NAMES,
  accentColors,
  accentForHue,
  hueIconAccents,
  hueOf,
  iconNameForHue,
  normalizeHue,
  profileHueOf,
  textOnAccent,
} from '../../src/utils/accentColor.ts';

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('hues', () => {
  it('are whole numbers from 0 to 359, however they are given', () => {
    assert.equal(normalizeHue(0), 0);
    assert.equal(normalizeHue(360), 0);
    assert.equal(normalizeHue(-30), 330);
    assert.equal(normalizeHue(725.6), 6);
    assert.equal(normalizeHue(359.6), 0);
  });

  it('are read back from numbers and numeric strings only', () => {
    assert.equal(hueOf(210), 210);
    assert.equal(hueOf('210'), 210);
    assert.equal(hueOf(' 45 '), 45);
    assert.equal(hueOf(-90), 270);
    for (const bad of [null, undefined, '', '  ', 'blue', NaN, Infinity, {}, [], true]) assert.equal(hueOf(bad), null, String(bad));
  });

  it('tell "no hue chosen" (null) from "not saved" (undefined) on a profile', () => {
    assert.equal(profileHueOf(null), null);
    assert.equal(profileHueOf(0), 0);
    assert.equal(profileHueOf(400), 40);
    assert.equal(profileHueOf(undefined), undefined);
    assert.equal(profileHueOf('red'), undefined);
    assert.equal(profileHueOf({}), undefined);
  });
});

describe('accentForHue', () => {
  it('gives the Cyber theme its own colour, give or take a shade, at its hue on a dark theme', () => {
    const [r, g, b] = channels(accentForHue(186, true));
    const [cr, cg, cb] = channels('#00E5FF');
    assert.ok(Math.abs(r - cr) <= 3 && Math.abs(g - cg) <= 3 && Math.abs(b - cb) <= 3, accentForHue(186, true));
  });

  it('is a #RRGGBB colour for every hue, on both kinds of theme', () => {
    for (let hue = 0; hue < 360; hue += 1) {
      assert.match(accentForHue(hue, true), /^#[0-9A-F]{6}$/);
      assert.match(accentForHue(hue, false), /^#[0-9A-F]{6}$/);
    }
  });

  it('is readable on its theme for every hue: 5:1 on black, 7:1 on white, and so are the letters on it', () => {
    for (let hue = 0; hue < 360; hue += 1) {
      const dark = accentForHue(hue, true);
      const light = accentForHue(hue, false);
      assert.ok(contrast(dark, '#000000') >= 5, `hue ${hue} on black: ${dark}`);
      assert.ok(contrast(dark, '#0D1117') >= 4.5, `hue ${hue} on a dark card: ${dark}`);
      assert.ok(contrast(light, '#FFFFFF') >= 7, `hue ${hue} on white: ${light}`);
      assert.ok(contrast(light, '#F5F5DC') >= 6, `hue ${hue} on beige: ${light}`);
      for (const accent of [dark, light]) {
        assert.ok(contrast(accent, textOnAccent(accent)) >= 4.5, `text on ${accent}`);
      }
    }
  });

  it('keeps the hue: the strongest channel is where the hue says it should be', () => {
    const [r1, g1, b1] = channels(accentForHue(0, true));
    assert.ok(r1 > g1 && r1 > b1, 'red');
    const [r2, g2, b2] = channels(accentForHue(120, true));
    assert.ok(g2 > r2 && g2 > b2, 'green');
    const [r3, g3, b3] = channels(accentForHue(240, true));
    assert.ok(b3 > r3 && b3 > g3, 'blue');
  });

  it('is deeper on a light theme than on a dark one', () => {
    for (const hue of [0, 60, 120, 187, 240, 300]) {
      assert.ok(luminance(accentForHue(hue, false)) < luminance(accentForHue(hue, true)), `hue ${hue}`);
    }
  });

  it('wraps: -30 is 330', () => {
    assert.equal(accentForHue(-30, true), accentForHue(330, true));
    assert.equal(accentForHue(360, false), accentForHue(0, false));
  });
});

describe('text on an accent', () => {
  it('is black on bright colours and white on dark ones', () => {
    assert.equal(textOnAccent('#FFFF00'), '#000000');
    assert.equal(textOnAccent('#00E5FF'), '#000000');
    assert.equal(textOnAccent('#000080'), '#FFFFFF');
    assert.equal(textOnAccent('#800080'), '#FFFFFF');
  });

  it('falls back to black for something that is not a colour', () => {
    assert.equal(textOnAccent('cyan'), '#000000');
  });

  it('comes with the accent from accentColors', () => {
    const colors = accentColors(210, true);
    assert.equal(colors.accent, accentForHue(210, true));
    assert.equal(colors.buttonText, textOnAccent(colors.accent));
  });
});

describe('launcher icons', () => {
  it('are twelve, named hue000 to hue330', () => {
    assert.equal(HUE_ICON_NAMES.length, 12);
    assert.equal(HUE_ICON_NAMES[0], 'hue000');
    assert.equal(HUE_ICON_NAMES[1], 'hue030');
    assert.equal(HUE_ICON_NAMES[11], 'hue330');
  });

  it('are valid Android resource names (lower case letters and digits, starting with a letter)', () => {
    for (const name of HUE_ICON_NAMES) assert.match(name, /^[a-z][a-z0-9]*$/);
  });

  it('are picked by the closest hue, wrapping at the top', () => {
    assert.equal(iconNameForHue(0), 'hue000');
    assert.equal(iconNameForHue(14), 'hue000');
    assert.equal(iconNameForHue(15), 'hue030');
    assert.equal(iconNameForHue(186), 'hue180');
    assert.equal(iconNameForHue(345), 'hue000');
    assert.equal(iconNameForHue(344), 'hue330');
    assert.equal(iconNameForHue(359), 'hue000');
    assert.equal(iconNameForHue(-10), 'hue000');
  });

  it('are painted with the accent the app uses for that hue', () => {
    const accents = hueIconAccents();
    assert.equal(accents.length, 12);
    for (const { name, hue, accent } of accents) {
      assert.equal(iconNameForHue(hue), name);
      assert.equal(accent, accentForHue(hue, true));
    }
  });
});
