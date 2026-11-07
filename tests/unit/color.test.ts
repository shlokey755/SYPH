import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHex, withAlpha } from '../../src/utils/color.ts';

describe('parseHex', () => {
  it('reads the colour forms the themes use', () => {
    assert.deepEqual(parseHex('#00E5FF'), [0, 229, 255]);
    assert.deepEqual(parseHex('#0af'), [0, 170, 255]);
    assert.deepEqual(parseHex('#10203040'), [16, 32, 48]);
  });

  it('gives null for anything else', () => {
    for (const bad of ['', 'red', '#12', '#12345', '00E5FF', 'rgb(0,0,0)', null, undefined]) {
      assert.equal(parseHex(bad as string), null);
    }
  });
});

describe('withAlpha', () => {
  it('gives the same colour at the opacity asked for', () => {
    assert.equal(withAlpha('#00E5FF', 0), 'rgba(0, 229, 255, 0)');
    assert.equal(withAlpha('#00E5FF', 1), 'rgba(0, 229, 255, 1)');
    assert.equal(withAlpha('#4DA3FF', 0.5), 'rgba(77, 163, 255, 0.5)');
  });

  it('keeps the opacity between 0 and 1', () => {
    assert.equal(withAlpha('#000000', 7), 'rgba(0, 0, 0, 1)');
    assert.equal(withAlpha('#000000', -3), 'rgba(0, 0, 0, 0)');
  });

  it('gives transparent for a colour it cannot read', () => {
    assert.equal(withAlpha('nope', 0.5), 'transparent');
  });
});
