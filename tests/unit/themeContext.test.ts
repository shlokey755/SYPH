import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// In a browser the pieces that are shared with the phone read their colours from hooks/themeContext.web.tsx, which answers with the
// parchment palette. Whatever they import from the phone's file must be there.
const exportsOf = (path: string) =>
  [...readFileSync(path, 'utf8').matchAll(/^export (?:async )?(?:function|const|interface|type|class) (\w+)/gm)]
    .map((match) => match[1])
    .sort();

describe('themeContext.web.tsx', () => {
  const source = readFileSync('src/hooks/themeContext.web.tsx', 'utf8');

  it('exports what themeContext.tsx exports', () => {
    const phone = exportsOf('src/hooks/themeContext.tsx');
    assert.ok(phone.includes('useTheme') && phone.includes('ThemeProvider'));
    assert.deepEqual(exportsOf('src/hooks/themeContext.web.tsx'), phone);
  });

  it('answers with the parchment palette and is ready at once', () => {
    assert.match(source, /themeColors: vintage/);
    assert.match(source, /isReady: true/);
  });

  it('reads and saves nothing: the theme chosen on the phone is left alone', () => {
    assert.doesNotMatch(source, /AsyncStorage|saveTheme|applyThemeIcon|useAuth/);
  });
});

describe('the browser call screens', () => {
  const screens = ['src/app/call/[id].web.tsx', 'src/app/group-call/[id].web.tsx'];

  it('take their colours from the map palette, not from the phone themes', () => {
    for (const path of screens) {
      const source = readFileSync(path, 'utf8');
      assert.match(source, /from '..\/..\/theme\/mapTheme'/, path);
      assert.doesNotMatch(source, /hooks\/themeContext/, path);
    }
  });

  it('draw no floating bubble and ask for no overlay permission', () => {
    assert.match(readFileSync('src/components/call/ReturnToCallBubble.web.tsx', 'utf8'), /return null;/);
    const me = readFileSync('src/app/(tabs)/me.web.tsx', 'utf8');
    assert.doesNotMatch(me, /CallOverlaySection/);
  });
});
