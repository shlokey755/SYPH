/**
 * WebFrame.tsx
 * How the app sits in a browser window. On a phone, and in a narrow window, it does nothing: the map fills the screen.
 * In a wide window (see theme/web.ts) the map is a column lying on a dark ship's table, lit from the middle, so the app is not
 * stretched across a desktop monitor. Put it once, around everything, in app/_layout.tsx.
 */

import React from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import { deskLayout } from '../../theme/web';
import { ART } from './art';
import { Tack } from './Pins';
import { IS_WEB } from './platform';

export function WebFrame({ children }: { children?: React.ReactNode }) {
  const { themeColors: c } = useTheme();
  const { width } = useWindowDimensions();
  const { desk, columnWidth } = deskLayout(width);
  if (!IS_WEB || !desk || columnWidth === null) return <>{children}</>;

  return (
    <View style={{ flex: 1, backgroundColor: c.burn }}>
      <Image source={ART.desk} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View
          style={{
            width: columnWidth,
            flex: 1,
            overflow: 'hidden',
            backgroundColor: c.background,
            boxShadow: '0px 0px 70px rgba(0, 0, 0, 0.75), 0px 6px 18px rgba(0, 0, 0, 0.55)',
          }}
        >
          {children}
          <Tack color={c.pins[0]} size={14} style={{ position: 'absolute', top: 8, left: 8 }} />
          <Tack color={c.pins[0]} size={14} style={{ position: 'absolute', top: 8, right: 8 }} />
        </View>
      </View>
    </View>
  );
}
