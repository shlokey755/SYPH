/**
 * withAppShortcuts.js
 * Expo config plugin: the menu that opens when the SYPH icon on the Android home screen is long-pressed (app shortcuts).
 * Needs no library. It writes res/xml/shortcuts.xml, the labels and the icons into the generated android project, and points
 * the main activity at the list. Each entry opens a syph:// link, which the app's route app/shortcut/[action].tsx handles.
 *
 * Use it in app.json:
 *   ["./plugins/withAppShortcuts", { "shortcuts": [{ "id": "new_chat", "shortLabel": "New chat", "longLabel": "Find people to chat with",
 *                                                    "icon": "shortcut_new_chat", "url": "syph://shortcut/new-chat" }] }]
 * "icon" is a vector drawable in assets/shortcuts/<icon>.xml. Changing anything here needs a new APK.
 */

const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const { buildShortcutsXml, buildStringsXml, normalizeShortcuts } = require('./appShortcutsXml');

const ICON_DIR = path.join(__dirname, '..', 'assets', 'shortcuts');
const META_NAME = 'android.app.shortcuts';

/** Points one launcher entry (the main activity or an alias of it) at the shortcut list, once. */
function addMetaData(entry) {
  const metaData = entry['meta-data'] ?? (entry['meta-data'] = []);
  if (!metaData.some((item) => item.$?.['android:name'] === META_NAME)) {
    metaData.push({ $: { 'android:name': META_NAME, 'android:resource': '@xml/shortcuts' } });
  }
}

/**
 * Android reads the shortcut list from whichever launcher entry is on the home screen. SYPH has alternate app icons, each an
 * <activity-alias> of the main activity (added by expo-alternate-app-icons), and an alias does not inherit the main
 * activity's list. So every alias gets it too, otherwise the menu would vanish as soon as someone picks another icon.
 * Expo runs the plugins' manifest changes last-listed first, so this plugin must be listed BEFORE the icons plugin in app.json
 * for it to see the aliases (a test checks the order).
 */
function withShortcutsMetaData(config) {
  return withAndroidManifest(config, (mod) => {
    addMetaData(AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults));
    for (const application of mod.modResults.manifest.application ?? []) {
      for (const alias of application['activity-alias'] ?? []) addMetaData(alias);
    }
    return mod;
  });
}

function withShortcutFiles(config, shortcuts) {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const packageName = mod.android?.package;
      if (!packageName) throw new Error('withAppShortcuts: android.package is missing in app.json');
      const res = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const dir of ['xml', 'values', 'drawable']) fs.mkdirSync(path.join(res, dir), { recursive: true });

      fs.writeFileSync(path.join(res, 'xml', 'shortcuts.xml'), buildShortcutsXml(shortcuts, packageName));
      fs.writeFileSync(path.join(res, 'values', 'syph_shortcuts.xml'), buildStringsXml(shortcuts));
      for (const icon of new Set(shortcuts.map((s) => s.icon))) {
        const source = path.join(ICON_DIR, `${icon}.xml`);
        if (!fs.existsSync(source)) throw new Error(`withAppShortcuts: assets/shortcuts/${icon}.xml does not exist`);
        fs.copyFileSync(source, path.join(res, 'drawable', `${icon}.xml`));
      }
      return mod;
    },
  ]);
}

module.exports = function withAppShortcuts(config, options = {}) {
  const shortcuts = normalizeShortcuts(options.shortcuts);
  config = withShortcutsMetaData(config);
  return withShortcutFiles(config, shortcuts);
};
