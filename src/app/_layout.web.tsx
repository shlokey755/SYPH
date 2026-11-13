// src/app/_layout.web.tsx
// The root layout in a browser. Same providers and screens as _layout.tsx (the phone's), with three additions: the map's
// typefaces are registered before anything is drawn, Alert.alert (empty in React Native Web) opens the browser's own
// dialogs, and the stack sits inside the desktop shell (rail, chat list and wide map page on a wide window).
// A phone never loads this file. When _layout.tsx gains a provider or a screen, add it here too (docs/PARCHMENT.md).
import '../services/liveLocationTask';
import { DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { ActiveCallProvider } from '../components/call/ActiveCallHost';
import { ChatShortcutsBridge } from '../components/ChatShortcutsBridge';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { useDesktopLayout } from '../components/parchment';
import { ThemeProvider } from '../hooks/themeContext';
import { ToastProvider } from '../hooks/toastNotifications';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { ConversationsProvider } from '../hooks/useConversations';
import { IncomingCallsProvider } from '../hooks/useIncomingCalls';
import { useSplashGate } from '../hooks/useSplashGate';
import { UserSettingsProvider } from '../hooks/useUserSettings';
import { restoreLiveShares } from '../services/liveLocationManager';
import { keepSplashVisible } from '../services/splashService';
import { vintage } from '../theme/colors';
import { useMapFonts } from '../theme/fonts';
import { showBrowserAlert } from '../utils/browserAlert';

keepSplashVisible();

// React Native Web leaves Alert.alert empty, so in a browser errors and "are you sure?" questions would never show.
// Use the browser's own dialogs.
if (typeof window !== 'undefined') {
  Alert.alert = (title, message, buttons) =>
    showBrowserAlert({ alert: (t) => window.alert(t), confirm: (t) => window.confirm(t) }, title, message, buttons);
}

// Every navigator paints its screens with the navigation theme's background, a pale grey by default, which would hide the map the
// shell paints behind the pages. Transparent on a wide window; on a narrow one every screen paints its own parchment, and the
// parchment colour keeps a screen from flashing grey as it comes in.
const navigationTheme = (background: string) => ({ ...DefaultTheme, colors: { ...DefaultTheme.colors, background } });
const DESKTOP_THEME = navigationTheme('transparent');
const NARROW_THEME = navigationTheme(vintage.background);

function WebStack({ children }: { children: React.ReactNode }) {
  const { desktop } = useDesktopLayout();
  return (
    <NavigationThemeProvider value={desktop ? DESKTOP_THEME : NARROW_THEME}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: desktop ? 'transparent' : vintage.background },
        }}
      >
        {children}
      </Stack>
    </NavigationThemeProvider>
  );
}

function RootNav() {
  const { isLoading, firebaseUser } = useAuth();
  useSplashGate(!isLoading);

  // A live location share that was running when SYPH closed continues, or is ended if its time ran out.
  const uid = firebaseUser?.uid;
  useEffect(() => {
    if (uid) void restoreLiveShares(uid).catch(() => {});
  }, [uid]);

  return (
    <>
      <ChatShortcutsBridge />
      <DesktopShell>
        <WebStack>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="shortcut/[action]" />
          <Stack.Screen name="call/[id]" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="group-call/[id]" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
        </WebStack>
      </DesktopShell>
    </>
  );
}

// Provider order matters: settings, conversations and incoming calls read the signed-in user; toasts read the theme; the
// active call runs inside incoming calls (it marks the device busy) and above every screen (it outlives them).
export default function RootLayout() {
  // Nothing is drawn until the map's typefaces are registered: text drawn earlier would keep the system font for good.
  const fontsReady = useMapFonts();
  if (!fontsReady) return null;

  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <UserSettingsProvider>
            <ConversationsProvider>
              <IncomingCallsProvider>
                <ActiveCallProvider>
                  <RootNav />
                </ActiveCallProvider>
              </IncomingCallsProvider>
            </ConversationsProvider>
          </UserSettingsProvider>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
