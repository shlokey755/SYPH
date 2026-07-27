// src/app/_layout.tsx
import { Stack } from 'expo-router';
import { ThemeProvider, useTheme } from '../hooks/themeContext';
import { AuthProvider } from '../hooks/useAuth';

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

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <RootNav />
      </ThemeProvider>
    </AuthProvider>
  );
}