/**
 * appConfigService.ts
 * Reads appConfig/latest: the newest APK version and where to download it. The owner edits this document by hand in
 * the Firebase Console after building a new APK (API.md 1.12). Signed-in users can read it, nobody can write it.
 */

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { AppConfig, parseAppConfig } from '../utils/appUpdate';

/** Calls back with the current config, or null when the document is missing, invalid or unreadable. */
export function subscribeAppConfig(onChange: (config: AppConfig | null) => void): () => void {
  return onSnapshot(
    doc(db, 'appConfig', 'latest'),
    (snap) => onChange(snap.exists() ? parseAppConfig(snap.data()) : null),
    (error) => {
      console.warn('App config listener error:', error.message);
      onChange(null);
    }
  );
}
