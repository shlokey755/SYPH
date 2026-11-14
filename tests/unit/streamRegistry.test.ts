import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { streamAddress, streamAt } from '../../src/utils/streamRegistry.ts';

describe('streamRegistry', () => {
  it('gives one stream the same address every time', () => {
    const stream = {};
    assert.equal(streamAddress(stream), streamAddress(stream));
  });

  it('gives different streams different addresses', () => {
    assert.notEqual(streamAddress({}), streamAddress({}));
  });

  it('turns an address back into its stream', () => {
    const stream = { id: 'remote' };
    assert.equal(streamAt(streamAddress(stream)), stream);
  });

  it('knows nothing of an unknown or empty address', () => {
    assert.equal(streamAt('syph-stream:none'), null);
    assert.equal(streamAt(''), null);
    assert.equal(streamAt(undefined), null);
  });

  it('keeps working after many streams have come and gone', () => {
    for (let i = 0; i < 200; i++) streamAddress({});
    const stream = {};
    assert.equal(streamAt(streamAddress(stream)), stream);
  });
});

// The browser's calling file repeats the ICE server list of the phone's, so the two must offer the same things to the call code.
describe('webrtc.web.ts', () => {
  const exportsOf = (path: string) =>
    [...readFileSync(path, 'utf8').matchAll(/^export (?:async )?(?:function|const|interface|type|class) (\w+)/gm)]
      .map((match) => match[1])
      .sort();

  it('exports what webrtc.ts exports', () => {
    const phone = exportsOf('src/services/webrtc.ts');
    assert.ok(phone.length > 0);
    assert.deepEqual(exportsOf('src/services/webrtc.web.ts'), phone);
  });
});
