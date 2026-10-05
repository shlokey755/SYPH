/**
 * GroupInfoModal.tsx
 * Group details (FR-04): members, add/remove members (creator), rename, leave.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../hooks/themeContext';
import { useToast } from '../../hooks/toastNotifications';
import { useUserSearch } from '../../hooks/useUserSearch';
import * as chat from '../../services/chatService';
import { Conversation } from '../../types';

interface Props {
  visible: boolean;
  conversation: Conversation | undefined;
  myUid: string | undefined;
  colors: ThemeColors;
  onClose: () => void;
  /** Called after the current user leaves the group. */
  onLeft: () => void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export function GroupInfoModal({ visible, conversation, myUid, colors, onClose, onLeft }: Props) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { results, isSearching, searchUsers, clearSearch } = useUserSearch();
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (!conversation || !conversation.isGroup) return null;

  const isCreator = conversation.createdBy === myUid;
  const members = conversation.participants ?? [];
  const memberIds = new Set(conversation.participantIds);
  const candidates = results.filter((r) => !memberIds.has(r.uid));

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast.error(label, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearch(text);
    if (text.trim()) searchUsers(text.trim(), myUid ?? '');
    else clearSearch();
  };

  const handleRename = () => {
    const next = name.trim();
    if (!next || next === conversation.groupName) return;
    run('Could not rename group', async () => {
      await chat.renameGroup(conversation.id, next);
      setName('');
      toast.success('Group renamed');
    });
  };

  const handleAdd = (user: { uid: string; username: string; profileImageUrl?: string }) =>
    run('Could not add member', async () => {
      await chat.addGroupMembers(conversation.id, [user]);
      setSearch('');
      clearSearch();
      toast.success('Member added', user.username);
    });

  const handleRemove = (uid: string, username: string) =>
    Alert.alert('Remove member', `Remove ${username} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          run('Could not remove member', async () => {
            await chat.removeGroupMember(conversation.id, uid);
            toast.success('Member removed', username);
          }),
      },
    ]);

  const handleLeave = () =>
    Alert.alert('Leave group', 'You will no longer receive messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          run('Could not leave group', async () => {
            if (!myUid) return;
            await chat.removeGroupMember(conversation.id, myUid);
            onClose();
            onLeft();
          }),
      },
    ]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {conversation.groupName ?? 'Group'}
          </Text>
          {busy && <ActivityIndicator color={colors.accent} />}
        </View>

        <FlatList
          data={members}
          keyExtractor={(m) => m.uid}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View>
              {isCreator && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.subText }]}>Group name</Text>
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                      placeholder={conversation.groupName ?? 'New name'}
                      placeholderTextColor={colors.subText}
                      value={name}
                      onChangeText={setName}
                      maxLength={40}
                    />
                    <Pressable
                      onPress={handleRename}
                      disabled={!name.trim() || busy}
                      style={[styles.button, { backgroundColor: colors.accent }, (!name.trim() || busy) && { opacity: 0.4 }]}
                    >
                      <Text style={{ color: colors.buttonText, fontWeight: '700' }}>Save</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {isCreator && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.subText }]}>Add members</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    placeholder="Search username"
                    placeholderTextColor={colors.subText}
                    value={search}
                    onChangeText={handleSearch}
                    autoCapitalize="none"
                  />
                  {isSearching && <ActivityIndicator style={{ marginTop: 8 }} color={colors.accent} />}
                  {candidates.map((u) => (
                    <Pressable
                      key={u.uid}
                      onPress={() => handleAdd(u)}
                      disabled={busy}
                      style={[styles.member, { borderBottomColor: colors.border }]}
                    >
                      <Text style={[styles.memberName, { color: colors.text }]}>{u.username}</Text>
                      <Ionicons name="person-add" size={20} color={colors.accent} />
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={[styles.sectionTitle, styles.membersTitle, { color: colors.subText }]}>
                {members.length} members
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.member, { borderBottomColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Text style={{ color: colors.buttonText, fontWeight: '700' }}>
                  {item.username[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                {item.username}
                {item.uid === myUid ? ' (you)' : ''}
              </Text>
              {item.uid === conversation.createdBy && (
                <Text style={[styles.badge, { color: colors.accent, borderColor: colors.accent }]}>creator</Text>
              )}
              {isCreator && item.uid !== myUid && (
                <Pressable onPress={() => handleRemove(item.uid, item.username)} hitSlop={10} disabled={busy}>
                  <Ionicons name="remove-circle" size={22} color={colors.danger} />
                </Pressable>
              )}
            </View>
          )}
          ListFooterComponent={
            isCreator ? (
              <Text style={[styles.note, { color: colors.subText }]}>
                You created this group, so you can't leave it. Remove members or delete the chat from your list.
              </Text>
            ) : (
              <Pressable onPress={handleLeave} disabled={busy} style={[styles.leave, { borderColor: colors.danger }]}>
                <Ionicons name="exit-outline" size={20} color={colors.danger} />
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Leave group</Text>
              </Pressable>
            )
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderBottomWidth: 1 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  section: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  membersTitle: { paddingHorizontal: 16, paddingTop: 20 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  button: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  memberName: { flex: 1, fontSize: 16 },
  badge: { fontSize: 11, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  note: { fontSize: 13, textAlign: 'center', padding: 20 },
  leave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 20, padding: 14, borderWidth: 1, borderRadius: 12 },
});
