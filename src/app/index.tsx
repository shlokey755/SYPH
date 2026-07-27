// src/app/index.tsx
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';

export default function Index() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (currentUser) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/login');
    }
  }, [currentUser, isLoading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#03DAC5" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
});