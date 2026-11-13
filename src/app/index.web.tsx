// src/app/index.tsx
// Entry route: decides where to go once the auth state is known.
//   signed in                        -> tabs
//   signed out, first launch         -> onboarding
//   signed out, onboarding already seen -> login
// On a phone the native splash stays up until this has navigated (markStartupRouted), so the compass below is only ever
// seen there if the splash time limit is reached first. In a browser there is no native splash, so it is what people see
// while the sign-in state is being read.
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Loading, Page } from '../components/parchment';
import { useAuth } from '../hooks/useAuth';
import { hasSeenOnboarding } from '../services/onboarding';
import { markStartupRouted } from '../services/startupRoute';

export default function Index() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (currentUser) {
      router.replace('/(tabs)');
      markStartupRouted();
      return;
    }

    let cancelled = false;
    hasSeenOnboarding().then((seen) => {
      if (cancelled) return;
      router.replace(seen ? '/(auth)/login' : '/onboarding');
      markStartupRouted();
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, isLoading, router]);

  return (
    <Page variant="map" style={styles.container}>
      <Loading size={56} label="Charting the course..." />
    </Page>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
