// src/app/_layout.tsx
// Defines the background location task. It must be loaded in the global scope of the bundle, because Android can start
// the app only to run it (live location sharing while SYPH is closed).
import '../services/liveLocationTask';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { ThemeProvider, useTheme } from '../hooks/themeContext';
import { ToastProvider } from '../hooks/toastNotifications';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { ConversationsProvider } from '../hooks/useConversations';
import { IncomingCallsProvider } from '../hooks/useIncomingCalls';
import { useSplashGate } from '../hooks/useSplashGate';
import { UserSettingsProvider } from '../hooks/useUserSettings';
import { restoreLiveShares } from '../services/liveLocationManager';
import { keepSplashVisible } from '../services/splashService';

// In global scope on purpose: the native splash stays up until the app is ready (see utils/splash.ts), and this must run
// before the first render, otherwise the splash can already be gone.
keepSplashVisible();

function RootNav() {
  const { themeColors } = useTheme();
  const { isLoading, firebaseUser } = useAuth();
  useSplashGate(!isLoading);

  // A live location share that was running when SYPH closed continues, or is ended if its time ran out.
  const uid = firebaseUser?.uid;
  useEffect(() => {
    if (uid) void restoreLiveShares(uid).catch(() => {});
  }, [uid]);

  return (
    <>
      <StatusBar barStyle={themeColors.isDark ? 'light-content' : 'dark-content'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: themeColors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[id]" />
        {/* No swipe-back: leaving the call screen hangs up, so it should only happen on purpose. */}
        <Stack.Screen name="call/[id]" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="group-call/[id]" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}

// Provider order matters: settings, conversations and incoming calls read the signed-in user; toasts read the theme.
export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <UserSettingsProvider>
            <ConversationsProvider>
              <IncomingCallsProvider>
                <RootNav />
              </IncomingCallsProvider>
            </ConversationsProvider>
          </UserSettingsProvider>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
