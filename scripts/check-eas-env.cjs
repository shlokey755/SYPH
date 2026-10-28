// Runs on EAS before `npm ci` (package.json "eas-build-pre-install").
// EAS skips git-ignored files, so the Firebase values must come from EAS environment variables.
// Without this check a build with missing values still succeeds and then crashes on launch
// with auth/invalid-api-key, after a 20-40 minute wait.
const REQUIRED = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

const missingKeys = (env) => REQUIRED.filter((key) => !String(env[key] ?? '').trim());

module.exports = { REQUIRED, missingKeys };

if (require.main === module) {
  const missing = missingKeys(process.env);
  if (missing.length > 0) {
    console.error('\nBuild stopped: these values are missing in this EAS environment:');
    for (const key of missing) console.error('  - ' + key);
    console.error('\nFix (once): copy .env to .env.local, then run, for the environment this profile uses:');
    console.error('  eas env:push preview --path .env.local');
    console.error('(also development and production). Then build again. See API.md 1.2.\n');
    process.exit(1);
  }
  console.log('Firebase environment values present.');
}
