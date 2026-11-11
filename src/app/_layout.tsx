// src/app/_layout.tsx
// Defines the background location task. It must be loaded in the global scope of the bundle, because Android can start
// the app only to run it (live location sharing while SYPH is closed).
import '../services/liveLocationTask';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Platform, StatusBar } from 'react-native';
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
import { DesktopShell } from '../components/desktop/DesktopShell';
import { useMapFonts } from '../theme/fonts';
import { showBrowserAlert } from '../utils/browserAlert';

// In global scope on purpose: the native splash stays up until the app is ready (see utils/splash.ts), and this must run
// before the first render, otherwise the splash can already be gone.
keepSplashVisible();

// React Native Web leaves Alert.alert empty, so in a browser errors and "are you sure?" questions would never show.
// Use the browser's own dialogs there. A phone keeps its native alert.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title, message, buttons) =>
    showBrowserAlert({ alert: (t) => window.alert(t), confirm: (t) => window.confirm(t) }, title, message, buttons);
}

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
      <DesktopShell>
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
      </DesktopShell>
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

  return (
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
  );
}
