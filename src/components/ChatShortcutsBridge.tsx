/**
 * ChatShortcutsBridge.tsx
 * Keeps the long-press menu on the SYPH icon in step with the signed-in person's three most recent chats. Renders nothing.
 *
 *   - signed in, chats loaded: the menu shows their newest chats (a short pause after each change, so a burst of messages is
 *     one update). The list is published again each time SYPH comes to the front, because Android can drop entries when the
 *     launcher icon is switched (Me tab) and may refuse updates made while SYPH is in the background.
 *   - signed out: the menu is emptied, so the next person on this phone never sees these chats.
 *
 * Mounted in the root layout, above the tabs, so it also sees the sign-out.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useTheme } from '../hooks/themeContext';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { clearChatShortcuts, publishChatShortcuts, supportsChatShortcuts } from '../services/chatShortcuts';
import { ChatShortcut, recentChatShortcuts, shortcutsKey } from '../utils/shortcuts';

const DEBOUNCE_MS = 600;

export function ChatShortcutsBridge() {
  const { firebaseUser } = useAuth();
  const { conversations, isLoading } = useConversations();
  const { themeColors } = useTheme();
  const uid = firebaseUser?.uid;
  const { accent, buttonText } = themeColors;

  const latest = useRef<ChatShortcut[] | null>(null);
  const publishedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!supportsChatShortcuts()) return;

    if (!uid) {
      latest.current = null;
      publishedKey.current = null;
      clearChatShortcuts();
      return;
    }
    // Do not empty the menu just because the chats have not arrived yet.
    if (isLoading) return;

    const next = recentChatShortcuts(conversations, uid, { color: accent, letterColor: buttonText });
    latest.current = next;
    const key = shortcutsKey(next);
    if (key === publishedKey.current) return;

    const timer = setTimeout(() => {
      if (publishChatShortcuts(next)) publishedKey.current = key;
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [uid, isLoading, conversations, accent, buttonText]);

  useEffect(() => {
    if (!supportsChatShortcuts()) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !latest.current) return;
      if (publishChatShortcuts(latest.current)) publishedKey.current = shortcutsKey(latest.current);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
