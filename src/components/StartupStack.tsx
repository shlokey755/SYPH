/**
 * StartupStack.tsx
 * The app's root stack. Screen animations are off until the native splash is gone: the hand-off from the entry route
 * to the first real screen happens under the splash, and a slide or fade still running when the splash goes would be
 * the twitch this is here to prevent. After that the normal transitions are back.
 */

import { Stack } from 'expo-router';
import React from 'react';
import { useTheme } from '../hooks/themeContext';
import { useSplashHidden } from '../hooks/useSplashGate';

export function StartupStack({ children }: { children: React.ReactNode }) {
  const { themeColors } = useTheme();
  const splashHidden = useSplashHidden();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: splashHidden ? 'default' : 'none',
        contentStyle: { backgroundColor: themeColors.background },
      }}
    >
      {children}
    </Stack>
  );
}
