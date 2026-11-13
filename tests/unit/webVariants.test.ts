import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// The browser version of SYPH lives in `Foo.web.tsx` files next to the phone's `Foo.tsx` (docs/PARCHMENT.md). Metro and
// Expo Router pick the `.web` file in a browser and ignore it on a phone, which needs the phone file to be there.

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const webFiles = walk('src')
  .map((path) => path.split('\\').join('/'))
  .filter((path) => /\.web\.tsx?$/.test(path))
  .sort();
const phoneVersion = (path: string) => path.replace(/\.web(\.tsx?)$/, '$1');

describe('web variants', () => {
  it('exist', () => {
    assert.ok(webFiles.length > 0);
  });

  for (const path of webFiles) {
    it(`${path} has the phone file beside it`, () => {
      assert.ok(existsSync(phoneVersion(path)), `${phoneVersion(path)} is missing: a phone build would not find ${path}`);
    });
  }

  it('tsconfig.web.json leaves out exactly the phone files that a web file replaces', () => {
    const config = JSON.parse(readFileSync('tsconfig.web.json', 'utf8')) as { exclude?: string[] };
    const excluded = new Set(config.exclude ?? []);
    for (const path of webFiles) {
      assert.ok(excluded.has(phoneVersion(path)), `add "${phoneVersion(path)}" to the exclude list of tsconfig.web.json`);
    }
    for (const path of excluded) {
      if (!path.startsWith('src/')) continue;
      assert.ok(webFiles.includes(path.replace(/(\.tsx?)$/, '.web$1')), `"${path}" is excluded but has no .web file`);
    }
  });
});
