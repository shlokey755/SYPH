/**
 * chat.tsx
 * Chat Tab - Display both 1-on-1 and group conversations
 * Integrated with dynamic ThemeContext & Safe Area Handling
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
import { useConversations } from '../../hooks/useConversations';
import { Conversation, Message } from '../../types';

export default function ChatTab() {
  const { currentUser } = useAuth();
  const { themeColors } = useTheme();
  const insets = useSafeAreaInsets();

  // Force re-fetch trigger by mutating a reload key
  const [reloadKey, setReloadKey] = useState(0);
  const { conversations, isLoading, deleteConversation, sendMessage } =
    useConversations(currentUser?.uid);

  const [deletedConvs, setDeletedConvs] = useState<Set<string>>(new Set());
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showMessages, setShowMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const handleTerminalReload = async () => {
    setRefreshing(true);
    try {
      // Increment reload key to force updates / re-triggers
      setReloadKey((prev) => prev + 1);
      // Small artificial delay to let the loading indicator spin smoothly
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Failed to reload conversation data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading && !refreshing && reloadKey === -999) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  const activeConversations = conversations.filter(
    (c) => !c.isDeleted && !deletedConvs.has(c.id)
  );

  const handleDeleteConversation = (convId: string) => {
    Alert.alert(
      'Delete Conversation',
      'This conversation will be deleted. You can add this user again later.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteConversation(convId);
            setDeletedConvs((prev) => new Set([...prev, convId]));
            setShowMessages(false);
          },
        },
      ]
    );
  };

  const getConversationTitle = (conv: Conversation): string => {
    if (conv.isGroup && conv.groupName) {
      return conv.groupName;
    }

    if (conv.isGroup && conv.participants) {
      return `Group (${conv.participants.length})`;
    }

    if (conv.participant1?.uid === currentUser?.uid) {
      return conv.participant2?.username || 'Chat';
    }
    return conv.participant1?.username || 'Chat';
  };

  const getConversationAvatars = (conv: Conversation) => {
    if (conv.isGroup && conv.participants) {
      return conv.participants.slice(0, 2);
    }

    const otherUser =
      conv.participant1?.uid === currentUser?.uid ? conv.participant2 : conv.participant1;

    return otherUser ? [otherUser] : [];
  };

  const handleCardPress = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setShowMessages(true);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedConversation) return;

    try {
      const receiverId = selectedConversation.isGroup
        ? undefined
        : selectedConversation.participant1?.uid === currentUser?.uid
        ? selectedConversation.participant2?.uid
        : selectedConversation.participant1?.uid;

      await sendMessage(
        selectedConversation.id,
        messageText,
        currentUser?.uid || '',
        currentUser?.username || '',
        receiverId
      );
      setMessageText('');
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const renderConversationCard = ({ item }: { item: Conversation }) => {
    const avatars = getConversationAvatars(item);
    const title = getConversationTitle(item);

    return (
      <TouchableOpacity
        style={[
          styles.conversationCard,
          {
            backgroundColor: themeColors.cardBackground,
            borderColor: themeColors.border,
          },
        ]}
        onPress={() => handleCardPress(item)}
      >
        <View style={styles.avatarSection}>
          {item.isGroup && item.participants && item.participants.length > 1 ? (
            <View style={styles.multiAvatarContainer}>
              {item.participants.slice(0, 2).map((participant, index) => {
                const initial = participant?.username?.[0]?.toUpperCase() || '?';
                return (
                  <View
                    key={index}
                    style={[
                      styles.avatarPlaceholder,
                      { backgroundColor: themeColors.accent },
                      index > 0 && styles.overlappingAvatar,
                    ]}
                  >
                    <Text style={[styles.avatarText, { color: themeColors.buttonText }]}>
                      {initial}
                    </Text>
                  </View>
                );
              })}
              {item.participants && item.participants.length > 2 && (
                <View
                  style={[
                    styles.avatarPlaceholder,
                    styles.overlappingAvatar,
                    styles.countBadge,
                  ]}
                >
                  <Text style={styles.countText}>+{item.participants.length - 2}</Text>
                </View>
              )}
            </View>
          ) : (
            <>
              {avatars[0]?.profileImageUrl ? (
                <Image source={{ uri: avatars[0].profileImageUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: themeColors.accent }]}>
                  <Text style={[styles.avatarText, { color: themeColors.buttonText }]}>
                    {avatars[0]?.username?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.conversationInfo}>
          <View style={styles.titleContainer}>
            <Text style={[styles.username, { color: themeColors.text }]}>{title}</Text>
            {item.isGroup && <Ionicons name="people" size={14} color={themeColors.accent} />}
          </View>
          <Text style={[styles.lastMessage, { color: themeColors.subText }]} numberOfLines={1}>
            {item.lastMessage || 'No messages yet'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteConversation(item.id)}
        >
          <Ionicons name="trash-outline" size={20} color="#CF6679" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Messages</Text>
        <TouchableOpacity
          style={[
            styles.refreshButton,
            { backgroundColor: themeColors.accent, borderColor: themeColors.border },
          ]}
          onPress={handleTerminalReload}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={themeColors.buttonText} />
          ) : (
            <Ionicons name="refresh" size={20} color={themeColors.buttonText} />
          )}
        </TouchableOpacity>
      </View>

      {activeConversations.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={48} color={themeColors.subText} />
          <Text style={[styles.emptyText, { color: themeColors.subText }]}>No conversations yet</Text>
          <Text style={[styles.emptySubtext, { color: themeColors.subText }]}>
            Go to Add tab to start chatting
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeConversations}
          renderItem={renderConversationCard}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleTerminalReload}
              tintColor={themeColors.accent}
            />
          }
        />
      )}

      {/* Messages Modal */}
      {selectedConversation && (
        <Modal
          visible={showMessages}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowMessages(false)}
        >
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <TouchableOpacity onPress={() => setShowMessages(false)}>
                <Ionicons name="chevron-back" size={28} color={themeColors.text} />
              </TouchableOpacity>
              <View style={styles.headerTitleContainer}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  {getConversationTitle(selectedConversation)}
                </Text>
                {selectedConversation.isGroup && (
                  <Text style={[styles.participantCount, { color: themeColors.subText }]}>
                    {selectedConversation.participants?.length} members
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => handleDeleteConversation(selectedConversation.id)}>
                <Ionicons name="trash-outline" size={20} color="#CF6679" />
              </TouchableOpacity>
            </View>

            {/* Keyboard-avoiding wrapper for Modal */}
            <KeyboardAvoidingView
              style={styles.keyboardView}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            >
              {/* Messages View */}
              <ConversationMessages
                conversationId={selectedConversation.id}
                currentUserId={currentUser?.uid}
              />

              {/* Message Input Container */}
              <MessageInputContainer
                messageText={messageText}
                onChangeText={setMessageText}
                onSend={handleSendMessage}
              />
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}

// Separate component for message input with safe area handling and dynamic theme
function MessageInputContainer({
  messageText,
  onChangeText,
  onSend,
}: {
  messageText: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { themeColors } = useTheme();

  return (
    <View
      style={[
        styles.inputContainer,
        {
          backgroundColor: themeColors.cardBackground,
          borderTopColor: themeColors.border,
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: themeColors.inputBg,
            color: themeColors.text,
          },
        ]}
        placeholder="Type a message..."
        placeholderTextColor={themeColors.subText}
        value={messageText}
        onChangeText={onChangeText}
        multiline
      />
      <TouchableOpacity
        style={[styles.sendButton, { backgroundColor: themeColors.accent }]}
        onPress={onSend}
      >
        <Ionicons name="send" size={20} color={themeColors.buttonText} />
      </TouchableOpacity>
    </View>
  );
}

// Component to display messages in a conversation with dynamic theme
function ConversationMessages({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId?: string;
}) {
  const { themeColors } = useTheme();
  const { getConversationMessages } = useConversations(currentUserId);
  const { messages, messagesLoading } = getConversationMessages(conversationId);

  if (messagesLoading) {
    return (
      <View style={styles.messagesContainer}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  const renderMessageItem = ({ item: msg }: { item: Message }) => {
    const isSent = msg.senderId === currentUserId;
    const timeFormatted = msg.createdAt?.toDate
      ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <View
        style={[
          styles.messageBubble,
          isSent
            ? [styles.sentMessage, { backgroundColor: themeColors.accent }]
            : [styles.receivedMessage, { backgroundColor: themeColors.cardBackground }],
        ]}
      >
        {!isSent && (
          <Text style={[styles.senderName, { color: themeColors.subText }]}>
            {msg.senderUsername}
          </Text>
        )}
        <Text
          style={[
            styles.messageText,
            { color: isSent ? themeColors.buttonText : themeColors.text },
          ]}
        >
          {msg.text}
        </Text>
        {timeFormatted ? (
          <Text
            style={[
              styles.messageTime,
              { color: isSent ? themeColors.buttonText : themeColors.subText, opacity: 0.8 },
            ]}
          >
            {timeFormatted}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.messagesContainer}>
      {messages.length === 0 ? (
        <View style={styles.noMessagesContainer}>
          <Text style={[styles.noMessagesText, { color: themeColors.subText }]}>
            No messages yet. Start the conversation!
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...messages].reverse()}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={{ paddingVertical: 10 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  avatarSection: {
    marginRight: 12,
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  multiAvatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 70,
    height: 50,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlappingAvatar: {
    marginLeft: -20,
  },
  countBadge: {
    backgroundColor: '#666',
  },
  avatarText: {
    fontWeight: 'bold',
    fontSize: 20,
  },
  countText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  conversationInfo: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    flex: 1,
  },
  lastMessage: {
    fontSize: 13,
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 6,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  participantCount: {
    fontSize: 12,
    marginTop: 2,
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 15,
  },
  noMessagesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noMessagesText: {
    fontSize: 14,
  },
  messageBubble: {
    maxWidth: '80%',
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
  },
  sentMessage: {
    alignSelf: 'flex-end',
  },
  receivedMessage: {
    alignSelf: 'flex-start',
  },
  senderName: {
    fontSize: 11,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    maxHeight: 100,
  },
  sendButton: {
    borderRadius: 50,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});