import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GifCache, gifKey, gifMime, parseGifs } from '../../src/utils/gifs.ts';

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  images: {
    fixed_width: {
      url: `https://media.giphy.com/media/${id}/200w.gif`,
      webp: `https://media.giphy.com/media/${id}/200w.webp`,
      width: '200',
      height: '150',
    },
    fixed_width_still: { url: `https://media.giphy.com/media/${id}/200w_s.gif` },
  },
  ...extra,
});

describe('reading a Giphy response', () => {
  it('uses the WebP file and keeps the still and the size', () => {
    const [gif] = parseGifs({ data: [item('a')] });
    assert.deepEqual(gif, {
      id: 'a',
      url: 'https://media.giphy.com/media/a/200w.webp',
      still: 'https://media.giphy.com/media/a/200w_s.gif',
      width: 200,
      height: 150,
    });
  });

  it('falls back to the GIF when there is no WebP', () => {
    const noWebp = item('a');
    delete (noWebp.images.fixed_width as Record<string, unknown>).webp;
    assert.equal(parseGifs({ data: [noWebp] })[0].url, 'https://media.giphy.com/media/a/200w.gif');
  });

  it('works without a still', () => {
    const noStill = item('a');
    delete (noStill.images as Record<string, unknown>).fixed_width_still;
    assert.equal(parseGifs({ data: [noStill] })[0].still, null);
  });

  it('skips entries that are broken, and repeated ids', () => {
    const list = parseGifs({
      data: [item('a'), { id: 'b' }, { images: {} }, null, item('a'), { id: 'c', images: { fixed_width: { url: 'http://insecure/c.gif' } } }, item('d')],
    });
    assert.deepEqual(list.map((g) => g.id), ['a', 'd']);
  });

  it('gives a square box when the size is missing or nonsense', () => {
    const odd = item('a');
    odd.images.fixed_width.width = 'wide';
    odd.images.fixed_width.height = '0';
    const [gif] = parseGifs({ data: [odd] });
    assert.equal(gif.width, 200);
    assert.equal(gif.height, 200);
  });

  it('is empty for anything that is not a list of GIFs', () => {
    for (const bad of [null, undefined, 5, 'x', {}, { data: null }, { data: 'x' }, { data: {} }]) {
      assert.deepEqual(parseGifs(bad), []);
    }
  });
});

describe('search keys and mime types', () => {
  it('treats spacing and capitals as the same search', () => {
    assert.equal(gifKey('  Happy   CAT '), 'happy cat');
    assert.equal(gifKey(''), '');
    assert.equal(gifKey('   '), '');
  });

  it('tells WebP from GIF by the file, ignoring the query string', () => {
    assert.equal(gifMime('https://media2.giphy.com/media/v1.x/abc/200w.webp?cid=1&ep=v1'), 'image/webp');
    assert.equal(gifMime('https://media.giphy.com/media/abc/200w.WEBP'), 'image/webp');
    assert.equal(gifMime('https://media.giphy.com/media/abc/200.gif?cid=1'), 'image/gif');
    assert.equal(gifMime('https://media.giphy.com/media/abc/giphy.gif?x=.webp'), 'image/gif');
  });
});

describe('result cache', () => {
  it('has nothing for a search it has not seen', () => {
    assert.equal(new GifCache<number>(1000, 5).peek('cats'), undefined);
  });

  it('is fresh inside the time limit and stale (but still returned) after it', () => {
    const cache = new GifCache<string>(1000, 5);
    cache.set('cats', 'result', 10_000);
    assert.deepEqual(cache.peek('cats', 10_999), { value: 'result', fresh: true });
    assert.deepEqual(cache.peek('cats', 11_000), { value: 'result', fresh: false });
    assert.deepEqual(cache.peek('cats', 99_000), { value: 'result', fresh: false });
  });

  it('setting again replaces the result and restarts the clock', () => {
    const cache = new GifCache<string>(1000, 5);
    cache.set('cats', 'old', 0);
    cache.set('cats', 'new', 5_000);
    assert.deepEqual(cache.peek('cats', 5_500), { value: 'new', fresh: true });
    assert.equal(cache.size, 1);
  });

  it('drops the one used longest ago when full, and reading keeps one alive', () => {
    const cache = new GifCache<number>(1000, 3);
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    cache.set('c', 3, 0);
    cache.peek('a', 0); // a is now the newest, so b is the oldest
    cache.set('d', 4, 0);
    assert.equal(cache.size, 3);
    assert.equal(cache.peek('b', 0), undefined);
    assert.ok(cache.peek('a', 0) && cache.peek('c', 0) && cache.peek('d', 0));
  });
});
