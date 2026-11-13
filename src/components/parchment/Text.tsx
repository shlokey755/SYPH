/**
 * Text.tsx
 * `Text` and `TextInput` in the map's typefaces. Use these instead of the ones from react-native.
 *
 * - `kind="body"` (the default): an old-style serif. Everything that is read, and message text.
 * - `kind="display"`: blackletter lettering for headlines.
 * - `kind="label"`: small capitals for button captions, tags and small labels. Lower-case letters come out as small capitals.
 * - `kind="hand"`: a quill italic, for notes in the margin.
 *
 * Only the body face has bold and italic cuts. For it, `fontWeight: '700'` and `fontStyle: 'italic'` in a style pick the
 * right file; for the others they are ignored (see theme/parchment.ts). If the fonts could not be loaded the system font and
 * the style's own weight are used instead.
 */

import React, { forwardRef } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  TextProps as RNTextProps,
  TextStyle,
} from 'react-native';
import { mapFontsUsable } from '../../theme/fonts';
import { TextKind, resolveFont } from '../../theme/parchment';

export type { TextKind } from '../../theme/parchment';

function fontFor(kind: TextKind, style: StyleProp<TextStyle>): TextStyle | undefined {
  if (!mapFontsUsable()) return undefined;
  const flat = StyleSheet.flatten(style);
  return resolveFont(kind, flat?.fontWeight, flat?.fontStyle);
}

export interface MapTextProps extends RNTextProps {
  kind?: TextKind;
}

export const Text = forwardRef<RNText, MapTextProps>(function Text({ kind = 'body', style, ...rest }, ref) {
  return <RNText ref={ref} style={[style, fontFor(kind, style)]} {...rest} />;
});
/** So `useRef<Text>(null)` keeps working. */
export type Text = RNText;

export interface MapTextInputProps extends RNTextInputProps {
  kind?: TextKind;
}

export const TextInput = forwardRef<RNTextInput, MapTextInputProps>(function TextInput(
  { kind = 'body', style, ...rest },
  ref
) {
  return <RNTextInput ref={ref} style={[style, fontFor(kind, style)]} {...rest} />;
});
/** So `useRef<TextInput>(null)` keeps working. */
export type TextInput = RNTextInput;
