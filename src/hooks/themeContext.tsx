/**
 * themeContext.tsx
 * The app's colours.
 *
 * SYPH has one look, a pirate's torn map (see theme/colors.ts and docs/PARCHMENT.md), so there is nothing to choose, store or sync any more.
 * This stays a hook so every screen keeps reading its colours the same way (`const { themeColors } = useTheme()`), and the
 * object never changes, so it is safe in dependency lists.
 */

import { ThemeColors, vintage } from '../theme/colors';

export type { ThemeColors } from '../theme/colors';

const theme = { themeColors: vintage } as const;

export const useTheme = (): { readonly themeColors: ThemeColors } => theme;
