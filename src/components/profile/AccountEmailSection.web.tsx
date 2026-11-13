/**
 * AccountEmailSection.tsx
 * Shows the sign-in email and lets the person add or change it (FR-01).
 *
 * A username-only account has no real email, so it cannot reset a forgotten password. Adding one here sends a
 * confirmation link to the new address; Firebase only switches the sign-in email once that link is opened.
 * From then on the person signs in with the email instead of the username.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Field, MapButton, Text } from '../parchment';
import { useTheme } from '../../theme/mapTheme';
import { useToast } from '../../hooks/toastNotifications';
import { refreshAccountEmail, requestEmailChange, sendVerificationEmail } from '../../services/accountService';
import { auth } from '../../firebaseConfig';
import { friendlyAuthError, isLegacyEmail, validateEmail } from '../../utils/auth';

export function AccountEmailSection() {
  const { themeColors } = useTheme();
  const toast = useToast();

  const [account, setAccount] = useState({
    email: auth.currentUser?.email ?? null,
    verified: auth.currentUser?.emailVerified ?? false,
  });
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setAccount(await refreshAccountEmail());
    } catch {
      // Offline or signed out: keep what is shown.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasRealEmail = !!account.email && !isLegacyEmail(account.email);

  const submit = async () => {
    const problem = validateEmail(newEmail);
    if (problem) {
      toast.error('Check the email', problem);
      return;
    }
    if (!password) {
      toast.error('Enter your password', 'It is needed to confirm this change.');
      return;
    }

    setBusy(true);
    try {
      await requestEmailChange(newEmail, password);
      toast.success('Confirmation sent', `Open the link we emailed to ${newEmail.trim()}, then sign in with that email.`);
      setNewEmail('');
      setPassword('');
    } catch (e: any) {
      toast.error('Could not change email', friendlyAuthError(e?.code, 'email') ?? e?.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      await sendVerificationEmail();
      toast.success('Verification email sent', 'Check your inbox, then tap "Check again".');
    } catch (e: any) {
      toast.error('Could not send email', friendlyAuthError(e?.code, 'general') ?? e?.message);
    } finally {
      setBusy(false);
    }
  };


  return (
    <View style={styles.section}>
      <Text kind="label" style={[styles.title, { color: themeColors.stamp }]}>Account email</Text>

      <View style={[styles.card, { backgroundColor: themeColors.paper, borderColor: themeColors.trail }]}>
        {hasRealEmail ? (
          <>
            <Text style={[styles.email, { color: themeColors.text }]} numberOfLines={1}>
              {account.email}
            </Text>
            <Text style={{ color: account.verified ? themeColors.accent : themeColors.subText, fontSize: 15 }}>
              {account.verified ? 'Verified' : 'Not verified yet'}
            </Text>
          </>
        ) : (
          <Text style={{ color: themeColors.subText, fontSize: 15, lineHeight: 21 }}>
            No email on this account. You sign in with your username, and a forgotten password cannot be reset. Add an
            email to fix that.
          </Text>
        )}
      </View>

      {hasRealEmail && !account.verified && (
        <View style={styles.row}>
          <TouchableOpacity onPress={resend} disabled={busy}>
            <Text kind="hand" style={[styles.link, { color: themeColors.accent }]}>Resend verification email</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={refresh} disabled={busy}>
            <Text kind="hand" style={[styles.link, { color: themeColors.accent }]}>Check again</Text>
          </TouchableOpacity>
        </View>
      )}

      <Field
        boxStyle={styles.fieldBox}
        placeholder={hasRealEmail ? 'New email' : 'Email to add'}
        value={newEmail}
        onChangeText={setNewEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!busy}
      />
      <Field
        boxStyle={styles.fieldBox}
        placeholder="Current password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        editable={!busy}
      />
      <Text style={[styles.hint, { color: themeColors.subText }]}>
        We email a confirmation link to the new address. Once you open it, sign in with that email instead of your
        username.
      </Text>
      <MapButton
        title={hasRealEmail ? 'Change email' : 'Add email'}
        onPress={submit}
        loading={busy}
        disabled={busy || !newEmail.trim()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 15, marginBottom: 25 },
  title: { fontSize: 17, letterSpacing: 1, marginBottom: 10 },
  card: { padding: 14, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: 12, gap: 4 },
  email: { fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  link: { fontSize: 16, fontWeight: '600' },
  fieldBox: { marginBottom: 10 },
  hint: { fontSize: 15, lineHeight: 20, marginBottom: 10 },
});
