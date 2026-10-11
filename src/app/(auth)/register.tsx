// src/app/(auth)/register.tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
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
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: themeColors.text }]}>SYPH</Text>
      <Text style={[styles.subtitle, { color: themeColors.subText }]}>
        Create New Account
      </Text>

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: themeColors.inputBg,
            color: themeColors.text,
            borderColor: themeColors.border,
          },
        ]}
        placeholder="Choose a username"
        placeholderTextColor={themeColors.subText}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        editable={!isLoading}
      />

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: themeColors.inputBg,
            color: themeColors.text,
            borderColor: themeColors.border,
          },
        ]}
        placeholder="Email (optional, lets you reset your password)"
        placeholderTextColor={themeColors.subText}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!isLoading}
      />

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: themeColors.inputBg,
            color: themeColors.text,
            borderColor: themeColors.border,
          },
        ]}
        placeholder="Password (at least 6 characters)"
        placeholderTextColor={themeColors.subText}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        editable={!isLoading}
      />

      <Text style={[styles.hint, { color: themeColors.subText }]}>
        With an email you sign in using that email. Without one you sign in with your username and cannot reset a
        forgotten password.
      </Text>

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: themeColors.accent },
          isLoading && { opacity: 0.6 },
        ]}
        onPress={handleRegister}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={themeColors.buttonText} />
        ) : (
          <Text style={[styles.buttonText, { color: themeColors.buttonText }]}>
            Register
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.replace('/login')}
        disabled={isLoading}
      >
        <Text style={[styles.toggleText, { color: themeColors.accent }]}>
          Already have an account? Login
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
  },
  input: {
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4,
  },
  toggleText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
});