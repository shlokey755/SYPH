/**
 * AccountEmailSection.tsx
 * Shows the sign-in email and lets the person add or change it (FR-01).
 *
 * A username-only account has no real email, so it cannot reset a forgotten password. Adding one here sends a
 * confirmation link to the new address; Firebase only switches the sign-in email once that link is opened.
 * From then on the person signs in with the email instead of the username.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
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

  const inputStyle = [
    styles.input,
    { backgroundColor: themeColors.inputBg, color: themeColors.text, borderColor: themeColors.border },
  ];

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: themeColors.subText }]}>Account email</Text>

      <View style={[styles.card, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
        {hasRealEmail ? (
          <>
            <Text style={[styles.email, { color: themeColors.text }]} numberOfLines={1}>
              {account.email}
            </Text>
            <Text style={{ color: account.verified ? themeColors.accent : themeColors.subText, fontSize: 13 }}>
              {account.verified ? 'Verified' : 'Not verified yet'}
            </Text>
          </>
        ) : (
          <Text style={{ color: themeColors.subText, fontSize: 13, lineHeight: 18 }}>
            No email on this account. You sign in with your username, and a forgotten password cannot be reset. Add an
            email to fix that.
          </Text>
        )}
      </View>

      {hasRealEmail && !account.verified && (
        <View style={styles.row}>
          <TouchableOpacity onPress={resend} disabled={busy}>
            <Text style={[styles.link, { color: themeColors.accent }]}>Resend verification email</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={refresh} disabled={busy}>
            <Text style={[styles.link, { color: themeColors.accent }]}>Check again</Text>
          </TouchableOpacity>
        </View>
      )}

      <TextInput
        style={inputStyle}
        placeholder={hasRealEmail ? 'New email' : 'Email to add'}
        placeholderTextColor={themeColors.subText}
        value={newEmail}
        onChangeText={setNewEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!busy}
      />
      <TextInput
        style={inputStyle}
        placeholder="Current password"
        placeholderTextColor={themeColors.subText}
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
      <TouchableOpacity
        style={[styles.button, { backgroundColor: themeColors.accent }, (busy || !newEmail.trim()) && { opacity: 0.6 }]}
        onPress={submit}
        disabled={busy || !newEmail.trim()}
      >
        <Text style={[styles.buttonText, { color: themeColors.buttonText }]}>
          {busy ? 'Working...' : hasRealEmail ? 'Change email' : 'Add email'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 15, marginBottom: 25 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },
  card: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 12, gap: 4 },
  email: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  link: { fontSize: 14, fontWeight: '600' },
  input: { padding: 14, borderRadius: 10, borderWidth: 1, fontSize: 16, marginBottom: 10 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  button: { padding: 14, borderRadius: 10, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
