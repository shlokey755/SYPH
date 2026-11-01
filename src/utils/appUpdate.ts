/**
 * appUpdate.ts
 * Pure logic for the Update button in the Me tab. Two kinds of update exist:
 *   - OTA (expo-updates): new JavaScript and assets, downloaded in the app, no reinstall.
 *   - A new APK: anything native changed, so the person downloads and installs the file. The newest version and the
 *     download link are read from the Firestore document appConfig/latest (edited by hand in the Firebase Console).
 *     Builds are told apart by their build number (versionCode), never by the version people see.
 * No React Native imports, so it is unit tested.
 */

/**
 * The build number of an APK: Android's versionCode. EAS raises it by one on every preview build (eas.json
 * autoIncrement), people never see it, and the version they see stays the same. Null when it is not a positive whole
 * number, for example on web.
 */
export function parseBuild(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,6}$/.test(text)) return null;
  const build = Number(text);
  return build >= 1 ? build : null;
}

export interface AppConfig {
  /** Build number of the newest APK (see parseBuild). */
  latestBuild: number;
  /** Where to download the newest APK. Always https. */
  apkUrl: string;
  /** Short "what is new" text, may be empty. */
  notes: string;
}

/** Reads appConfig/latest. Null when the build number is missing or the link is not an https address. */
export function parseAppConfig(data: unknown): AppConfig | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const latestBuild = parseBuild(d.latestBuild);
  if (latestBuild === null) return null;
  const apkUrl = typeof d.apkUrl === 'string' ? d.apkUrl.trim() : '';
  if (!/^https:\/\/[^\s]+$/i.test(apkUrl)) return null;
  const notes = typeof d.notes === 'string' ? d.notes.trim().slice(0, 300) : '';
  return { latestBuild, apkUrl, notes };
}

/** True when the document names a newer build than the one installed. An unknown build never claims an update. */
export function isNewerApk(installedBuild: number | null | undefined, config: AppConfig | null): boolean {
  if (!config || installedBuild == null) return false;
  return installedBuild < config.latestBuild;
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
