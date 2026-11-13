/**
 * NameSection.tsx
 * Optional display name (FR-02). Shown to other people instead of the @username in chat lists and headers.
 * Leaving it empty falls back to the username.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Field, MapButton, Text } from '../parchment';
import { setCachedProfile } from '../../hooks/useProfiles';
import { useTheme } from '../../theme/mapTheme';
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
      <Text kind="label" style={[styles.title, { color: themeColors.stamp }]}>Name</Text>
      <Field
        boxStyle={styles.fieldBox}
        placeholder={username}
        value={value}
        onChangeText={setText}
        maxLength={DISPLAY_NAME_MAX}
        editable={!saving}
      />
      <Text style={[styles.hint, { color: themeColors.subText }]}>
        Shown to your contacts instead of @{username}. Leave empty to show your username.
      </Text>
      <MapButton title="Save name" onPress={save} loading={saving} disabled={saving || unchanged} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 15, marginBottom: 25 },
  title: { fontSize: 17, letterSpacing: 1, marginBottom: 10 },
  fieldBox: { marginBottom: 8 },
  hint: { fontSize: 15, lineHeight: 20, marginBottom: 10 },
});
