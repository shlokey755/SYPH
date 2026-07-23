/**
 * auth.tsx (UPDATED with Dynamic Theme Support)
 * Login and registration screen
 */

import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity
} from 'react-native';
import { ThemeProvider, useTheme } from '../hooks/themeContext';
import { useAuth } from '../hooks/useAuth';

export default function AuthScreen() {
  return (
    <ThemeProvider>
      <ThemedAuthContent />
    </ThemeProvider>
  );
}

function ThemedAuthContent() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { register, login } = useAuth();
  const { themeColors } = useTheme();

  const handleSubmit = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please fill out all fields.');
      return;
    }

    setIsLoading(true);
    try {
      if (isRegistering) {
        await register(username, password);
        Alert.alert('Success', 'Account created! You can now login.');
        setUsername('');
        setPassword('');
        setIsRegistering(false);
      } else {
        await login(username, password);
      }
    } catch (error: any) {
      Alert.alert(
        isRegistering ? 'Registration Failed' : 'Login Failed',
        error.message || 'An error occurred'
      );
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
        {isRegistering ? 'Create New Account' : 'Welcome Back'}
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
        onPress={handleSubmit}
        disabled={isLoading}
      >
        <Text style={[styles.buttonText, { color: themeColors.buttonText }]}>
          {isLoading ? 'Processing...' : isRegistering ? 'Register' : 'Login'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          setIsRegistering(!isRegistering);
          setUsername('');
          setPassword('');
        }}
        disabled={isLoading}
      >
        <Text style={[styles.toggleText, { color: themeColors.accent }]}>
          {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
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
