import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyOEmbed,
  extractYouTube,
  oEmbedUrl,
  previewTtlMs,
  thumbnailUrl,
  watchUrl,
} from '../../src/utils/linkPreview.ts';

const ID = 'dQw4w9WgXcQ';

describe('extractYouTube', () => {
  it('reads the three formats from the doc', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
    ]) {
      assert.equal(extractYouTube(url)?.id, ID, url);
    }
  });

  it('marks Shorts and opens the right page', () => {
    assert.deepEqual(extractYouTube(`https://youtube.com/shorts/${ID}?feature=share`), {
      id: ID,
      kind: 'short',
      openUrl: `https://www.youtube.com/shorts/${ID}`,
    });
    assert.deepEqual(extractYouTube(`https://youtu.be/${ID}?si=abc`), { id: ID, kind: 'video', openUrl: watchUrl(ID) });
  });

  it('handles mobile, embed, live and other query orders', () => {
    for (const url of [
      `https://m.youtube.com/watch?v=${ID}&t=30s`,
      `https://www.youtube.com/watch?feature=share&v=${ID}`,
      `http://youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}?si=x`,
      `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
    ]) {
      assert.equal(extractYouTube(url)?.id, ID, url);
    }
  });

  it('finds a link inside text and drops trailing punctuation', () => {
    assert.equal(extractYouTube(`look at this (https://youtu.be/${ID}).`)?.id, ID);
    assert.equal(extractYouTube(`omg https://youtu.be/${ID}!!`)?.id, ID);
    assert.equal(extractYouTube(`line one\nhttps://youtu.be/${ID}\nline three`)?.id, ID);
  });

  it('uses the first YouTube link and skips other links before it', () => {
    const text = `https://example.com/a then https://youtu.be/${ID} and https://youtu.be/aaaaaaaaaaa`;
    assert.equal(extractYouTube(text)?.id, ID);
  });

  it('does not match look-alike hosts, bad ids or plain text', () => {
    for (const text of [
      `https://youtube.com.evil.com/watch?v=${ID}`,
      `https://notyoutube.com/watch?v=${ID}`,
      `https://evil.com/?u=https://example.com/youtu.be/${ID}`,
      'https://www.youtube.com/watch?v=short',
      `https://www.youtube.com/watch?v=${ID}x`,
      'https://www.youtube.com/@somechannel',
      'https://www.youtube.com/playlist?list=PL123',
      'no link here',
      '',
    ]) {
      assert.equal(extractYouTube(text), null, text);
    }
    assert.equal(extractYouTube(undefined), null);
    assert.equal(extractYouTube(null), null);
  });
});

describe('url builders', () => {
  it('builds the oEmbed request from the watch URL, also for Shorts', () => {
    assert.equal(
      oEmbedUrl(ID),
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`)}&format=json`,
    );
    assert.equal(thumbnailUrl(ID), `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});

describe('classifyOEmbed', () => {
  const body = { title: '  Never Gonna Give You Up  ', author_name: 'Rick Astley', thumbnail_url: 'https://i.ytimg.com/vi/x/hq.jpg' };

  it('reads a good response', () => {
    assert.deepEqual(classifyOEmbed(200, body, ID), {
      state: 'ok',
      title: 'Never Gonna Give You Up',
      author: 'Rick Astley',
      thumbnail: 'https://i.ytimg.com/vi/x/hq.jpg',
    });
  });

  it('falls back to the id thumbnail when the response has none or a non-https one', () => {
    for (const thumbnail_url of [undefined, 'http://i.ytimg.com/x.jpg', 42]) {
      const r = classifyOEmbed(200, { ...body, thumbnail_url }, ID);
      assert.equal(r.state, 'ok');
      assert.equal(r.thumbnail, thumbnailUrl(ID));
    }
  });

  it('caps long titles and tolerates a missing channel', () => {
    const r = classifyOEmbed(200, { title: 'x'.repeat(500) }, ID);
    assert.equal(r.state, 'ok');
    assert.equal(r.title.length, 200);
    assert.equal(r.author, '');
  });

  it('only 404 and 400 mean the video is gone', () => {
    assert.equal(classifyOEmbed(404, null, ID).state, 'unavailable');
    assert.equal(classifyOEmbed(400, null, ID).state, 'unavailable');
  });

  it('401 and 403 mean it exists but cannot be previewed', () => {
    assert.equal(classifyOEmbed(401, null, ID).state, 'restricted');
    assert.equal(classifyOEmbed(403, null, ID).state, 'restricted');
  });

  it('server errors, rate limits and bad bodies are errors, never "unavailable"', () => {
    for (const status of [429, 500, 502, 503, 0]) {
      assert.equal(classifyOEmbed(status, null, ID).state, 'error', String(status));
    }
    assert.equal(classifyOEmbed(200, null, ID).state, 'error');
    assert.equal(classifyOEmbed(200, 'text', ID).state, 'error');
    assert.equal(classifyOEmbed(200, { author_name: 'x' }, ID).state, 'error');
  });
});

describe('previewTtlMs', () => {
  it('re-checks good results later than failures, and retries errors soon', () => {
    assert.ok(previewTtlMs('error') < previewTtlMs('unavailable'));
    assert.ok(previewTtlMs('unavailable') < previewTtlMs('ok'));
    assert.equal(previewTtlMs('unavailable'), previewTtlMs('restricted'));
  });
});
