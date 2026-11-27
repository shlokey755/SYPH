import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { linkUrl, splitLinks } from '../../src/utils/linkify.ts';

/** [shown text, address opened] of every link in the text. */
const links = (text: string) => splitLinks(text).filter((part) => part.url).map((part) => [part.text, part.url]);
const urls = (text: string) => links(text).map(([, url]) => url);

describe('splitLinks: what is a link', () => {
  it('finds http and https addresses', () => {
    assert.deepEqual(links('look https://example.com/a/b?c=d&e=f#g now'), [
      ['https://example.com/a/b?c=d&e=f#g', 'https://example.com/a/b?c=d&e=f#g'],
    ]);
    assert.deepEqual(urls('http://example.org'), ['http://example.org']);
    assert.deepEqual(urls('http://localhost:3000/x'), ['http://localhost:3000/x']);
    assert.deepEqual(urls('https://192.168.1.5:8080/'), ['https://192.168.1.5:8080/']);
  });

  it('finds www addresses and opens them over https', () => {
    assert.deepEqual(links('go to www.example.com, ok'), [['www.example.com', 'https://www.example.com']]);
    assert.deepEqual(urls('WWW.Example.COM/Path'), ['https://WWW.Example.COM/Path']);
  });

  it('finds addresses typed without www or http when they end in a common ending', () => {
    assert.deepEqual(links('youtube.com/watch?v=dQw4w9WgXcQ'), [
      ['youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
    ]);
    assert.deepEqual(urls('bit.ly/3x and google.co.in/search?q=a&b=c#f'), [
      'https://bit.ly/3x',
      'https://google.co.in/search?q=a&b=c#f',
    ]);
    assert.deepEqual(urls('Youtube.com is down'), ['https://Youtube.com']);
    assert.deepEqual(urls('sub.domain.example.org:8080/x'), ['https://sub.domain.example.org:8080/x']);
  });

  it('writes the scheme in lower case but leaves the rest alone', () => {
    assert.deepEqual(urls('HTTPS://Example.com/Path'), ['https://Example.com/Path']);
    assert.equal(linkUrl('HTTP://x.org'), 'http://x.org');
    assert.equal(linkUrl('x.org'), 'https://x.org');
  });

  it('finds several links in one message, in order', () => {
    assert.deepEqual(urls('a https://one.com b www.two.org c three.net/x d'), [
      'https://one.com',
      'https://www.two.org',
      'https://three.net/x',
    ]);
  });

  it('finds a link in the middle of other writing', () => {
    assert.deepEqual(urls('link:https://a.com'), ['https://a.com']);
    assert.deepEqual(urls('(https://a.com)'), ['https://a.com']);
    assert.deepEqual(urls('"https://a.com"'), ['https://a.com']);
    assert.deepEqual(urls('see\nhttps://a.com\nthanks'), ['https://a.com']);
  });

  it('splits two links joined by a comma', () => {
    assert.deepEqual(urls('https://a.com,https://b.org!'), ['https://a.com', 'https://b.org']);
  });
});

describe('splitLinks: what is not a link', () => {
  it('leaves ordinary writing alone', () => {
    for (const text of [
      'plain words only',
      'e.g. this, i.e. that, U.S. and a.m. p.m.',
      'file.txt notes.pdf photo.jpg index.html',
      'version 7.5.5 and pi 3.14 and 1.2.3.4',
      'Done.In the morning',
      'hello.World',
      'a.b',
      '...',
      '',
    ]) {
      assert.deepEqual(links(text), [], text);
    }
  });

  it('leaves email addresses alone', () => {
    for (const text of ['me@example.com', 'user@sub.example.co.in', 'mail me@example.com or you@example.org please']) {
      assert.deepEqual(links(text), [], text);
    }
  });

  it('never makes a scheme other than http and https tappable', () => {
    for (const text of ['javascript:alert(1)', 'ftp://example.com', 'tel:+911234567890', 'file:///etc/passwd', 'intent://x#Intent;end', 'mailto:a@b.com', 'data:text/html,<b>x</b>']) {
      assert.deepEqual(links(text), [], text);
    }
  });

  it('needs something after http:// and www.', () => {
    assert.deepEqual(links('https:// and www. alone, http://. too'), []);
    assert.deepEqual(links('www.com'), []);
    assert.deepEqual(links('http://nodot'), []);
  });

  it('does not start a link in the middle of a word or a longer address', () => {
    assert.deepEqual(links('xhttps://a.com'), []);
    assert.deepEqual(links('x/y.com'), []);
    assert.deepEqual(links('what?foo.com'), []);
  });
});

describe('splitLinks: where a link ends', () => {
  it('leaves out punctuation that ends the sentence', () => {
    for (const end of ['.', ',', ';', ':', '!', '?', '...', '?!', '."', "'", '!!']) {
      assert.deepEqual(urls(`see https://a.com/x${end}`), ['https://a.com/x'], end);
    }
    assert.deepEqual(urls('visit example.com.'), ['https://example.com']);
    assert.deepEqual(urls('visit example.com.Thanks'), ['https://example.com']);
  });

  it('leaves out a closing bracket the link did not open, and keeps one it did', () => {
    assert.deepEqual(urls('(see https://a.com/x)'), ['https://a.com/x']);
    assert.deepEqual(urls('(see https://a.com/x).'), ['https://a.com/x']);
    assert.deepEqual(urls('[https://a.com/x]'), ['https://a.com/x']);
    assert.deepEqual(urls('(see https://en.wikipedia.org/wiki/Foo_(bar))'), ['https://en.wikipedia.org/wiki/Foo_(bar)']);
    assert.deepEqual(urls('https://en.wikipedia.org/wiki/Foo_(bar).'), ['https://en.wikipedia.org/wiki/Foo_(bar)']);
  });

  it('keeps a query string, a fragment and a trailing slash', () => {
    assert.deepEqual(urls('https://a.com/?q=1&r=2'), ['https://a.com/?q=1&r=2']);
    assert.deepEqual(urls('https://a.com/#top'), ['https://a.com/#top']);
    assert.deepEqual(urls('https://a.com/path/'), ['https://a.com/path/']);
  });
});

describe('splitLinks: the parts', () => {
  it('add up to the original text, character for character', () => {
    for (const text of [
      '',
      'no links',
      'https://a.com',
      'see https://a.com/x. Then www.b.org, and c.net/y! (https://d.io/z) me@e.com e.g. 7.5.5',
      'line one\nhttps://a.com\n\nline three  www.b.org  ',
      'link:https://a.com,https://b.org!',
      '  leading and trailing  ',
    ]) {
      assert.equal(splitLinks(text).map((part) => part.text).join(''), text, JSON.stringify(text));
    }
  });

  it('are plain text between the links and none when there are none', () => {
    assert.deepEqual(splitLinks('hi https://a.com bye'), [
      { text: 'hi ' },
      { text: 'https://a.com', url: 'https://a.com' },
      { text: ' bye' },
    ]);
    assert.deepEqual(splitLinks('hello'), [{ text: 'hello' }]);
    assert.deepEqual(splitLinks(''), []);
  });

  it('only ever carry http or https addresses', () => {
    const text = 'https://a.com www.b.org c.net/x HTTP://D.IO javascript:alert(1) ftp://e.com';
    for (const part of splitLinks(text)) if (part.url) assert.match(part.url, /^https?:\/\//);
  });
});
