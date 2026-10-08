/**
 * onboarding.ts
 * Remembers on this device that the intro slides have been shown. Failures are treated as "seen" so a broken
 * storage layer can never trap someone in onboarding.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'syph.onboarding.done.v1';

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // Worst case the slides show once more next launch.
  }
}
