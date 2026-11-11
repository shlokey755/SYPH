// src/app/(auth)/login.tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Field, HeroTitle, MapButton, Page, Paper, POINTER, Text } from '../../components/parchment';
import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { looksLikeEmail } from '../../utils/auth';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login, resetPassword } = useAuth();
  const { themeColors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Error', 'Please enter your username or email, and your password.');
      return;
    }

    setIsLoading(true);
    try {
      await login(username, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert('Login Failed', error.message || 'An error occurred during login.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!looksLikeEmail(username)) {
      Alert.alert(
        'Reset your password',
        'Type the email address of your account in the first box, then tap "Forgot password?" again.\n\n' +
          'Accounts made with only a username have no email, so they cannot be reset. If you are still signed in ' +
          'somewhere, add an email under Me > Account email.'
      );
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(username);
      Alert.alert('Check your email', `If an account exists for ${username.trim()}, a reset link is on its way.`);
    } catch (error: any) {
      Alert.alert('Could not send reset email', error.message || 'Try again in a moment.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Page variant="map" style={{ paddingTop: insets.top }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <HeroTitle title="SYPH" size={68} note="Chart your course" />

        <Paper torn="both" contentStyle={styles.panel}>
          <Text kind="display" style={[styles.heading, { color: themeColors.ink }]}>
            Welcome Back
          </Text>

          <Field
            placeholder="Username or email"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!isLoading}
          />

          <Field
            placeholder="Enter Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            editable={!isLoading}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />

          <MapButton title="Login" onPress={handleLogin} loading={isLoading} style={styles.cta} />

          <Pressable
            onPress={handleForgotPassword}
            disabled={isLoading}
            accessibilityRole="button"
            style={[POINTER, styles.link]}
          >
            <Text kind="hand" style={[styles.linkText, { color: themeColors.inkSoft }]}>
              Forgot password?
            </Text>
          </Pressable>
        </Paper>

        <Pressable
          onPress={() => router.push('/(auth)/register')}
          disabled={isLoading}
          accessibilityRole="link"
          style={[POINTER, styles.link]}
        >
          <Text kind="hand" style={[styles.linkText, { color: themeColors.accent }]}>
            Don't have an account? Register
          </Text>
        </Pressable>
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
    gap: 14,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  panel: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 14 },
  heading: { fontSize: 30, lineHeight: 36, textAlign: 'center' },
  cta: { marginTop: 4 },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkText: { fontSize: 19, lineHeight: 24, textAlign: 'center' },
});
