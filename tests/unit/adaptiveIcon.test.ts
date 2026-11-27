import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// The Android adaptive icon is two pictures (app.json > android.adaptiveIcon). They were once the same file, so the icon showed one
// logo cut off by the launcher's mask and hiding itself behind itself.

const adaptive = (JSON.parse(readFileSync('app.json', 'utf8')) as { expo: { android: { adaptiveIcon: Record<string, string> } } }).expo
  .android.adaptiveIcon;

/** Width, height and PNG colour type (6 = with transparency) from the file's header. */
function header(path: string) {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', `${path} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

test('the foreground and the background of the adaptive icon exist', () => {
  assert.ok(existsSync(adaptive.foregroundImage), adaptive.foregroundImage);
  assert.ok(existsSync(adaptive.backgroundImage), adaptive.backgroundImage);
});

test('the two layers are different pictures', () => {
  assert.notDeepEqual(readFileSync(adaptive.foregroundImage), readFileSync(adaptive.backgroundImage));
});

test('both layers are square and the same size', () => {
  const foreground = header(adaptive.foregroundImage);
  const background = header(adaptive.backgroundImage);
  assert.equal(foreground.width, foreground.height);
  assert.deepEqual([background.width, background.height], [foreground.width, foreground.height]);
});

test('the foreground has transparency, so the background shows around it', () => {
  assert.equal(header(adaptive.foregroundImage).colorType, 6);
});
