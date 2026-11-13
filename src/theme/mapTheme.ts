/**
 * mapTheme.ts
 * The colours of the pirate-map web version. The web screens (the `*.web.tsx` files) read them with `useTheme()`, the same
 * call the phone screens make on hooks/themeContext.tsx, but nothing is chosen, stored or synced here: the palette is one
 * constant object, so it is safe in dependency lists. The phone keeps its own themes; the two never share a palette
 * (docs/PARCHMENT.md).
 */

import { ThemeColors, vintage } from './colors';

export type { ThemeColors } from './colors';

const theme = { themeColors: vintage } as const;

export const useTheme = (): { readonly themeColors: ThemeColors } => theme;
