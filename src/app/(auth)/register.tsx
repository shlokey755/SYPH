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

export default function RegisterScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { register } = useAuth();
  const { themeColors } = useTheme();
  const router = useRouter();

  const handleRegister = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please fill out all fields.');
      return;
    }

    setIsLoading(true);
    try {
      await register(username, password);
      Alert.alert('Success', 'Account created! Please log in.', [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
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
  toggleText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
});