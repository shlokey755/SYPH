import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SHORTCUT_ACTIONS, shortcutTarget, shortcutUrl } from '../../src/utils/shortcuts.ts';
import xml from '../../plugins/appShortcutsXml.js';

const { buildShortcutsXml, buildStringsXml, escapeAndroidString, normalizeShortcuts } = xml;

const entry = (over = {}) => ({
  id: 'new_chat',
  shortLabel: 'New chat',
  longLabel: 'Find people to chat with',
  icon: 'shortcut_new_chat',
  url: 'syph://shortcut/new-chat',
  ...over,
});

describe('shortcut actions', () => {
  it('maps every action to a tab and ignores anything else', () => {
    assert.equal(shortcutTarget('new-chat'), '/(tabs)/add');
    assert.equal(shortcutTarget('chats'), '/(tabs)');
    assert.equal(shortcutTarget('me'), '/(tabs)/me');
    assert.equal(shortcutTarget('nope'), null);
    assert.equal(shortcutTarget(undefined), null);
    assert.equal(shortcutTarget(''), null);
    assert.equal(shortcutTarget('constructor'), null);
    assert.equal(shortcutTarget(['me']), '/(tabs)/me');
    for (const action of SHORTCUT_ACTIONS) assert.ok(shortcutTarget(action), action);
  });

  it('builds the link a shortcut opens', () => {
    assert.equal(shortcutUrl('me'), 'syph://shortcut/me');
    assert.equal(shortcutUrl('chats', 'other'), 'other://shortcut/chats');
  });
});

describe('app.json shortcut list', () => {
  const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  const plugin = app.plugins.find((p: unknown) => Array.isArray(p) && String(p[0]).includes('withAppShortcuts'));

  it('is registered and passes the plugin\'s own checks', () => {
    assert.ok(plugin, 'plugin entry missing from app.json');
    assert.doesNotThrow(() => normalizeShortcuts(plugin[1].shortcuts));
  });

  it('only opens actions the app knows, with the app\'s own scheme, and every icon file exists', () => {
    for (const s of normalizeShortcuts(plugin[1].shortcuts)) {
      const action = s.url.replace(`${app.scheme}://shortcut/`, '');
      assert.ok(SHORTCUT_ACTIONS.includes(action), `${s.id} opens unknown action "${action}"`);
      assert.equal(s.url, shortcutUrl(action, app.scheme));
      assert.ok(existsSync(`assets/shortcuts/${s.icon}.xml`), `assets/shortcuts/${s.icon}.xml`);
    }
  });

  it('is listed before the alternate-icons plugin, so it sees the icon aliases it must also cover', () => {
    const names = app.plugins.map((p: unknown) => String(Array.isArray(p) ? p[0] : p));
    const icons = names.findIndex((name: string) => name.includes('dynamic-app-icon'));
    const shortcuts = names.findIndex((name: string) => name.includes('withAppShortcuts'));
    assert.ok(icons >= 0 && shortcuts >= 0);
    assert.ok(shortcuts < icons);
  });

  it('has a route file for the links', () => {
    assert.ok(existsSync('src/app/shortcut/[action].tsx'));
  });
});

describe('shortcut XML', () => {
  it('writes one entry per shortcut, aimed at the main activity', () => {
    const out = buildShortcutsXml(normalizeShortcuts([entry(), entry({ id: 'me', icon: 'shortcut_me', url: 'syph://shortcut/me' })]), 'com.syph.chat');
    assert.equal(out.match(/<shortcut\b/g)?.length, 2);
    assert.match(out, /android:shortcutId="new_chat"/);
    assert.match(out, /android:data="syph:\/\/shortcut\/new-chat"/);
    assert.match(out, /android:targetPackage="com\.syph\.chat"/);
    assert.match(out, /android:targetClass="com\.syph\.chat\.MainActivity"/);
    assert.match(out, /android:icon="@drawable\/shortcut_me"/);
    assert.match(out, /android:shortcutShortLabel="@string\/syph_shortcut_new_chat_short"/);
  });

  it('writes the labels as string resources and escapes them', () => {
    const out = buildStringsXml(normalizeShortcuts([entry({ shortLabel: "Dad's & Co", longLabel: '<b>' })]));
    assert.match(out, /<string name="syph_shortcut_new_chat_short">Dad\\'s &amp; Co<\/string>/);
    assert.match(out, /<string name="syph_shortcut_new_chat_long">&lt;b&gt;<\/string>/);
    assert.equal(escapeAndroidString('@home'), '\\@home');
  });

  it('uses the short label when there is no long one', () => {
    assert.equal(normalizeShortcuts([entry({ longLabel: undefined })])[0].longLabel, 'New chat');
  });

  it('refuses a list that Android would show wrongly or that has a typo', () => {
    assert.throws(() => normalizeShortcuts(undefined), /non-empty/);
    assert.throws(() => normalizeShortcuts([]), /non-empty/);
    assert.throws(() => normalizeShortcuts([1, 2, 3, 4, 5].map((n) => entry({ id: `s${n}` }))), /at most 4/);
    assert.throws(() => normalizeShortcuts([entry({ id: 'Bad Id' })]), /"id"/);
    assert.throws(() => normalizeShortcuts([entry(), entry()]), /used twice/);
    assert.throws(() => normalizeShortcuts([entry({ shortLabel: 'Much too long' })]), /10 characters/);
    assert.throws(() => normalizeShortcuts([entry({ longLabel: 'x'.repeat(26) })]), /longLabel/);
    assert.throws(() => normalizeShortcuts([entry({ icon: '../x' })]), /"icon"/);
    assert.throws(() => normalizeShortcuts([entry({ url: 'not a link' })]), /"url"/);
  });
});
