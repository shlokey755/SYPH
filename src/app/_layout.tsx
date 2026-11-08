// src/app/_layout.tsx
// Defines the background location task. It must be loaded in the global scope of the bundle, because Android can start
// the app only to run it (live location sharing while SYPH is closed).
import '../services/liveLocationTask';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { useTheme } from '../hooks/themeContext';
import { ActiveCallProvider } from '../components/call/ActiveCallHost';
import { StartupStack } from '../components/StartupStack';
import { ToastProvider } from '../hooks/toastNotifications';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { ConversationsProvider } from '../hooks/useConversations';
import { IncomingCallsProvider } from '../hooks/useIncomingCalls';
import { useSplashGate } from '../hooks/useSplashGate';
import { UserSettingsProvider } from '../hooks/useUserSettings';
import { restoreLiveShares } from '../services/liveLocationManager';
import { keepSplashVisible } from '../services/splashService';
import { WebFrame } from '../components/parchment';
import { useMapFonts } from '../theme/fonts';

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
      <StartupStack>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[id]" />
        {/* No swipe-back: it is easy to do by accident mid-call. The minimise button and the Android back button leave the
            call running (see ActiveCallHost); only hanging up ends it. */}
        <Stack.Screen name="call/[id]" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="group-call/[id]" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
      </StartupStack>
    </>
  );
}

// Provider order matters: settings, conversations and incoming calls read the signed-in user; the active call runs inside
// incoming calls (it marks the device busy) and above every screen (it outlives them).
export default function RootLayout() {
  // Nothing is drawn until the map's typefaces are registered (the native splash is still up): text drawn earlier would
  // keep the system font for good.
  const fontsReady = useMapFonts();
  if (!fontsReady) return null;

  // WebFrame is outermost so toasts, the incoming-call banner and the call screen all stay on the map column in a wide
  // browser window. On a phone, and in a narrow window, it does nothing.
  return (
    <WebFrame>
      <AuthProvider>
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
      </AuthProvider>
    </WebFrame>
  );
}
