import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import {
  FONT,
  hashSeed,
  initialOf,
  isBold,
  mixColors,
  pick,
  resolveFont,
  shadowSpec,
  tilt,
  withAlpha,
} from '../../src/theme/parchment.ts';

describe('isBold', () => {
  it('reads every spelling of bold, and nothing else', () => {
    for (const weight of ['bold', '600', '700', '900', 600, 700, 900]) assert.equal(isBold(weight), true, String(weight));
    for (const weight of ['normal', '400', '500', 400, 500, undefined]) assert.equal(isBold(weight), false, String(weight));
  });
});

describe('resolveFont', () => {
  it('gives the body kind its four cuts', () => {
    assert.equal(resolveFont('body').fontFamily, FONT.body);
    assert.equal(resolveFont('body', '700').fontFamily, FONT.bodyBold);
    assert.equal(resolveFont('body', undefined, 'italic').fontFamily, FONT.bodyItalic);
    assert.equal(resolveFont('body', 'bold', 'italic').fontFamily, FONT.bodyBoldItalic);
  });

  it('ignores weight and slant for the faces that have no such cuts', () => {
    assert.equal(resolveFont('display', '700', 'italic').fontFamily, FONT.display);
    assert.equal(resolveFont('label', 'bold').fontFamily, FONT.label);
    assert.equal(resolveFont('hand', undefined, 'italic').fontFamily, FONT.hand);
  });

  it('always turns off the synthetic weight and slant, which would smear the letters', () => {
    for (const kind of ['body', 'display', 'label', 'hand'] as const) {
      const font = resolveFont(kind, '700', 'italic');
      assert.equal(font.fontWeight, 'normal');
      assert.equal(font.fontStyle, 'normal');
    }
  });

  it('only names fonts that are bundled with the app', () => {
    const files = readFileSync(new URL('../../src/theme/fonts.ts', import.meta.url), 'utf8');
    for (const [slot, name] of Object.entries(FONT)) {
      assert.ok(files.includes(`[FONT.${slot}]`), `${name} is not registered in theme/fonts.ts`);
    }
    for (const match of files.matchAll(/require\('\.\.\/\.\.\/assets\/fonts\/([^']+)'\)/g)) {
      assert.ok(existsSync(new URL(`../../assets/fonts/${match[1]}`, import.meta.url)), `${match[1]} is missing from assets/fonts`);
    }
  });

  it('ships the licence for every typeface family', () => {
    for (const file of ['OFL-PirataOne.txt', 'OFL-CrimsonText.txt', 'OFL-IMFellEnglish.txt']) {
      assert.ok(existsSync(new URL(`../../assets/fonts/licenses/${file}`, import.meta.url)), `${file} is missing`);
    }
  });
});

describe('hashSeed and tilt', () => {
  it('give the same answer every time for the same seed, and different answers for different ones', () => {
    assert.equal(hashSeed('abc'), hashSeed('abc'));
    assert.notEqual(hashSeed('abc'), hashSeed('abd'));
    assert.equal(hashSeed(42), hashSeed('42'));
  });

  it('keep every tilt within the limit', () => {
    for (let i = 0; i < 500; i++) {
      const angle = tilt(`message-${i}`, 1.5);
      assert.ok(Math.abs(angle) <= 1.5, `${angle}`);
    }
    assert.equal(tilt('x', 0), 0);
  });

  it('spread the tilts both ways so neighbours do not all lean together', () => {
    const angles = Array.from({ length: 200 }, (_, i) => tilt(i, 2));
    assert.ok(angles.some((a) => a > 0.5));
    assert.ok(angles.some((a) => a < -0.5));
  });
});

describe('pick', () => {
  it('chooses the same item for the same seed', () => {
    const items = ['a', 'b', 'c'] as const;
    assert.equal(pick(items, 'seed'), pick(items, 'seed'));
    assert.ok(items.includes(pick(items, 'other')));
  });
});

describe('withAlpha', () => {
  it('writes #RGB and #RRGGBB colours as rgba', () => {
    assert.equal(withAlpha('#FFF', 0.5), 'rgba(255, 255, 255, 0.5)');
    assert.equal(withAlpha('#33200F', 0.25), 'rgba(51, 32, 15, 0.25)');
  });

  it('holds the alpha between 0 and 1 and leaves other colour spellings alone', () => {
    assert.equal(withAlpha('#000000', 2), 'rgba(0, 0, 0, 1)');
    assert.equal(withAlpha('#000000', -1), 'rgba(0, 0, 0, 0)');
    assert.equal(withAlpha('red', 0.5), 'red');
  });
});

describe('mixColors', () => {
  it('blends from one colour toward another', () => {
    assert.equal(mixColors('#000000', '#FFFFFF', 0), '#000000');
    assert.equal(mixColors('#000000', '#FFFFFF', 1), '#FFFFFF');
    assert.equal(mixColors('#000000', '#FFFFFF', 0.5), '#808080');
    assert.equal(mixColors('#C79A2E', '#000000', 0.5), '#644D17');
  });

  it('holds the amount between 0 and 1 and returns the first colour when one cannot be read', () => {
    assert.equal(mixColors('#102030', '#FFFFFF', -4), '#102030');
    assert.equal(mixColors('#102030', '#FFFFFF', 9), '#FFFFFF');
    assert.equal(mixColors('red', '#FFFFFF', 0.5), 'red');
    assert.equal(mixColors('#102030', 'rgba(0,0,0,1)', 0.5), '#102030');
  });
});

describe('initialOf', () => {
  it('takes the first letter, capitalised, and counts an emoji as one letter', () => {
    assert.equal(initialOf('mira'), 'M');
    assert.equal(initialOf('  zed'), 'Z');
    assert.equal(initialOf('🏴‍☠️ crew'), '🏴');
  });

  it('gives a question mark when there is no name', () => {
    assert.equal(initialOf(''), '?');
    assert.equal(initialOf(null), '?');
    assert.equal(initialOf(undefined), '?');
  });
});

describe('shadowSpec', () => {
  it('gets deeper, softer and darker with every lift', () => {
    for (let lift = 1; lift <= 3; lift++) {
      const lower = shadowSpec(lift - 1);
      const higher = shadowSpec(lift);
      assert.ok(higher.offsetY >= lower.offsetY);
      assert.ok(higher.radius >= lower.radius);
      assert.ok(higher.opacity >= lower.opacity);
      assert.ok(higher.elevation >= lower.elevation);
    }
  });

  it('has no shadow at all for paper lying flat, and holds out-of-range lifts to the nearest', () => {
    assert.equal(shadowSpec(0).opacity, 0);
    assert.deepEqual(shadowSpec(-5), shadowSpec(0));
    assert.deepEqual(shadowSpec(99), shadowSpec(3));
  });
});
