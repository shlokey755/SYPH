import { Platform } from 'react-native';

type WebViewModule = typeof import('react-native-webview');

/** Loaded on demand: the web build has no WebView, and a build without the native module should not crash. */
export function loadWebView(): WebViewModule['WebView'] | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('react-native-webview') as WebViewModule).WebView;
  } catch {
    return null;
  }
}
