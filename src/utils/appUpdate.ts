/**
 * appUpdate.ts
 * Pure logic for the Update button in the Me tab. Two kinds of update exist:
 *   - OTA (expo-updates): new JavaScript and assets, downloaded in the app, no reinstall.
 *   - A new APK: anything native changed, so the person downloads and installs the file. The newest version and the
 *     download link are read from the Firestore document appConfig/latest (edited by hand in the Firebase Console).
 * No React Native imports, so it is unit tested.
 */

/** "7.6.0" or "v7.6" -> [7, 6, 0] / [7, 6]. Null when it is not a dotted list of whole numbers. */
export function parseVersion(version: unknown): number[] | null {
  if (typeof version !== 'string') return null;
  const text = version.trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+){0,3}$/.test(text)) return null;
  return text.split('.').map(Number);
}

/** -1 when a is older than b, 0 when equal, 1 when newer. Null when either is not a version. Missing parts count as 0. */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export interface AppConfig {
  latestVersion: string;
  /** Where to download the newest APK. Always https. */
  apkUrl: string;
  /** Short "what is new" text, may be empty. */
  notes: string;
}

/** Reads appConfig/latest. Null when the version is missing or the link is not an https address. */
export function parseAppConfig(data: unknown): AppConfig | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (!parseVersion(d.latestVersion)) return null;
  const apkUrl = typeof d.apkUrl === 'string' ? d.apkUrl.trim() : '';
  if (!/^https:\/\/[^\s]+$/i.test(apkUrl)) return null;
  const notes = typeof d.notes === 'string' ? d.notes.trim().slice(0, 300) : '';
  return { latestVersion: String(d.latestVersion).trim().replace(/^v/i, ''), apkUrl, notes };
}

/** True when the document names a newer version than the one installed. Unknown versions never claim an update. */
export function isNewerApk(installed: string | null | undefined, config: AppConfig | null): boolean {
  if (!config) return false;
  return compareVersions(installed, config.latestVersion) === -1;
}

export type UpdateKind =
  | 'apk-available'
  | 'downloading'
  | 'checking'
  | 'ota-ready'
  | 'ota-available'
  | 'error'
  | 'current'
  | 'dev';

export interface UpdateInputs {
  /** expo-updates is on (false in Expo Go and in development builds). */
  otaEnabled: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  /** An update is downloaded and only needs a restart. */
  isUpdatePending: boolean;
  isUpdateAvailable: boolean;
  hasError: boolean;
  apkNewer: boolean;
}

/**
 * What the button should offer. A newer APK wins: updates published for the installed version are not what the
 * person needs next. A download in progress is never interrupted.
 */
export function decideUpdate(i: UpdateInputs): UpdateKind {
  if (i.isDownloading) return 'downloading';
  if (i.apkNewer) return 'apk-available';
  if (!i.otaEnabled) return 'dev';
  if (i.isUpdatePending) return 'ota-ready';
  if (i.isUpdateAvailable) return 'ota-available';
  if (i.isChecking) return 'checking';
  if (i.hasError) return 'error';
  return 'current';
}

/** Only these kinds make the button active. */
export const isActionable = (kind: UpdateKind): boolean =>
  kind === 'apk-available' || kind === 'ota-ready' || kind === 'ota-available';

/** The wait between automatic checks when the app comes back to the foreground. */
export const RECHECK_AFTER_MS = 5 * 60_000;
