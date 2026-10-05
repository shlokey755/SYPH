import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';
import { Conversation } from '../../types';
import { getConversationTitle } from '../../utils/conversation';

interface Props {
  visible: boolean;
  conversations: Conversation[];
  myUid: string | undefined;
  colors: ThemeColors;
  onPick: (conversation: Conversation) => void;
  onClose: () => void;
}

export function ForwardPicker({ visible, conversations, myUid, colors, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Forward to...</Text>
        </View>

        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.subText }]}>No other chats to forward to.</Text>
          }
          renderItem={({ item }) => {
            const title = getConversationTitle(item, myUid);
            return (
              <Pressable
                onPress={() => onPick(item)}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: colors.border },
                  pressed && { backgroundColor: colors.cardBackground },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.avatarText, { color: colors.buttonText }]}>
                    {title[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {title}
                </Text>
                {item.isGroup && <Ionicons name="people" size={16} color={colors.subText} />}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700', fontSize: 16 },
  name: { flex: 1, fontSize: 16 },
  empty: { textAlign: 'center', marginTop: 40 },
});
