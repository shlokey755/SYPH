// src/app/(auth)/login.tsx
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

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const { themeColors } = useTheme();
  const router = useRouter();

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Error', 'Please enter your username and password.');
      return;
    }

    setIsLoading(true);
    try {
      await login(username, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'An error occurred during login.';
      if (
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password'
      ) {
        errorMessage = 'Invalid username or password.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      Alert.alert('Login Failed', errorMessage);
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
        Welcome Back
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
        placeholder="Enter Username"
        placeholderTextColor={themeColors.subText}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
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
        placeholder="Enter Password"
        placeholderTextColor={themeColors.subText}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        editable={!isLoading}
      />

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: themeColors.accent },
          isLoading && { opacity: 0.6 },
        ]}
        onPress={handleLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={themeColors.buttonText} />
        ) : (
          <Text style={[styles.buttonText, { color: themeColors.buttonText }]}>
            Login
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push('/(auth)/register')}
        disabled={isLoading}
      >
        <Text style={[styles.toggleText, { color: themeColors.accent }]}>
          Don't have an account? Register
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
  toggleText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
});