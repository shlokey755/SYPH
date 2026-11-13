// app/(tabs)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PushNotificationsBridge } from '../../components/PushNotificationsBridge';
import { ART, useDesktopLayout } from '../../components/parchment';
import { useTheme } from '../../theme/mapTheme';
import { useConversations } from '../../hooks/useConversations';
import { FONT, mixColors } from '../../theme/parchment';

/** The bar is a strip of ship's planking with a brass rail along its top edge. */
function TabBarBackdrop() {
  const { themeColors } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: themeColors.wood }]}>
      <Image source={ART.wood} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View style={[styles.rail, { backgroundColor: themeColors.brass }]} />
      <View style={styles.railLight} />
    </View>
  );
}

/** A tab's icon. The open tab sits on a gold medallion, like a compass point. */
function TabGlyph({
  name,
  focused,
  color,
  size,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
  size: number;
}) {
  const { themeColors } = useTheme();
  return (
    <View
      style={[
        styles.glyph,
        focused && {
          backgroundColor: themeColors.gilt,
          borderColor: mixColors(themeColors.brass, '#000000', 0.5),
          borderWidth: 1.5,
        },
      ]}
    >
      <Ionicons name={name} size={size} color={focused ? themeColors.ink : color} />
    </View>
  );
}

export default function TabsLayout() {
  const { themeColors } = useTheme();
  const { unreadTotal } = useConversations();
  const insets = useSafeAreaInsets();
  // On a desktop window the rail (components/desktop) does the job of the tab bar.
  const { desktop } = useDesktopLayout();

  return (
    <>
    <PushNotificationsBridge />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarBackground: () => <TabBarBackdrop />,
        tabBarStyle: desktop ? { display: 'none' } : {
          backgroundColor: themeColors.wood,
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: themeColors.shadow,
          shadowOpacity: 0.35,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -3 },
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 9,
        },
        tabBarActiveTintColor: themeColors.gilt,
        tabBarInactiveTintColor: mixColors(themeColors.buttonText, themeColors.wood, 0.3),
        tabBarLabelStyle: {
          fontFamily: FONT.label,
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        },
      }}
    >
      {/* 1. Main Chat Screen (index.tsx) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarBadge: unreadTotal > 0 ? (unreadTotal > 99 ? '99+' : unreadTotal) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: themeColors.stamp,
            color: themeColors.buttonText,
            fontFamily: FONT.label,
            fontSize: 10,
          },
          tabBarIcon: ({ color, size, focused }) => (
            <TabGlyph name="chatbubbles" focused={focused} size={size} color={color} />
          ),
        }}
      />

      {/* 2. Profile Screen (me.tsx) */}
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, size, focused }) => (
            <TabGlyph name="person" focused={focused} size={size} color={color} />
          ),
        }}
      />

      {/* 3. Add Friends & Groups Screen (add.tsx) */}
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ color, size, focused }) => (
            <TabGlyph name="add-circle" focused={focused} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  rail: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  railLight: { position: 'absolute', top: 3, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255, 230, 180, 0.35)' },
  glyph: { width: 40, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
