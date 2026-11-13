/**
 * DesktopShell.tsx
 * The desktop layout of the app (browser windows from 900 points wide, see theme/web.ts): a plank rail down the left with the Chats,
 * Add and Me buttons, the list of chats beside it, and the open page (a conversation, Add, Me) taking the rest on a wide sheet of
 * the map. Everywhere else (a phone, a narrow window, and the sign-in, onboarding and call screens) it draws nothing and the
 * screens fill the window.
 * It is always the same tree, so the navigator inside is never remounted when the layout changes with the window.
 */
import { Ionicons } from '@expo/vector-icons';
import { useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import React, { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/mapTheme';
import { useConversations } from '../../hooks/useConversations';
import { ChatListView } from '../chat/ChatListView';
import {
  ART,
  CountSeal,
  FILL_IMAGE,
  InShellContext,
  IS_WEB,
  Paper,
  RoundButton,
  roundLook,
  Text,
  useDesktopLayout,
} from '../parchment';
import { WIDE_ART } from '../parchment/wideArt';

type Place = 'chats' | 'add' | 'me';

const ITEMS = [
  { key: 'chats', label: 'Chats', icon: 'chatbubbles', href: '/' },
  { key: 'add', label: 'Add', icon: 'add-circle', href: '/add' },
  { key: 'me', label: 'Me', icon: 'person', href: '/me' },
] as const;

/** Which button is lit: the chat list and every open conversation belong to Chats. Null outside the app (sign-in, calls). */
function placeOf(segments: readonly string[]): Place | null {
  if (segments[0] === 'chat') return 'chats';
  if (segments[0] !== '(tabs)') return null;
  if (segments[1] === 'add') return 'add';
  if (segments[1] === 'me') return 'me';
  return 'chats';
}

/** A strip of ship's planking down the left edge, with a brass rail along it and the three places to go. */
function Rail({ width, place }: { width: number; place: Place | null }) {
  const { themeColors: c } = useTheme();
  const router = useRouter();
  const { unreadTotal } = useConversations();
  return (
    <View style={[styles.rail, { width, backgroundColor: c.wood }]}>
      <Image source={ART.wood} resizeMode="cover" style={FILL_IMAGE} />
      <View style={[styles.railEdge, { backgroundColor: c.brass }]} />
      <Text kind="display" style={[styles.logo, { color: c.gilt }]}>
        SYPH
      </Text>
      {ITEMS.map((item) => {
        const on = place === item.key;
        return (
          <View key={item.key} style={styles.item}>
            <View>
              <RoundButton
                tone="wood"
                size={50}
                active={on}
                onPress={() => router.navigate(item.href)}
                accessibilityLabel={item.label}
              >
                <Ionicons name={item.icon} size={24} color={roundLook(c, 'wood', on).ink} />
              </RoundButton>
              {item.key === 'chats' && unreadTotal > 0 ? (
                <View pointerEvents="none" style={styles.badge}>
                  <CountSeal count={unreadTotal} />
                </View>
              ) : null}
            </View>
            <Text kind="label" style={[styles.itemLabel, { color: on ? c.gilt : c.buttonText }]}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function WebShell({ children }: { children: ReactNode }) {
  const { themeColors: c } = useTheme();
  const { desktop, railWidth, listWidth } = useDesktopLayout();
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const place = placeOf(segments);
  const inApp = desktop && place !== null;
  const onChat = segments[0] === 'chat';
  const rawId = params.id as string | string[] | undefined;
  const activeId = onChat ? ((Array.isArray(rawId) ? rawId[0] : rawId) ?? null) : null;
  // A conversation is read on clean parchment; every other page gets the full map.
  const page = WIDE_ART ? (onChat ? WIDE_ART.plain : WIDE_ART.map) : onChat ? ART.plain : ART.map;
  return (
    <InShellContext.Provider value={inApp}>
      <View style={[styles.outer, inApp && { backgroundColor: c.burn }]}>
        {inApp ? <Rail width={railWidth} place={place} /> : null}
        {inApp ? (
          <View style={[styles.list, { width: listWidth, borderRightColor: c.brass }]}>
            <Image source={ART.map} resizeMode="cover" style={FILL_IMAGE} />
            <ChatListView activeId={activeId} />
          </View>
        ) : null}
        <View style={styles.main}>
          {inApp ? <Image source={page} resizeMode="cover" style={FILL_IMAGE} /> : null}
          {children}
        </View>
      </View>
    </InShellContext.Provider>
  );
}

/** Put once, around the navigator, in app/_layout.tsx. On a phone it is just the navigator. */
export function DesktopShell({ children }: { children: ReactNode }) {
  return IS_WEB ? <WebShell>{children}</WebShell> : <>{children}</>;
}

/** What the page beside the list shows while no chat is open. */
export function DesktopEmpty() {
  const { themeColors: c } = useTheme();
  return (
    <View style={styles.empty}>
      <Paper torn="both" angle={-1.2} contentStyle={styles.emptyCard}>
        <Ionicons name="boat" size={44} color={c.stamp} />
        <Text kind="display" style={[styles.emptyTitle, { color: c.ink }]}>
          Pick a dispatch
        </Text>
        <Text kind="hand" style={[styles.emptyHint, { color: c.inkSoft }]}>
          Choose a chat from the list, or open Add to find a friend
        </Text>
      </Paper>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, flexDirection: 'row' },
  rail: { alignItems: 'center', paddingTop: 18, gap: 18, overflow: 'hidden' },
  railEdge: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 3 },
  logo: { fontSize: 30, lineHeight: 34, marginBottom: 8 },
  item: { alignItems: 'center', gap: 4 },
  itemLabel: { fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  badge: { position: 'absolute', top: -8, right: -10 },
  list: { borderRightWidth: 3, overflow: 'hidden' },
  main: { flex: 1, minWidth: 0, overflow: 'hidden' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyCard: { alignItems: 'center', gap: 8, paddingHorizontal: 34, paddingVertical: 18, maxWidth: 420 },
  emptyTitle: { fontSize: 34, lineHeight: 40, textAlign: 'center' },
  emptyHint: { fontSize: 21, lineHeight: 26, textAlign: 'center' },
});
