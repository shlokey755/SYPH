// src/app/index.tsx
// Entry route: decides where to go once the auth state is known.
//   signed in                        -> tabs
//   signed out, first launch         -> onboarding
//   signed out, onboarding already seen -> login
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../hooks/themeContext';
import { useAuth } from '../hooks/useAuth';
import { hasSeenOnboarding } from '../services/onboarding';

export default function Index() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const { themeColors } = useTheme();

  useEffect(() => {
    if (isLoading) return;

    if (currentUser) {
      router.replace('/(tabs)');
      return;
    }

    let cancelled = false;
    hasSeenOnboarding().then((seen) => {
      if (cancelled) return;
      router.replace(seen ? '/(auth)/login' : '/onboarding');
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, isLoading, router]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ActivityIndicator size="large" color={themeColors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
