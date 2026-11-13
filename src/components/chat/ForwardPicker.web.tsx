import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { IS_WEB, PageTexture, DIALOG_FRAME, Text } from '../parchment';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../theme/mapTheme';
import { useProfiles } from '../../hooks/useProfiles';
import { Conversation } from '../../types';
import { getConversationTitle, getOtherParticipant } from '../../utils/conversation';

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
  const otherUids = useMemo(
    () => conversations.map((c) => getOtherParticipant(c, myUid)?.uid).filter((uid): uid is string => !!uid),
    [conversations, myUid]
  );
  const { nameOf } = useProfiles(otherUids);

  return (
    <Modal visible={visible} animationType="slide" transparent={IS_WEB} onRequestClose={onClose}>
      <>
      {IS_WEB ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(51, 38, 27, 0.55)' }]} />
      ) : null}
      <View
        style={[styles.container, IS_WEB ? DIALOG_FRAME : null, { backgroundColor: colors.background, paddingTop: insets.top }]}
      >
        <PageTexture variant="plain" force />
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
            const title = getConversationTitle(item, myUid, nameOf);
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
    </>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700', fontSize: 16 },
  name: { flex: 1, fontSize: 16 },
  empty: { textAlign: 'center', marginTop: 40 },
});
