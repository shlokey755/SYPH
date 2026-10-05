/**
 * me.tsx
 * Me Tab - Profile editor with username change (1x per day) and profile picture upload
 */

import { Ionicons } from '@expo/vector-icons';
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
  View
} from 'react-native';
import { themeList, useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';

export default function MeTab() {
  const { currentUser, logout } = useAuth();
  const { profile, canChangeUsername, timeUntilCanChange, updateUsername } =
    useUserProfile(currentUser?.uid);

  const { selectedTheme, themeColors, setTheme } = useTheme();
  const router = useRouter();

  const [newUsername, setNewUsername] = useState('');
  const [isChangingUsername, setIsChangingUsername] = useState(false);

  const handleChangeUsername = async () => {
    if (!newUsername.trim()) {
      Alert.alert('Error', 'Please enter a new username');
      return;
    }

    if (!canChangeUsername) {
      Alert.alert('Try Again Tomorrow', `You can change your username in ${timeUntilCanChange}`);
      return;
    }

    setIsChangingUsername(true);
    const result = await updateUsername(newUsername.trim());

    if (result.success) {
      Alert.alert('Success', 'Username updated!');
      setNewUsername('');
    } else {
      Alert.alert('Error', result.error || 'Failed to update username');
    }

    setIsChangingUsername(false);
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
            // Pointing to the root group-level route or login entry layout 
            // preventing the unmatched route fallback warning.
            router.replace('/(auth)/login');
          } catch (error: any) {
            Alert.alert('Logout Error', error.message || 'Failed to log out.');
          }
        },
      },
    ]);
  };

  if (!profile) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>My Profile</Text>
      </View>

      {/* Username Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.subText }]}>Username</Text>
        <View style={[styles.usernameDisplay, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
          <Text style={[styles.currentUsername, { color: themeColors.accent }]}>
            @{profile?.username || 'User'}
          </Text>
        </View>

        <TextInput
          style={[styles.input, { backgroundColor: themeColors.inputBg, color: themeColors.text, borderColor: themeColors.border }]}
          placeholder="New username"
          placeholderTextColor={themeColors.subText}
          value={newUsername}
          onChangeText={setNewUsername}
          autoCapitalize="none"
          editable={!isChangingUsername}
        />

        {!canChangeUsername && (
          <View style={styles.warningBox}>
            <Ionicons name="alert-circle" size={16} color="#FFC107" />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Try Again Tomorrow</Text>
              <Text style={styles.warningText}>{timeUntilCanChange}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: themeColors.accent },
            (!canChangeUsername || isChangingUsername) && { opacity: 0.6 },
          ]}
          onPress={handleChangeUsername}
          disabled={!canChangeUsername || isChangingUsername}
        >
          <Text style={[styles.buttonText, { color: themeColors.buttonText }]}>
            {isChangingUsername ? 'Updating...' : 'Change Username (1x per day)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Theme Options Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.subText }]}>Theme</Text>
        <View style={styles.themeContainer}>
          {themeList.map((item) => {
            const isSelected = selectedTheme === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.themeOption,
                  { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border },
                  isSelected && { borderColor: themeColors.accent, borderWidth: 2 },
                ]}
                onPress={() => setTheme(item.id)}
              >
                <View style={styles.themePreview}>
                  <View style={[styles.colorBadge, { backgroundColor: item.colors.background, borderWidth: 1, borderColor: item.colors.border }]} />
                  <View style={[styles.colorBadge, { backgroundColor: item.colors.accent }]} />
                </View>
                <Text style={[styles.themeLabel, { color: themeColors.subText }, isSelected && { color: themeColors.text, fontWeight: '600' }]}>
                  {item.label}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={18} color={themeColors.accent} style={styles.checkIcon} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Logout Section */}
      <View style={styles.section}>
        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.danger }]} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color={themeColors.danger} />
          <Text style={[styles.logoutText, { color: themeColors.danger }]}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  },
  header: {
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  section: {
    paddingHorizontal: 15,
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  usernameDisplay: {
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
  },
  currentUsername: {
    fontSize: 18,
    fontWeight: '600',
  },
  input: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A1A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  warningContent: {
    marginLeft: 12,
    flex: 1,
  },
  warningTitle: {
    color: '#FFC107',
    fontWeight: '600',
    fontSize: 14,
  },
  warningText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 4,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  themeContainer: {
    gap: 10,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
  },
  themePreview: {
    flexDirection: 'row',
    marginRight: 12,
  },
  colorBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#777',
    marginRight: -4,
  },
  themeLabel: {
    fontSize: 15,
    flex: 1,
  },
  checkIcon: {
    marginLeft: 'auto',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
  },
  logoutText: {
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 12,
  },
  spacer: {
    height: 30,
  },
});