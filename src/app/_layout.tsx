// src/app/_layout.tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import { ThemeProvider, useTheme } from '../hooks/themeContext';
import { ToastProvider } from '../hooks/toastNotifications';
import { AuthProvider } from '../hooks/useAuth';
import { ConversationsProvider } from '../hooks/useConversations';
import { IncomingCallsProvider } from '../hooks/useIncomingCalls';
import { UserSettingsProvider } from '../hooks/useUserSettings';

function RootNav() {
  const { themeColors } = useTheme();

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
