// app/index.tsx
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from './hooks/useAuth';

export default function Index() {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  // Go to main tabs group if logged in
  if (currentUser) {
    return <Redirect href="/(tabs)" />;
  }

  // Go to auth screen if logged out
  return <Redirect href="/(auth)/auth" />;
}