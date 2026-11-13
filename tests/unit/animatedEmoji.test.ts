import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  animationSize,
  animationUrls,
  buildIndex,
  emojiCodepoints,
  hasSkinTone,
  lookupKey,
  MAX_ANIMATED_IMAGES,
  NOTO_ANIMATION_BASE,
  parseAnimatedList,
  typedCode,
} from '../../src/utils/animatedEmoji.ts';

const GORILLA = '🦍';
const BASE = NOTO_ANIMATION_BASE;

describe('code points', () => {
  it('reads an emoji as lowercase hex', () => {
    assert.deepEqual(emojiCodepoints(GORILLA), ['1f98d']);
    assert.deepEqual(emojiCodepoints('☺️'), ['263a', 'fe0f']);
    assert.equal(typedCode('☺️'), '263a_fe0f');
    assert.equal(typedCode('❤️‍🔥'), '2764_fe0f_200d_1f525');
  });

  it('matches with or without the emoji selector', () => {
    assert.equal(lookupKey('263a_fe0f'), '263a');
    assert.equal(lookupKey('263A'), '263a');
    assert.equal(lookupKey('2764_fe0f_200d_1f525'), '2764_200d_1f525');
    assert.equal(lookupKey('1f98d'), '1f98d');
  });

  it('spots skin tones', () => {
    assert.equal(hasSkinTone('👍🏽'), true);
    assert.equal(hasSkinTone('👍'), false);
    assert.equal(hasSkinTone(GORILLA), false);
  });
});

describe('parseAnimatedList', () => {
  it('reads the codes from the published file', () => {
    const json = { icons: [{ codepoint: '1f98d', tags: [':gorilla:'] }, { codepoint: '263a_fe0f' }, { codepoint: '1F600' }] };
    assert.deepEqual(parseAnimatedList(json), ['1f98d', '263a_fe0f', '1f600']);
  });

  it('skips entries that are not codes', () => {
    const json = { icons: [{ codepoint: 'gorilla' }, { codepoint: 5 }, null, 'x', {}, { codepoint: '1f98d' }, { codepoint: '1f98d_' }] };
    assert.deepEqual(parseAnimatedList(json), ['1f98d']);
  });

  it('gives an empty list for anything unexpected', () => {
    for (const bad of [null, undefined, 'oops', 42, [], {}, { icons: 'nope' }, { icons: {} }, '<html>error</html>']) {
      assert.deepEqual(parseAnimatedList(bad), []);
    }
  });
});

describe('animationUrls with the list', () => {
  const index = buildIndex(['1f98d', '263a_fe0f', '2764_fe0f_200d_1f525', '1f600']);

  it('uses the folder name exactly as the list gives it, WebP first then GIF', () => {
    assert.deepEqual(animationUrls(GORILLA, index), [`${BASE}/1f98d/512.webp`, `${BASE}/1f98d/512.gif`]);
  });

  it('finds an emoji however the selector is typed', () => {
    const want = [`${BASE}/263a_fe0f/512.webp`, `${BASE}/263a_fe0f/512.gif`];
    assert.deepEqual(animationUrls('☺️', index), want);
    assert.deepEqual(animationUrls('☺', index), want);
  });

  it('finds joined emoji', () => {
    assert.equal(animationUrls('❤️‍🔥', index)[0], `${BASE}/2764_fe0f_200d_1f525/512.webp`);
  });

  it('has nothing for an emoji that is not in the list, and for skin tones', () => {
    assert.deepEqual(animationUrls('🦧', index), []);
    assert.deepEqual(animationUrls('👍🏽', buildIndex(['1f44d', '1f44d_1f3fd'])), []);
  });
});

describe('animationUrls without the list', () => {
  it('guesses the folder as typed', () => {
    assert.deepEqual(animationUrls(GORILLA, null), [`${BASE}/1f98d/512.webp`, `${BASE}/1f98d/512.gif`]);
    assert.deepEqual(animationUrls(GORILLA, new Map()), [`${BASE}/1f98d/512.webp`, `${BASE}/1f98d/512.gif`]);
  });

  it('also tries it without the selector, WebP first', () => {
    assert.deepEqual(animationUrls('☺️', null), [
      `${BASE}/263a_fe0f/512.webp`,
      `${BASE}/263a/512.webp`,
      `${BASE}/263a_fe0f/512.gif`,
    ]);
  });

  it('has nothing for skin tones', () => {
    assert.deepEqual(animationUrls('👍🏽', null), []);
  });
});

describe('animationSize', () => {
  it('is big for one emoji and smaller as there are more, never growing', () => {
    const sizes = Array.from({ length: MAX_ANIMATED_IMAGES }, (_, i) => animationSize(i + 1));
    for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] <= sizes[i - 1]);
    assert.equal(animationSize(1), 112);
  });
});
