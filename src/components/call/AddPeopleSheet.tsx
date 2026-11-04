/**
 * AddPeopleSheet.tsx
 * "Add people" on a running 1-to-1 call: search by username, pick one or more, and start the group call.
 * The call itself is moved by the caller (see utils/callUpgrade.ts for how); this sheet only picks the people and reports
 * back, and stays open with an error if starting the group call fails, so the 1-to-1 call carries on untouched.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { SearchResult, useUserSearch } from '../../hooks/useUserSearch';
import { addableResults, Candidate, limitText, togglePick } from '../../utils/callUpgrade';

const SEARCH_DELAY_MS = 300;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Most people that can still be added. */
  limit: number;
  /** People who must not be offered: the person already on the call. */
  excludeUids: readonly string[];
  /** Starts the group call. Rejects when it could not be started. */
  onConfirm: (people: Candidate[]) => Promise<void>;
}

export function AddPeopleSheet({ visible, onClose, limit, excludeUids, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const { themeColors } = useTheme();
  const { currentUser } = useAuth();
  const { results, isSearching, searchUsers, clearSearch } = useUserSearch();

  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const myUid = currentUser?.uid ?? '';

  // Start fresh each time the sheet opens.
  useEffect(() => {
    if (visible) return;
    setTerm('');
    setPicked([]);
    setBusy(false);
    setError(null);
    clearSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Search a moment after typing stops.
  useEffect(() => {
    if (!visible) return;
    const text = term.trim();
    if (!text) {
      clearSearch();
      return;
    }
    const timer = setTimeout(() => searchUsers(text, myUid), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, visible, myUid]);

  const offered = useMemo<SearchResult[]>(
    () => addableResults(results, [myUid, ...excludeUids]),
    [results, myUid, excludeUids]
  );

  const toggle = useCallback(
    (person: Candidate) => {
      setError(null);
      setPicked((current) => {
        const next = togglePick(current, person, limit);
        if (next.outcome === 'full') setError(limitText(current.length, limit));
        return next.picked;
      });
    },
    [limit]
  );

  const start = useCallback(async () => {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(picked);
    } catch (failure) {
      console.warn('Add people failed:', failure instanceof Error ? failure.message : failure);
      setError('Could not start the group call. Check your connection and try again.');
      setBusy(false);
    }
  }, [picked, busy, onConfirm]);

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: themeColors.background, borderColor: themeColors.border, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: themeColors.text }]}>Add people</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={10} style={styles.closeHit}>
              <Ionicons name="close" size={24} color={themeColors.text} />
            </Pressable>
          </View>
          <Text style={[styles.note, { color: themeColors.subText }]}>
            Adding someone turns this call into a group call. A group chat is made with everyone.
          </Text>

          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Search username"
            placeholderTextColor={themeColors.subText}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}
          />
          <Text style={[styles.limit, { color: themeColors.subText }]}>{limitText(picked.length, limit)}</Text>

          {picked.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {picked.map((person) => (
                <Pressable
                  key={person.uid}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${person.username}`}
                  onPress={() => toggle(person)}
                  disabled={busy}
                  style={[styles.chip, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.accent }]}
                >
                  <Text style={[styles.chipText, { color: themeColors.text }]}>{person.username}</Text>
                  <Ionicons name="close" size={14} color={themeColors.subText} />
                </Pressable>
              ))}
            </ScrollView>
          )}

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {isSearching && <ActivityIndicator color={themeColors.accent} style={styles.spinner} />}
            {!isSearching && term.trim().length > 0 && offered.length === 0 && (
              <Text style={[styles.empty, { color: themeColors.subText }]}>No one found</Text>
            )}
            {offered.map((person) => {
              const isPicked = picked.some((p) => p.uid === person.uid);
              return (
                <Pressable
                  key={person.uid}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isPicked }}
                  onPress={() => toggle({ uid: person.uid, username: person.username })}
                  disabled={busy}
                  style={[styles.row, { borderBottomColor: themeColors.border }]}
                >
                  <View style={[styles.avatar, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
                    <Text style={[styles.initial, { color: themeColors.accent }]}>{person.username.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.names}>
                    <Text style={[styles.username, { color: themeColors.text }]} numberOfLines={1}>
                      {person.displayName ?? person.username}
                    </Text>
                    {person.displayName ? (
                      <Text style={[styles.handle, { color: themeColors.subText }]} numberOfLines={1}>
                        @{person.username}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={isPicked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={isPicked ? themeColors.accent : themeColors.subText}
                  />
                </Pressable>
              );
            })}
          </ScrollView>

          {error && (
            <Text style={[styles.error, { color: themeColors.danger }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: picked.length === 0 || busy }}
            onPress={start}
            disabled={picked.length === 0 || busy}
            style={[styles.go, { backgroundColor: themeColors.accent, opacity: picked.length === 0 || busy ? 0.5 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color={themeColors.buttonText} />
            ) : (
              <Text style={[styles.goText, { color: themeColors.buttonText }]}>
                {picked.length === 0 ? 'Pick someone to add' : `Start group call (${picked.length + 2})`}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '600' },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 13, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 16 },
  limit: { fontSize: 12, marginTop: 6, marginBottom: 8 },
  chips: { gap: 8, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, height: 32 },
  chipText: { fontSize: 14 },
  list: { flexGrow: 0, minHeight: 120 },
  spinner: { marginVertical: 16 },
  empty: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 18, fontWeight: '600' },
  names: { flex: 1 },
  username: { fontSize: 16 },
  handle: { fontSize: 12 },
  error: { fontSize: 13, marginTop: 8 },
  go: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  goText: { fontSize: 16, fontWeight: '600' },
});
