/**
 * useAppUpdate.ts
 * State and actions for the Update button. Combines expo-updates (OTA) with the newest-APK document, and checks for an
 * OTA update when the screen opens and whenever SYPH comes back to the front (at most every few minutes).
 */

import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { subscribeAppConfig } from '../services/appConfigService';
import { AppConfig, RECHECK_AFTER_MS, UpdateKind, decideUpdate, isNewerApk } from '../utils/appUpdate';

export interface AppUpdate {
  kind: UpdateKind;
  /** The version installed on this phone ("7.6.0"), or null if unknown. */
  installedVersion: string | null;
  /** The OTA update running right now (first 8 characters), or null when running the version built into the APK. */
  runningUpdate: string | null;
  config: AppConfig | null;
  /** 0 to 1 while downloading, when known. */
  progress: number | undefined;
  /** Set while the button's action is running (download, restart). */
  busy: boolean;
  /** Message of the last failed action, if any. */
  actionError: string | null;
  check: () => Promise<void>;
  apply: () => Promise<void>;
}

export function useAppUpdate(): AppUpdate {
  const updates = Updates.useUpdates();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const lastCheck = useRef(0);

  useEffect(() => subscribeAppConfig(setConfig), []);

  const installedVersion = Application.nativeApplicationVersion ?? null;
  const apkNewer = isNewerApk(installedVersion, config);

  const check = useCallback(async () => {
    if (!Updates.isEnabled) return;
    lastCheck.current = Date.now();
    try {
      await Updates.checkForUpdateAsync();
    } catch (error) {
      // useUpdates() reports it as checkError; nothing else to do.
      console.warn('Update check failed:', error instanceof Error ? error.message : error);
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheck.current > RECHECK_AFTER_MS) void check();
    });
    return () => sub.remove();
  }, [check]);

  const kind = decideUpdate({
    otaEnabled: Updates.isEnabled,
    isChecking: updates.isChecking,
    isDownloading: updates.isDownloading,
    isUpdatePending: updates.isUpdatePending,
    isUpdateAvailable: updates.isUpdateAvailable,
    hasError: !!updates.checkError || !!updates.downloadError,
    apkNewer,
  });

  const apply = useCallback(async () => {
    setActionError(null);
    setBusy(true);
    try {
      if (kind === 'apk-available' && config) {
        await Linking.openURL(config.apkUrl);
      } else if (kind === 'ota-available' || kind === 'ota-ready') {
        if (kind === 'ota-available') await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The update did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }, [kind, config]);

  return {
    kind,
    installedVersion,
    runningUpdate: Updates.updateId && !Updates.isEmbeddedLaunch ? Updates.updateId.slice(0, 8) : null,
    config,
    progress: updates.downloadProgress,
    busy,
    actionError,
    check,
    apply,
  };
}
