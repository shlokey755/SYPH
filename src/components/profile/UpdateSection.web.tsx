/**
 * UpdateSection.tsx
 * The "App update" card in the Me tab, just under the sign-in email. The button is grey until an update exists, then it
 * turns active: an OTA update downloads and restarts the app, a new APK opens its download link.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MapButton, Text } from '../parchment';
import { useTheme } from '../../theme/mapTheme';
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
        return 'Download the new version';
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
      <Text kind="label" style={[styles.title, { color: themeColors.stamp }]}>App update</Text>
      <View style={[styles.card, { backgroundColor: themeColors.paper, borderColor: themeColors.trail }]}>
        <Text style={[styles.version, { color: themeColors.text }]}>
          Version {update.installedVersion ?? 'unknown'}
          {update.runningUpdate ? ` · update ${update.runningUpdate}` : ''}
        </Text>
        {status && <Text style={[styles.hint, { color: themeColors.subText }]}>{status}</Text>}
        {update.actionError && <Text style={[styles.hint, { color: themeColors.danger }]}>{update.actionError}</Text>}

        <MapButton
          title={label}
          onPress={update.apply}
          disabled={!actionable}
          loading={update.busy || kind === 'checking' || kind === 'downloading'}
          variant={actionable ? 'plank' : 'ghost'}
        />

        {showCheck && (
          <Pressable onPress={update.check} hitSlop={8} accessibilityRole="button">
            <Text kind="hand" style={[styles.link, { color: themeColors.accent }]}>Check for updates</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 15, marginBottom: 25 },
  title: { fontSize: 17, letterSpacing: 1, marginBottom: 10 },
  card: { padding: 14, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed', gap: 8 },
  version: { fontSize: 18, fontWeight: '600' },
  hint: { fontSize: 15, lineHeight: 20 },
  link: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
