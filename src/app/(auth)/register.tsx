// src/app/(auth)/register.tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Field, HeroTitle, MapButton, Page, Paper, POINTER, Text } from '../../components/parchment';
import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { validateEmail, validatePassword, validateUsername } from '../../utils/auth';

export default function RegisterScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { register } = useAuth();
  const { themeColors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleRegister = async () => {
    const problem =
      validateUsername(username) ?? (email.trim() ? validateEmail(email) : null) ?? validatePassword(password);
    if (problem) {
      Alert.alert('Check your details', problem);
      return;
    }

    setIsLoading(true);
    try {
      await register(username, password, email);
      // Registering signs the new account in, so go straight to the app.
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'An error occurred during registration.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Page variant="map" style={{ paddingTop: insets.top }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <HeroTitle title="SYPH" size={68} note="Sign the ship's articles" />

        <Paper torn="both" contentStyle={styles.panel}>
          <Text kind="display" style={[styles.heading, { color: themeColors.ink }]}>
            Create New Account
          </Text>

          <Field
            placeholder="Choose a username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            editable={!isLoading}
          />

          <Field
            placeholder="Email (optional, lets you reset your password)"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!isLoading}
          />

          <Field
            placeholder="Password (at least 6 characters)"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            editable={!isLoading}
            returnKeyType="go"
            onSubmitEditing={handleRegister}
          />

          <Text kind="hand" style={[styles.hint, { color: themeColors.inkSoft }]}>
            With an email you sign in using that email. Without one you sign in with your username and cannot reset a
            forgotten password.
          </Text>

          <MapButton title="Register" onPress={handleRegister} loading={isLoading} />
        </Paper>

        <Pressable
          onPress={() => router.replace('/login')}
          disabled={isLoading}
          accessibilityRole="link"
          style={[POINTER, styles.link]}
        >
          <Text kind="hand" style={[styles.linkText, { color: themeColors.accent }]}>
            Already have an account? Login
          </Text>
        </Pressable>
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 24, gap: 14 },
  panel: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 14 },
  heading: { fontSize: 30, lineHeight: 36, textAlign: 'center' },
  hint: { fontSize: 17, lineHeight: 21 },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkText: { fontSize: 19, lineHeight: 24, textAlign: 'center' },
});
