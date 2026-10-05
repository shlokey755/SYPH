// src/app/index.tsx
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../hooks/themeContext';
import { useAuth } from '../hooks/useAuth';

export default function Index() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const { themeColors } = useTheme();

  useEffect(() => {
    if (isLoading) return;

    if (currentUser) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/login');
    }
  }, [currentUser, isLoading]);

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