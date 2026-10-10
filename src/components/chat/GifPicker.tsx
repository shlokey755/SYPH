/**
 * GifPicker.tsx
 * GIF search backed by the Giphy API. Needs EXPO_PUBLIC_GIPHY_API_KEY (see API.md);
 * without a key the picker explains what is missing instead of failing silently.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';

const API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY;

interface Gif {
  id: string;
  url: string;
  width: number;
  height: number;
}

interface Props {
  visible: boolean;
  colors: ThemeColors;
  onPick: (url: string, width: number, height: number) => void;
  onClose: () => void;
}

export function GifPicker({ visible, colors, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    if (!API_KEY) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = term.trim()
        ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(term.trim())}&`
        : 'https://api.giphy.com/v1/gifs/trending?';
      const response = await fetch(`${endpoint}api_key=${API_KEY}&limit=30&rating=pg-13`);
      if (!response.ok) throw new Error(`Giphy returned ${response.status}`);
      const json = await response.json();
      setGifs(
        (json.data ?? []).map((g: any) => ({
          id: g.id,
          url: g.images.fixed_height.url,
          width: Number(g.images.fixed_height.width),
          height: Number(g.images.fixed_height.height),
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load GIFs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Trending on open, then debounced search while typing.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => load(query), query ? 400 : 0);
    return () => clearTimeout(timer);
  }, [visible, query, load]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
            placeholder="Search GIFs"
            placeholderTextColor={colors.subText}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            editable={!!API_KEY}
          />
        </View>

        {!API_KEY ? (
          <View style={styles.center}>
            <Ionicons name="key-outline" size={40} color={colors.subText} />
            <Text style={[styles.message, { color: colors.text }]}>GIF search is not set up</Text>
            <Text style={[styles.hint, { color: colors.subText }]}>
              Add EXPO_PUBLIC_GIPHY_API_KEY to your .env file (see API.md), then restart Expo.
            </Text>
          </View>
        ) : loading && gifs.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.message, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={gifs}
            keyExtractor={(g) => g.id}
            numColumns={2}
            contentContainerStyle={{ padding: 6, paddingBottom: insets.bottom + 12 }}
            ListEmptyComponent={<Text style={[styles.hint, { color: colors.subText }]}>No GIFs found</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.cell} onPress={() => onPick(item.url, item.width, item.height)}>
                <Image
                  source={{ uri: item.url }}
                  style={{ width: '100%', aspectRatio: item.width / item.height || 1, borderRadius: 8 }}
                  contentFit="cover"
                />
              </Pressable>
            )}
          />
        )}
        {API_KEY ? <Text style={[styles.credit, { color: colors.subText }]}>Powered by GIPHY</Text> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  message: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  hint: { fontSize: 13, textAlign: 'center' },
  cell: { flex: 1, padding: 4 },
  credit: { fontSize: 11, textAlign: 'center', paddingBottom: 8 },
});
