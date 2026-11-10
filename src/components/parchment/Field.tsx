/**
 * Field.tsx
 * A text field drawn on the map: a dashed trail around a patch of paper, with what is typed in ink. For forms on a `Paper` panel.
 * The trail turns sea-blue while the field has the cursor. In a browser the page's own focus outline is switched off for it,
 * because the blue trail says the same thing.
 */

import React, { forwardRef, useState } from 'react';
import { StyleProp, TextInput as RNTextInput, View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import { withAlpha } from '../../theme/parchment';
import { IS_WEB } from './platform';
import { MapTextInputProps, TextInput } from './Text';

export interface FieldProps extends MapTextInputProps {
  /** Style of the box around the input (margins, width). */
  boxStyle?: StyleProp<ViewStyle>;
}

export const Field = forwardRef<RNTextInput, FieldProps>(function Field(
  { boxStyle, style, onFocus, onBlur, editable, ...rest },
  ref
) {
  const { themeColors: c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        {
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: focused ? c.accent : c.trail,
          borderRadius: 5,
          backgroundColor: withAlpha(c.paperAlt, 0.45),
          opacity: editable === false ? 0.6 : 1,
        },
        boxStyle,
      ]}
    >
      <TextInput
        ref={ref}
        editable={editable}
        placeholderTextColor={c.inkSoft}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[{ color: c.ink, fontSize: 17, lineHeight: 22, paddingHorizontal: 12, paddingVertical: 11 }, IS_WEB ? { outlineWidth: 0 } : null, style]}
        {...rest}
      />
    </View>
  );
});
