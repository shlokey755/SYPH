import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPlayerHtml,
  isPlayerPage,
  isYouTubeUrl,
  parsePlayerMessage,
  PLAYER_ORIGIN,
  playerErrorText,
  playerSize,
} from '../../src/utils/youtubePlayer.ts';

const ID = 'dQw4w9WgXcQ';

describe('buildPlayerHtml', () => {
  it('embeds the video with the app origin and the player API switched on', () => {
    const html = buildPlayerHtml(ID);
    assert.ok(html);
    assert.ok(html.includes(`https://www.youtube-nocookie.com/embed/${ID}?`));
    assert.ok(html.includes('enablejsapi=1'));
    assert.ok(html.includes('playsinline=1'));
    assert.ok(html.includes(`origin=${encodeURIComponent(PLAYER_ORIGIN)}`));
    assert.ok(html.includes('referrerpolicy="strict-origin-when-cross-origin"'));
  });

  it('has no fullscreen button, which cannot work inside a Modal', () => {
    const html = buildPlayerHtml(ID);
    assert.ok(html.includes('fs=0'));
    assert.ok(!html.includes('allowfullscreen'));
  });

  it('puts the id in the page exactly once', () => {
    assert.equal(buildPlayerHtml(ID).split(ID).length - 1, 1);
  });

  it('refuses anything that is not an 11-character YouTube id', () => {
    for (const bad of ['', 'short', `${ID}x`, '"><script>alert(1)</script>', `${ID}"onload="x`, 'dQw4w9WgXc ', '../../etc/pw']) {
      assert.equal(buildPlayerHtml(bad), null, bad);
    }
  });
});

describe('parsePlayerMessage', () => {
  it('reads ready and error messages', () => {
    assert.deepEqual(parsePlayerMessage('{"type":"ready"}'), { type: 'ready' });
    assert.deepEqual(parsePlayerMessage('{"type":"error","code":153}'), { type: 'error', code: 153 });
    assert.deepEqual(parsePlayerMessage('{"type":"error","code":-1}'), { type: 'error', code: -1 });
  });

  it('ignores everything else', () => {
    for (const raw of [
      undefined,
      null,
      42,
      '',
      'not json',
      '[]',
      'null',
      '{"type":"error"}',
      '{"type":"error","code":"153"}',
      '{"type":"other"}',
      { type: 'ready' },
    ]) {
      assert.equal(parsePlayerMessage(raw), null, String(raw));
    }
  });
});

describe('playerErrorText', () => {
  it('explains the common YouTube error codes differently', () => {
    const texts = new Set([100, 101, 153, -1, 2].map(playerErrorText));
    assert.equal(texts.size, 5);
    assert.equal(playerErrorText(101), playerErrorText(150));
    assert.match(playerErrorText(100), /removed or made private/);
    assert.match(playerErrorText(101), /does not allow/);
  });
});

describe('navigation rules', () => {
  it('lets only the player page load', () => {
    assert.ok(isPlayerPage('about:blank'));
    assert.ok(isPlayerPage(PLAYER_ORIGIN));
    assert.ok(isPlayerPage(`${PLAYER_ORIGIN}/`));
    assert.ok(!isPlayerPage('https://com.syph.chat.evil.com/'));
    assert.ok(!isPlayerPage('https://www.youtube.com/watch?v=x'));
  });

  it('recognises YouTube links to hand to the system, and nothing look-alike', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `http://m.youtube.com/shorts/${ID}`,
      'https://www.youtube-nocookie.com/embed/x',
      'https://youtube.com',
    ]) {
      assert.ok(isYouTubeUrl(url), url);
    }
    for (const url of ['https://youtube.com.evil.com/x', 'https://notyoutube.com/', 'javascript:alert(1)', 'intent://x', '']) {
      assert.ok(!isYouTubeUrl(url), url);
    }
  });
});

describe('playerSize', () => {
  it('makes a video 16:9 and as wide as the screen allows', () => {
    assert.deepEqual(playerSize(false, 360, 800), { width: 336, height: 189 });
    assert.deepEqual(playerSize(false, 1200, 800), { width: 640, height: 360 });
  });

  it('makes a Short 9:16, tall but never past 62% of the screen or the screen width', () => {
    const phone = playerSize(true, 360, 800);
    assert.ok(phone.height <= 800 * 0.62 + 1 && phone.width <= 336);
    assert.ok(Math.abs(phone.width / phone.height - 9 / 16) < 0.02);
    const wideShort = playerSize(true, 300, 2000);
    assert.ok(wideShort.width <= 300 - 24);
  });

  it('never returns a zero or negative size on a tiny window', () => {
    for (const isShort of [false, true]) {
      const size = playerSize(isShort, 100, 100);
      assert.ok(size.width > 0 && size.height > 0);
    }
  });
});
