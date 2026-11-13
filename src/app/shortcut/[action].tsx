// src/app/shortcut/[action].tsx
// Where an entry of the long-press menu on the SYPH icon lands: syph://shortcut/chat?id=<conversation id> (see
// utils/shortcuts.ts). It shows nothing of its own: it waits for the sign-in state, then goes to the right screen.
//   signed out            -> the entry route, which sends the person to onboarding or login as for any launch
//   signed in, cold start -> the chat list replaces this screen and the chat opens on top of it
//   signed in, app open   -> back to the chat list, whatever was open above it, then the chat. A call keeps running: it
//                            lives above every screen (ActiveCallHost)
//   unknown link          -> the chat list
// Links from the first version of this menu (/new-chat, /chats, /me) still work in builds that have them.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { markStartupRouted } from '../../services/startupRoute';
import { shortcutTarget } from '../../utils/shortcuts';

export default function ShortcutRoute() {
  const router = useRouter();
  const { action, id } = useLocalSearchParams<{ action?: string | string[]; id?: string | string[] }>();
  const { currentUser, isLoading } = useAuth();
  const { themeColors } = useTheme();

  useEffect(() => {
    if (isLoading) return;

    if (!currentUser) {
      router.replace('/');
      return;
    }

    const target = shortcutTarget(action, id);
    const tab = target && 'tab' in target ? target.tab : '/(tabs)';
    if (router.canGoBack()) router.dismissTo(tab);
    else router.replace(tab);
    if (target && 'chat' in target) router.push({ pathname: '/chat/[id]', params: { id: target.chat } });
    markStartupRouted();
  }, [action, id, currentUser, isLoading, router]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ActivityIndicator size="large" color={themeColors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
