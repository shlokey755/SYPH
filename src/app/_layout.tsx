// src/app/_layout.tsx
import { Stack } from 'expo-router';
import { ThemeProvider, useTheme } from '../hooks/themeContext';
import { ToastProvider } from '../hooks/toastNotifications';
import { AuthProvider } from '../hooks/useAuth';
import { ConversationsProvider } from '../hooks/useConversations';
import { UserSettingsProvider } from '../hooks/useUserSettings';

function RootNav() {
  const { themeColors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: themeColors?.background || '#121212' },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[id]" />
    </Stack>
  );
}

// Provider order matters: settings and conversations read the signed-in user, toasts read the theme.
export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <UserSettingsProvider>
            <ConversationsProvider>
              <RootNav />
            </ConversationsProvider>
          </UserSettingsProvider>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
