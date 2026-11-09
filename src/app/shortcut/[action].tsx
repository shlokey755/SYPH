// src/app/shortcut/[action].tsx
// Where the long-press menu on the SYPH icon lands (syph://shortcut/new-chat, /chats, /me; see utils/shortcuts.ts). It shows
// nothing of its own: it waits for the sign-in state, then goes to the right screen.
//   signed out            -> the entry route, which sends the person to onboarding or login as for any launch
//   signed in, cold start -> the screen replaces this one
//   signed in, app open   -> back to the tabs, whatever was open above them (a chat, say), then the screen. A call keeps
//                            running: it lives above every screen (ActiveCallHost)
//   unknown action        -> the chat list
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { markStartupRouted } from '../../services/startupRoute';
import { shortcutTarget } from '../../utils/shortcuts';

export default function ShortcutRoute() {
  const router = useRouter();
  const { action } = useLocalSearchParams<{ action?: string | string[] }>();
  const { currentUser, isLoading } = useAuth();
  const { themeColors } = useTheme();

  useEffect(() => {
    if (isLoading) return;

    if (!currentUser) {
      router.replace('/');
      return;
    }

    const target = shortcutTarget(action) ?? '/(tabs)';
    if (router.canGoBack()) router.dismissTo(target);
    else router.replace(target);
    markStartupRouted();
  }, [action, currentUser, isLoading, router]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ActivityIndicator size="large" color={themeColors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
