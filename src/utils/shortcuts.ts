/**
 * shortcuts.ts
 * The menu that opens when the SYPH icon on the home screen is long-pressed (Android app shortcuts). Each entry opens a
 * link `syph://shortcut/<action>`; the route app/shortcut/[action].tsx turns the action into a screen with the rules below.
 * The entries themselves (labels, icons) are listed in app.json, under the plugins/withAppShortcuts.js entry, and a unit test
 * keeps that list and this one in step.
 *
 * No React and no native code, so it can be unit tested with plain Node.
 */

/** The actions a shortcut can ask for. */
export const SHORTCUT_ACTIONS = ['new-chat', 'chats', 'me'] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

/** Where each action goes. All of them are tabs, which exist only for a signed-in person. */
export type ShortcutTarget = '/(tabs)/add' | '/(tabs)' | '/(tabs)/me';

const TARGETS: Record<ShortcutAction, ShortcutTarget> = {
  'new-chat': '/(tabs)/add',
  chats: '/(tabs)',
  me: '/(tabs)/me',
};

/** The screen for an action, or null for one this version does not know (a shortcut from a newer build, say). */
export function shortcutTarget(action: unknown): ShortcutTarget | null {
  const name = Array.isArray(action) ? action[0] : action;
  return typeof name === 'string' && (SHORTCUT_ACTIONS as readonly string[]).includes(name)
    ? TARGETS[name as ShortcutAction]
    : null;
}

/** The link a shortcut opens. `scheme` is the one in app.json. */
export const shortcutUrl = (action: ShortcutAction, scheme = 'syph'): string => `${scheme}://shortcut/${action}`;
