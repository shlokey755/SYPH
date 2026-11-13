import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  MAX_CHAT_SHORTCUTS,
  chatShortcutUrl,
  recentChatShortcuts,
  shortcutTarget,
  shortcutsKey,
  truncate,
} from '../../src/utils/shortcuts.ts';

const colors = { color: '#00E5FF', letterColor: '#000000' };
const at = (millis: number) => ({ toMillis: () => millis });

const chat = (id: string, other: string, millis: number, extra = {}) =>
  ({
    id,
    isGroup: false,
    participantIds: ['me', `u-${id}`],
    participant1: { uid: 'me', username: 'Me' },
    participant2: { uid: `u-${id}`, username: other },
    lastMessageTime: at(millis),
    ...extra,
  }) as never;

const group = (id: string, name: string | undefined, millis: number) =>
  ({ id, isGroup: true, groupName: name, participantIds: ['me', 'a', 'b'], lastMessageTime: at(millis) }) as never;

describe('chat shortcut links', () => {
  it('builds a link that goes back to the same chat', () => {
    const url = chatShortcutUrl('abc_DEF-1');
    assert.equal(url, 'syph://shortcut/chat?id=abc_DEF-1');
    assert.equal(chatShortcutUrl('x', 'other'), 'other://shortcut/chat?id=x');
    assert.deepEqual(shortcutTarget('chat', new URL(url).searchParams.get('id')), { chat: 'abc_DEF-1' });
  });

  it('opens a chat only for a plausible id', () => {
    assert.deepEqual(shortcutTarget(['chat'], ['c1']), { chat: 'c1' });
    assert.equal(shortcutTarget('chat'), null);
    assert.equal(shortcutTarget('chat', ''), null);
    assert.equal(shortcutTarget('chat', '../../etc'), null);
    assert.equal(shortcutTarget('chat', 'a b'), null);
    assert.equal(shortcutTarget('chat', 'x'.repeat(201)), null);
    assert.equal(shortcutTarget('chat', 42), null);
  });

  it('still understands the links of the first version of the menu, and ignores anything else', () => {
    assert.deepEqual(shortcutTarget('new-chat'), { tab: '/(tabs)/add' });
    assert.deepEqual(shortcutTarget('chats'), { tab: '/(tabs)' });
    assert.deepEqual(shortcutTarget('me'), { tab: '/(tabs)/me' });
    assert.equal(shortcutTarget('nope'), null);
    assert.equal(shortcutTarget(undefined), null);
    assert.equal(shortcutTarget('constructor'), null);
    assert.equal(shortcutTarget('__proto__'), null);
  });
});

describe('recent chats for the menu', () => {
  it('shows the three newest chats, newest first', () => {
    const list = recentChatShortcuts([chat('a', 'Ann', 10), chat('b', 'Bob', 40), chat('c', 'Cy', 30), chat('d', 'Di', 20)], 'me', colors);
    assert.equal(MAX_CHAT_SHORTCUTS, 3);
    assert.deepEqual(
      list.map((s) => s.id),
      ['b', 'c', 'd']
    );
  });

  it('names a 1-on-1 chat after the other person and a group after the group', () => {
    const [one, two, three] = recentChatShortcuts([chat('a', 'Ann', 30), group('g', 'Team', 20), group('h', undefined, 10)], 'me', colors);
    assert.equal(one.label, 'Ann');
    assert.equal(one.letter, 'A');
    assert.equal(two.label, 'Team');
    assert.equal(three.label, 'Group');
    // Seen from the other person's phone, the other participant is me.
    const [mine] = recentChatShortcuts([chat('a', 'Ann', 30)], 'u-a', colors);
    assert.equal(mine.label, 'Me');
  });

  it('uses the time the chat was made when it has no message yet, and keeps the given order for ties', () => {
    const fresh = { ...(chat('n', 'New', 0) as object), lastMessageTime: undefined, createdAt: at(99) } as never;
    const list = recentChatShortcuts([chat('a', 'Ann', 50), fresh, chat('x', 'X', 50), chat('y', 'Y', 50)], 'me', colors);
    assert.deepEqual(
      list.map((s) => s.id),
      ['n', 'a', 'x']
    );
  });

  it('gives fewer entries for fewer chats, and none for none', () => {
    assert.equal(recentChatShortcuts([chat('a', 'Ann', 1)], 'me', colors).length, 1);
    assert.deepEqual(recentChatShortcuts([], 'me', colors), []);
    assert.deepEqual(recentChatShortcuts([chat('a', 'Ann', 1)], 'me', colors, 0), []);
  });

  it('skips duplicates and chats with an unusable id', () => {
    const list = recentChatShortcuts([chat('a', 'Ann', 5), chat('a', 'Ann again', 9), chat('bad id', 'Bad', 8), { id: '' } as never], 'me', colors);
    assert.deepEqual(
      list.map((s) => s.id),
      ['a']
    );
  });

  it('cuts long names to the lengths Android recommends, without splitting an emoji', () => {
    assert.equal(truncate('short', 10), 'short');
    assert.equal(truncate('a very long group name here', 10), 'a very lo…');
    assert.equal(truncate('😀😀😀😀😀😀', 3), '😀😀…');
    const [entry] = recentChatShortcuts([group('g', 'Weekend plans with the whole family', 1)], 'me', colors);
    assert.equal(Array.from(entry.label).length, 10);
    assert.equal(Array.from(entry.longLabel).length, 25);
    assert.equal(entry.url, 'syph://shortcut/chat?id=g');
  });

  it('carries the colours and gives a stable key', () => {
    const a = recentChatShortcuts([chat('a', 'Ann', 5)], 'me', colors);
    const b = recentChatShortcuts([chat('a', 'Ann', 5)], 'me', colors);
    assert.equal(a[0].color, '#00E5FF');
    assert.equal(a[0].letterColor, '#000000');
    assert.equal(shortcutsKey(a), shortcutsKey(b));
    assert.notEqual(shortcutsKey(a), shortcutsKey(recentChatShortcuts([chat('a', 'Ann', 5)], 'me', { color: '#fff', letterColor: '#000' })));
    assert.notEqual(shortcutsKey(a), shortcutsKey(recentChatShortcuts([chat('a', 'Anna', 5)], 'me', colors)));
  });

  it('never includes another person\'s chats: it only lists what it is given', () => {
    const list = recentChatShortcuts([], 'someone-else', colors);
    assert.deepEqual(list, []);
  });
});

describe('wiring', () => {
  it('has the route, the bridge in the root layout, and no leftover static-shortcut plugin', () => {
    assert.ok(existsSync('src/app/shortcut/[action].tsx'));
    assert.ok(existsSync('src/components/ChatShortcutsBridge.tsx'));
    assert.match(readFileSync('src/app/_layout.tsx', 'utf8'), /<ChatShortcutsBridge \/>/);
    assert.doesNotMatch(readFileSync('app.json', 'utf8'), /withAppShortcuts/);
    assert.equal(existsSync('plugins/withAppShortcuts.js'), false);
  });

  it('asks native for exactly the functions the module defines', () => {
    const module = readFileSync('modules/syph-call-service/android/src/main/java/expo/modules/syphcallservice/SyphCallServiceModule.kt', 'utf8');
    const service = readFileSync('src/services/chatShortcuts.ts', 'utf8');
    for (const name of ['setChatShortcuts', 'clearChatShortcuts']) {
      assert.match(module, new RegExp(`Function\\("${name}"\\)`));
      assert.match(service, new RegExp(name));
    }
  });
});
