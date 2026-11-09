/**
 * GifPicker.tsx
 * GIF search backed by the Giphy API. Needs EXPO_PUBLIC_GIPHY_API_KEY (see API.md);
 * without a key the picker explains what is missing instead of failing silently.
 *
 * It opens with trending already on screen: the chat screen loads it and downloads the first pictures ahead of time
 * (services/gifService.ts warmGifs), and results of every search are remembered for ten minutes. A search that is
 * remembered shows at once (and is refreshed quietly if it is old); only a new one waits for the network. Each cell shows a
 * tiny still of the GIF's first frame while the animation downloads.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';
import { hasGiphyKey, loadGifs, peekGifs } from '../../services/gifService';
import { Gif } from '../../utils/gifs';

interface Props {
  visible: boolean;
  colors: ThemeColors;
  onPick: (url: string, width: number, height: number) => void;
  onClose: () => void;
}

export function GifPicker({ visible, colors, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>(() => peekGifs('')?.gifs ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whatever is remembered for this search shows straight away. If it is missing or old, it is fetched (new searches wait
  // 0.4 s after the last key press); an old result stays on screen until the new one arrives, and a failed refresh of it is
  // not worth an error message.
  useEffect(() => {
    if (!visible || !hasGiphyKey) return;
    const term = query.trim();
    const remembered = peekGifs(term);
    if (remembered) {
      setGifs(remembered.gifs);
      setError(null);
      setLoading(false);
      if (remembered.fresh) return;
    }

    let cancelled = false;
    const timer = setTimeout(
      async () => {
        if (!remembered) {
          setLoading(true);
          setError(null);
        }
        try {
          const list = await loadGifs(term);
          if (cancelled) return;
          setGifs(list);
          setError(null);
        } catch (e) {
          if (!cancelled && !remembered) setError(e instanceof Error ? e.message : 'Could not load GIFs');
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      remembered || !term ? 0 : 400
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, query]);

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
            editable={hasGiphyKey}
          />
        </View>

        {!hasGiphyKey ? (
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
            initialNumToRender={5}
            maxToRenderPerBatch={4}
            windowSize={5}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={[styles.hint, { color: colors.subText }]}>No GIFs found</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.cell} onPress={() => onPick(item.url, item.width, item.height)}>
                <Image
                  source={{ uri: item.url }}
                  placeholder={item.still ? { uri: item.still } : undefined}
                  placeholderContentFit="cover"
                  recyclingKey={item.id}
                  cachePolicy="memory-disk"
                  transition={120}
                  style={{
                    width: '100%',
                    aspectRatio: item.width / item.height || 1,
                    borderRadius: 8,
                    backgroundColor: colors.cardBackground,
                  }}
                  contentFit="cover"
                />
              </Pressable>
            )}
          />
        )}
        {hasGiphyKey ? <Text style={[styles.credit, { color: colors.subText }]}>Powered by GIPHY</Text> : null}
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
