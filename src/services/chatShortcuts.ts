/**
 * chatShortcuts.ts
 * JavaScript side of the long-press menu on the SYPH icon (Android dynamic shortcuts, published by
 * modules/syph-call-service/.../ChatShortcuts.kt). What goes in the menu is decided in utils/shortcuts.ts and
 * components/ChatShortcutsBridge.tsx.
 *
 * Native, so it exists only in a build made after it was added: in Expo Go, on iOS and web, or in an older APK (an OTA
 * update can reach one) every function does nothing and returns false. Not yet verified on a device.
 */

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { ChatShortcut } from '../utils/shortcuts';

interface ShortcutsModule {
  /** `json` is a list of ChatShortcut. An empty list removes the menu entries. */
  setChatShortcuts(json: string): boolean;
  clearChatShortcuts(): boolean;
}

let cached: ShortcutsModule | null | undefined;

function getModule(): ShortcutsModule | null {
  if (cached !== undefined) return cached;
  const found = Platform.OS === 'android' ? requireOptionalNativeModule<ShortcutsModule>('SyphCallService') : null;
  // An APK with the call service but from before this feature has the module without these functions.
  cached = found && typeof found.setChatShortcuts === 'function' && typeof found.clearChatShortcuts === 'function' ? found : null;
  return cached;
}

/** True when this build can put chats in the icon's long-press menu. */
export const supportsChatShortcuts = (): boolean => getModule() !== null;

/** Replaces the menu entries. Returns false when this build cannot, or Android refused (for example it is rate limiting). */
export function publishChatShortcuts(shortcuts: ChatShortcut[]): boolean {
  const module = getModule();
  if (!module) return false;
  try {
    return module.setChatShortcuts(JSON.stringify(shortcuts)) === true;
  } catch (error) {
    console.warn('Chat shortcuts (publish):', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Removes every entry, for example at sign-out so the next person on this phone does not see these chats. */
export function clearChatShortcuts(): boolean {
  const module = getModule();
  if (!module) return false;
  try {
    return module.clearChatShortcuts() === true;
  } catch (error) {
    console.warn('Chat shortcuts (clear):', error instanceof Error ? error.message : error);
    return false;
  }
}
