/**
 * shortcuts.ts
 * The menu that opens when the SYPH icon on the home screen is long-pressed: the signed-in person's most recent chats
 * (Android "dynamic shortcuts", published by components/ChatShortcutsBridge.tsx and cleared at sign-out). Each entry opens
 * `syph://shortcut/chat?id=<conversation id>`; the route app/shortcut/[action].tsx turns that into the chat screen.
 *
 * No React and no native code, so it can be unit tested with plain Node.
 */

import type { Conversation } from '../types';

/** The menu shows this many chats (Android launchers show about four entries). */
export const MAX_CHAT_SHORTCUTS = 3;

/** Android recommends at most 10 characters for a shortcut's short label and 25 for its long one. */
const SHORT_LABEL_MAX = 10;
const LONG_LABEL_MAX = 25;

/** What the native side needs to publish one entry. */
export interface ChatShortcut {
  id: string;
  label: string;
  longLabel: string;
  url: string;
  /** The initial drawn on the entry's icon (the same square avatar as in the app). */
  letter: string;
  /** Icon colours, "#rrggbb": the theme's accent and the text colour on it. */
  color: string;
  letterColor: string;
}

/** The link an entry opens. `scheme` is the one in app.json. */
export const chatShortcutUrl = (conversationId: string, scheme = 'syph'): string =>
  `${scheme}://shortcut/chat?id=${encodeURIComponent(conversationId)}`;

/** Firestore ids are letters, digits, "_" and "-"; allow a little more but nothing that could be a path or a link. */
const CONVERSATION_ID = /^[A-Za-z0-9_.:-]{1,200}$/;

/** Where a shortcut link goes: a chat, or (links from the first version of this menu, in older builds) one of the tabs. */
export type ShortcutTarget = { chat: string } | { tab: '/(tabs)' | '/(tabs)/add' | '/(tabs)/me' };

const LEGACY_TABS = { 'new-chat': '/(tabs)/add', chats: '/(tabs)', me: '/(tabs)/me' } as const;

const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

/** The screen for a link, or null when it is not one this version understands (the route then opens the chat list). */
export function shortcutTarget(action: unknown, id?: unknown): ShortcutTarget | null {
  const name = first(action);
  if (name === 'chat') {
    const conversationId = first(id);
    return typeof conversationId === 'string' && CONVERSATION_ID.test(conversationId) ? { chat: conversationId } : null;
  }
  if (typeof name === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_TABS, name)) {
    return { tab: LEGACY_TABS[name as keyof typeof LEGACY_TABS] };
  }
  return null;
}

type Millis = { toMillis?: () => number } | Date | null | undefined;

const millisOf = (time: Millis): number => (!time ? 0 : time instanceof Date ? time.getTime() : time.toMillis?.() ?? 0);

/** Newest message, or the time the chat was made when it has none yet. */
const activityOf = (conversation: Conversation): number =>
  millisOf(conversation.lastMessageTime as Millis) || millisOf(conversation.createdAt as Millis);

/** The name an entry shows: the group's name, or the other person in a 1-on-1 chat. */
function titleOf(conversation: Conversation, myUid: string): string {
  if (conversation.isGroup) return conversation.groupName?.trim() || 'Group';
  const other = conversation.participant1?.uid === myUid ? conversation.participant2 : conversation.participant1;
  return other?.username?.trim() || 'Chat';
}

/** Cuts to `max` characters (counting characters, not UTF-16 units, so an emoji is not split) and ends with an ellipsis. */
export function truncate(text: string, max: number): string {
  const characters = Array.from(text);
  return characters.length <= max ? text : `${characters.slice(0, max - 1).join('').trimEnd()}…`;
}

const initialOf = (name: string): string => (name.trim() ? Array.from(name.trim())[0].toUpperCase() : '?');

/**
 * The entries for the long-press menu: the signed-in person's most recent chats, newest first. Only chats they are in
 * (the list is already limited to those), so another person signing in on the same phone never sees these.
 */
export function recentChatShortcuts(
  conversations: Conversation[],
  myUid: string,
  colors: { color: string; letterColor: string },
  limit = MAX_CHAT_SHORTCUTS,
  scheme = 'syph'
): ChatShortcut[] {
  const seen = new Set<string>();
  return conversations
    .filter((conversation) => {
      if (!conversation?.id || seen.has(conversation.id) || !CONVERSATION_ID.test(conversation.id)) return false;
      seen.add(conversation.id);
      return true;
    })
    .map((conversation, index) => ({ conversation, index, at: activityOf(conversation) }))
    // Newest first; chats with the same time keep the order they came in.
    .sort((a, b) => b.at - a.at || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ conversation }) => {
      const title = titleOf(conversation, myUid);
      return {
        id: conversation.id,
        label: truncate(title, SHORT_LABEL_MAX),
        longLabel: truncate(title, LONG_LABEL_MAX),
        url: chatShortcutUrl(conversation.id, scheme),
        letter: initialOf(title),
        color: colors.color,
        letterColor: colors.letterColor,
      };
    });
}

/** Changes whenever what the menu shows changes, so the same list is not published twice. */
export const shortcutsKey = (shortcuts: ChatShortcut[]): string => JSON.stringify(shortcuts);
