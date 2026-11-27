import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { HUE_ICON_NAMES } from '../../src/utils/accentColor.ts';
import { ICON_FOR_THEME, iconForTheme, shouldChangeIcon } from '../../src/utils/appIcon.ts';

const PLUGIN = '@variant-systems/expo-dynamic-app-icon';

function pluginIcons(): Record<string, { image: string }> {
  const config = JSON.parse(readFileSync('app.json', 'utf8'));
  const entry = (config.expo.plugins as unknown[]).find((plugin) => Array.isArray(plugin) && plugin[0] === PLUGIN) as
    | [string, Record<string, { image: string }>]
    | undefined;
  assert.ok(entry, 'app.json must list the dynamic app icon plugin');
  return entry[1];
}

test('every theme has an icon declared in app.json', () => {
  const declared = pluginIcons();
  for (const icon of Object.values(ICON_FOR_THEME)) {
    assert.ok(declared[icon], `app.json has no icon named "${icon}"`);
  }
});

test('every colour-wheel icon is declared in app.json', () => {
  const declared = pluginIcons();
  for (const icon of HUE_ICON_NAMES) assert.ok(declared[icon], `app.json has no icon named "${icon}"`);
});

test('app.json declares no icon that no theme and no wheel colour uses', () => {
  const used = new Set([...Object.values(ICON_FOR_THEME), ...HUE_ICON_NAMES]);
  for (const name of Object.keys(pluginIcons())) assert.ok(used.has(name), `icon "${name}" belongs to no theme or hue`);
});

test('no icon name is used twice once the case is dropped (Android names the resource in lower case)', () => {
  const names = Object.keys(pluginIcons()).map((name) => name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});

test('every declared icon image exists', () => {
  for (const [name, { image }] of Object.entries(pluginIcons())) {
    assert.ok(existsSync(image), `icon "${name}" points at a missing file: ${image}`);
  }
});

test('iconForTheme looks the theme up', () => {
  assert.equal(iconForTheme('ocean'), 'ocean');
  assert.equal(iconForTheme('cyber'), 'cyber');
});

test('the icon is only changed when it differs from the last one set', () => {
  assert.equal(shouldChangeIcon(null, 'ocean'), true);
  assert.equal(shouldChangeIcon(undefined, 'ocean'), true);
  assert.equal(shouldChangeIcon('forest', 'ocean'), true);
  assert.equal(shouldChangeIcon('ocean', 'ocean'), false);
});
