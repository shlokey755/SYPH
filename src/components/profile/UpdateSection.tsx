/**
 * UpdateSection.tsx
 * The "App update" card in the Me tab, just under the sign-in email. The button is grey until an update exists, then it
 * turns active: an OTA update downloads and restarts the app, a new APK opens its download link.
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { isActionable } from '../../utils/appUpdate';

export function UpdateSection() {
  const { themeColors } = useTheme();
  const update = useAppUpdate();
  const { kind, config } = update;

  const actionable = isActionable(kind) && !update.busy;
  const label = (() => {
    switch (kind) {
      case 'apk-available':
        return `Download version ${config?.latestVersion ?? ''}`.trim();
      case 'ota-available':
        return 'Update now';
      case 'ota-ready':
        return 'Restart to update';
      case 'downloading':
        return update.progress != null ? `Downloading ${Math.round(update.progress * 100)}%` : 'Downloading…';
      case 'checking':
        return 'Checking…';
      case 'dev':
        return 'Updates are off in this build';
      case 'error':
        return 'Could not check';
      default:
        return 'Up to date';
    }
  })();

  const status = (() => {
    switch (kind) {
      case 'apk-available':
        return config?.notes || 'A new version of SYPH is ready to install.';
      case 'ota-available':
        return 'A new update is ready. It downloads in a moment and SYPH restarts.';
      case 'ota-ready':
        return 'The update is downloaded. Restart SYPH to use it.';
      case 'dev':
        return 'Updates work in the installed app, not in Expo Go or a development build.';
      case 'error':
        return 'Check your internet connection, then try again.';
      default:
        return null;
    }
  })();

  const showCheck = kind === 'current' || kind === 'error';

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: themeColors.subText }]}>App update</Text>
      <View style={[styles.card, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
        <Text style={[styles.version, { color: themeColors.text }]}>
          Version {update.installedVersion ?? 'unknown'}
          {update.runningUpdate ? ` · update ${update.runningUpdate}` : ''}
        </Text>
        {status && <Text style={[styles.hint, { color: themeColors.subText }]}>{status}</Text>}
        {update.actionError && <Text style={[styles.hint, { color: themeColors.danger }]}>{update.actionError}</Text>}

        <Pressable
          onPress={update.apply}
          disabled={!actionable}
          accessibilityRole="button"
          accessibilityState={{ disabled: !actionable, busy: update.busy || kind === 'downloading' }}
          style={[
            styles.button,
            actionable
              ? { backgroundColor: themeColors.accent }
              : { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, borderWidth: 1 },
          ]}
        >
          {(update.busy || kind === 'checking' || kind === 'downloading') && (
            <ActivityIndicator size="small" color={actionable ? themeColors.buttonText : themeColors.subText} />
          )}
          <Text style={[styles.buttonText, { color: actionable ? themeColors.buttonText : themeColors.subText }]}>
            {label}
          </Text>
        </Pressable>

        {showCheck && (
          <Pressable onPress={update.check} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.link, { color: themeColors.accent }]}>Check for updates</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 15, marginBottom: 25 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },
  card: { padding: 14, borderRadius: 10, borderWidth: 1, gap: 8 },
  version: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
  button: { padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  link: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
