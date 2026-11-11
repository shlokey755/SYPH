/**
 * me.tsx
 * Me Tab - Profile editor: name, username change (1x per day), sign-in email, notifications, theme.
 * The avatar is always the user's initial: there is no photo upload because the app has no file storage.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Avatar,
  buttonInk,
  Field,
  IS_WEB,
  Loading,
  MapButton,
  Page,
  PageTitle,
  Paper,
  Text,
  TrailLine,
} from '../../components/parchment';
import { FORM_WIDTH } from '../../theme/web';
import { useTheme } from '../../hooks/themeContext';
import { useToast } from '../../hooks/toastNotifications';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useUserSettings } from '../../hooks/useUserSettings';
import { AccountEmailSection } from '../../components/profile/AccountEmailSection';
import { CallOverlaySection } from '../../components/profile/CallOverlaySection';
import { SoundsSection } from '../../components/profile/SoundsSection';
import { UpdateSection } from '../../components/profile/UpdateSection';
import { NameSection } from '../../components/profile/NameSection';
import { isPushSupported, registerForPush } from '../../services/pushService';

export default function MeTab() {
  const { currentUser, logout, refreshCurrentUser } = useAuth();
  const { profile, canChangeUsername, timeUntilCanChange, updateUsername, patchProfile } =
    useUserProfile(currentUser?.uid);

  const { themeColors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const toast = useToast();
  const { settings, setNotifications } = useUserSettings();

  const [newUsername, setNewUsername] = useState('');
  const [isChangingUsername, setIsChangingUsername] = useState(false);

  const handleToggleNotifications = async (enabled: boolean) => {
    try {
      await setNotifications(enabled);
      // Turning alerts on is the moment to ask for the system permission and explain if it is blocked.
      if (enabled && currentUser && isPushSupported()) {
        const result = await registerForPush(currentUser.uid, settings.expoPushTokens);
        if (result.status === 'denied') {
          toast.info('Notifications are blocked', 'Allow notifications for SYPH in your phone settings.');
        }
      }
    } catch (e) {
      toast.error('Could not update notifications', e instanceof Error ? e.message : undefined);
    }
  };

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
      void refreshCurrentUser(); // so messages and calls from now on use the new name
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
      <Page variant="map" style={styles.center}>
        <Loading label="Unrolling your page..." />
      </Page>
    );
  }

  return (
    <Page variant="map" style={{ paddingTop: insets.top }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <PageTitle title="Me" note="Your corner of the map" />
          <TrailLine x style={styles.trail} />
        </View>

        {/* Avatar: initial only (no photos, the app has no file storage) */}
        <View style={styles.photoSection}>
          <Avatar name={profile.username} size={96} seed={currentUser!.uid} />
        </View>

        {/* Name Section (optional display name, FR-02) */}
        <NameSection
          uid={currentUser!.uid}
          username={profile.username}
          savedName={profile.displayName ?? ''}
          onSaved={(name) => {
            patchProfile({ displayName: name });
            void refreshCurrentUser();
          }}
        />

        {/* Username Section */}
        <View style={styles.section}>
          <Text kind="label" style={[styles.sectionTitle, { color: themeColors.stamp }]}>
            Username
          </Text>
          <Paper trail contentStyle={styles.usernameDisplay} style={styles.gap}>
            <Text kind="display" style={[styles.currentUsername, { color: themeColors.accent }]}>
              @{profile?.username || 'User'}
            </Text>
          </Paper>

          <Field
            boxStyle={styles.gap}
            placeholder="New username"
            value={newUsername}
            onChangeText={setNewUsername}
            autoCapitalize="none"
            editable={!isChangingUsername}
          />

          {!canChangeUsername && (
            <Paper tone="alt" lift={0} contentStyle={styles.warn} style={styles.gap}>
              <Ionicons name="alert-circle" size={20} color={themeColors.stamp} />
              <View style={styles.grow}>
                <Text kind="label" style={[styles.warnTitle, { color: themeColors.stamp }]}>
                  Try again tomorrow
                </Text>
                <Text kind="hand" style={[styles.hint, { color: themeColors.inkSoft }]}>
                  {timeUntilCanChange}
                </Text>
              </View>
            </Paper>
          )}

          <MapButton
            title="Change username"
            onPress={handleChangeUsername}
            loading={isChangingUsername}
            disabled={!canChangeUsername || isChangingUsername}
          />
          <Text kind="hand" style={[styles.hint, styles.centered, { color: themeColors.subText }]}>
            You can change it once a day.
          </Text>
        </View>

        {/* Sign-in email (FR-01) */}
        <AccountEmailSection />

        {/* App update: active only when a new update arrives */}
        <UpdateSection />

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text kind="label" style={[styles.sectionTitle, { color: themeColors.stamp }]}>
            Notifications
          </Text>
          <Paper trail contentStyle={styles.switchRow}>
            <View style={styles.grow}>
              <Text style={[styles.switchLabel, { color: themeColors.ink }]}>Mute all messages</Text>
              <Text style={[styles.hint, { color: themeColors.inkSoft }]}>
                Silences message alerts, and call alerts while SYPH is closed. To mute one chat, use the bell in its header.
              </Text>
              {!isPushSupported() && (
                <Text style={[styles.hint, styles.hintGap, { color: themeColors.inkSoft }]}>
                  {IS_WEB
                    ? 'In a browser you get in-app alerts only, while this tab is open.'
                    : 'Alerts while the app is closed need an installed build; in Expo Go you get in-app alerts only.'}
                </Text>
              )}
            </View>
            {/* The stored setting is "notifications enabled", so the switch shows the opposite: on means muted. */}
            <Switch
              value={!settings.notificationsEnabled}
              onValueChange={(muted) => handleToggleNotifications(!muted)}
              trackColor={{ true: themeColors.accent, false: themeColors.paperAlt }}
              thumbColor={themeColors.paper}
            />
          </Paper>
        </View>

        {/* Ringtone, message tone and vibration */}
        <SoundsSection />

        {/* Permissions behind the call bubble and the lock-screen call */}
        <CallOverlaySection />

        {/* Logout Section */}
        <View style={styles.section}>
          <MapButton
            variant="danger"
            title="Logout"
            onPress={handleLogout}
            icon={<Ionicons name="log-out" size={20} color={buttonInk(themeColors, 'danger')} />}
          />
        </View>
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 32, width: '100%', maxWidth: FORM_WIDTH, alignSelf: 'center' },
  head: { paddingHorizontal: 15 },
  trail: { marginTop: 4, marginBottom: 14 },
  section: { paddingHorizontal: 15, marginBottom: 25 },
  sectionTitle: { fontSize: 17, letterSpacing: 1, marginBottom: 10 },
  photoSection: { alignItems: 'center', marginBottom: 20 },
  gap: { marginBottom: 12 },
  grow: { flex: 1 },
  usernameDisplay: { padding: 14 },
  currentUsername: { fontSize: 30, lineHeight: 34 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  warnTitle: { fontSize: 16, letterSpacing: 0.6 },
  hint: { fontSize: 15, lineHeight: 19 },
  hintGap: { marginTop: 4 },
  centered: { textAlign: 'center', marginTop: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  switchLabel: { fontSize: 19, lineHeight: 23, fontWeight: '600' },
});
