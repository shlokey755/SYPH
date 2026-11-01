// src/app/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'react-native';
import { ThemeProvider, useTheme } from '../hooks/themeContext';
import { ToastProvider } from '../hooks/toastNotifications';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { ConversationsProvider } from '../hooks/useConversations';
import { IncomingCallsProvider } from '../hooks/useIncomingCalls';
import { useSplashGate, useSplashHidden } from '../hooks/useSplashGate';
import { UserSettingsProvider } from '../hooks/useUserSettings';
import { keepSplashVisible } from '../services/splashService';
import { useStartupRouted } from '../services/startupRoute';
import { firstScreenChosen, isIndexRoute } from '../utils/splash';

// In global scope on purpose: the native splash stays up until the app is ready (see utils/splash.ts), and this must run
// before the first render, otherwise the splash can already be gone.
keepSplashVisible();

function RootNav() {
  const { themeColors, isReady: themeReady } = useTheme();
  const { isLoading } = useAuth();
  const segments = useSegments();
  const routed = useStartupRouted();
  // Icons draw blank until their font is loaded, so it is loaded here, before the splash goes. A failed load must not
  // block the app: the icons are then missing, which is what would have happened anyway.
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);

  // The splash goes only when nothing can change on screen afterwards: signed-in state known, saved theme read, icon
  // font loaded and the first real screen already open underneath (rules and time limits in utils/splash.ts).
  const firstScreenReady = firstScreenChosen({ onIndexRoute: isIndexRoute(segments), routed });
  useSplashGate(!isLoading && themeReady && (fontsLoaded || fontError != null) && firstScreenReady);

  // The hand-off to the first screen happens under the splash, so it must not slide or fade in while the splash goes.
  const splashHidden = useSplashHidden();

  return (
    <>
      <StatusBar barStyle={themeColors.isDark ? 'light-content' : 'dark-content'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: splashHidden ? 'default' : 'none',
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
