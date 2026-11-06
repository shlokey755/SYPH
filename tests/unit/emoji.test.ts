import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emojiOnly, emojiSize, MAX_ANIMATED_EMOJI, splitEmoji } from '../../src/utils/emoji.ts';

describe('emoji-only messages', () => {
  it('finds a single emoji', () => {
    assert.deepEqual(emojiOnly('😀'), ['😀']);
    assert.deepEqual(emojiOnly('❤️'), ['❤️']);
    assert.deepEqual(emojiOnly('❤'), ['❤']);
    assert.deepEqual(emojiOnly('✅'), ['✅']);
  });

  it('splits several emoji, with or without spaces and line breaks', () => {
    assert.deepEqual(emojiOnly('😀😂🔥'), ['😀', '😂', '🔥']);
    assert.deepEqual(emojiOnly('😀 😂\n🔥'), ['😀', '😂', '🔥']);
    assert.deepEqual(emojiOnly('  🎉  '), ['🎉']);
  });

  it('keeps skin tones, joined emoji and flags as one emoji', () => {
    assert.deepEqual(emojiOnly('👍🏽'), ['👍🏽']);
    assert.deepEqual(emojiOnly('👨‍👩‍👧‍👦'), ['👨‍👩‍👧‍👦']);
    assert.deepEqual(emojiOnly('🏳️‍🌈'), ['🏳️‍🌈']);
    assert.deepEqual(emojiOnly('🇮🇳'), ['🇮🇳']);
    assert.deepEqual(emojiOnly('🇮🇳🇺🇸'), ['🇮🇳', '🇺🇸']);
    assert.deepEqual(emojiOnly('🏴󠁧󠁢󠁥󠁮󠁧󠁿'), ['🏴󠁧󠁢󠁥󠁮󠁧󠁿']);
    assert.deepEqual(emojiOnly('1️⃣'), ['1️⃣']);
    assert.deepEqual(emojiOnly('#️⃣'), ['#️⃣']);
    assert.deepEqual(emojiOnly('↔️'), ['↔️']);
  });

  it('is null as soon as there is any text', () => {
    for (const text of ['hello', 'hi 😀', '😀 hi', '😀!', '😀.', '1', '#', '2 😀', 'a😀b', '😀 :)']) {
      assert.equal(emojiOnly(text), null, text);
    }
  });

  it('does not count symbols that are plain text without the emoji selector', () => {
    for (const text of ['©', '™', '↔', '®', '▶']) assert.equal(emojiOnly(text), null, text);
  });

  it('is null for nothing, whitespace only, or things that are not strings', () => {
    assert.equal(emojiOnly(''), null);
    assert.equal(emojiOnly('   '), null);
    assert.equal(emojiOnly('\n'), null);
    assert.equal(emojiOnly(undefined), null);
    assert.equal(emojiOnly(null), null);
  });

  it('rejects a lone regional indicator, which is half a flag', () => {
    assert.equal(emojiOnly('🇮'), null);
    assert.equal(emojiOnly('🇮🇳🇺'), null);
  });

  it('stops at the longest run it animates', () => {
    assert.equal(emojiOnly('😀'.repeat(MAX_ANIMATED_EMOJI))?.length, MAX_ANIMATED_EMOJI);
    assert.equal(emojiOnly('😀'.repeat(MAX_ANIMATED_EMOJI + 1)), null);
    assert.equal(splitEmoji('😀'.repeat(200)), null);
  });
});

describe('emoji size', () => {
  it('shrinks as there are more of them and never grows again', () => {
    const sizes = [1, 2, 3, 4, 5, 6, 8].map(emojiSize);
    for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] <= sizes[i - 1]);
    assert.equal(emojiSize(1), 52);
    assert.ok(emojiSize(MAX_ANIMATED_EMOJI) >= 20);
  });
});
