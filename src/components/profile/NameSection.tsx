/**
 * NameSection.tsx
 * Optional display name (FR-02). Shown to other people instead of the @username in chat lists and headers.
 * Leaving it empty falls back to the username.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { setCachedProfile } from '../../hooks/useProfileImages';
import { useTheme } from '../../hooks/themeContext';
import { useToast } from '../../hooks/toastNotifications';
import { updateProfileFields } from '../../services/userService';
import { DISPLAY_NAME_MAX } from '../../utils/auth';

interface Props {
  uid: string;
  username: string;
  /** The saved display name ('' when none). */
  savedName: string;
  onSaved: (name: string) => void;
}

export function NameSection({ uid, username, savedName, onSaved }: Props) {
  const { themeColors } = useTheme();
  const toast = useToast();
  const [text, setText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const value = text ?? savedName;
  const trimmed = value.trim();
  const unchanged = trimmed === savedName.trim();

  const save = async () => {
    setSaving(true);
    try {
      await updateProfileFields(uid, { displayName: trimmed });
      setCachedProfile(uid, { name: trimmed || username });
      onSaved(trimmed);
      setText(null);
      toast.success(trimmed ? 'Name updated' : 'Name cleared', trimmed ? undefined : 'People will see your username');
    } catch (e) {
      toast.error('Could not save name', e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: themeColors.subText }]}>Name</Text>
      <TextInput
        style={[styles.input, { backgroundColor: themeColors.inputBg, color: themeColors.text, borderColor: themeColors.border }]}
        placeholder={username}
        placeholderTextColor={themeColors.subText}
        value={value}
        onChangeText={setText}
        maxLength={DISPLAY_NAME_MAX}
        editable={!saving}
      />
      <Text style={[styles.hint, { color: themeColors.subText }]}>
        Shown to your contacts instead of @{username}. Leave empty to show your username.
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: themeColors.accent }, (saving || unchanged) && { opacity: 0.6 }]}
        onPress={save}
        disabled={saving || unchanged}
      >
        <Text style={[styles.buttonText, { color: themeColors.buttonText }]}>{saving ? 'Saving...' : 'Save Name'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 15, marginBottom: 25 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },
  input: { padding: 14, borderRadius: 10, borderWidth: 1, fontSize: 16, marginBottom: 8 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  button: { padding: 14, borderRadius: 10, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
