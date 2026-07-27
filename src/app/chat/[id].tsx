/**
 * app/chat/[id].tsx
 * Active Chat Screen - Real-time messages for individual & group chats
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import { useTheme } from '../../hooks/themeContext';
import { useAuth } from '../../hooks/useAuth';
// Import your custom messaging hooks/services here
// e.g., import { useMessages } from '../../hooks/useMessages';

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { themeColors } = useTheme();
  const { currentUser } = useAuth();

  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<any[]>([]); // Replace 'any' with your Message type
  const [loading, setLoading] = useState(false);

  // 1. Fetch / Subscribe to real-time messages for conversationId
  useEffect(() => {
    if (!conversationId) return;

    // TODO: Hook up your Firestore / Firebase real-time listener here
    // Example:
    // const unsubscribe = subscribeToMessages(conversationId, (newMessages) => {
    //   setMessages(newMessages);
    // });
    // return () => unsubscribe();
  }, [conversationId]);

  // 2. Send Message Handler
  const handleSendMessage = async () => {
    if (!messageText.trim() || !currentUser) return;

    const textToSend = messageText.trim();
    setMessageText('');

    try {
      // TODO: Call your send message function/hook
      // await sendMessage(conversationId, currentUser.uid, textToSend);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  // 3. Render Message Bubble
  const renderMessageItem = ({ item }: { item: any }) => {
    const isMe = item.senderId === currentUser?.uid;

    return (
      <View
        style={[
          styles.messageBubble,
          isMe
            ? [styles.myBubble, { backgroundColor: themeColors.accent }]
            : [styles.theirBubble, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }],
        ]}
      >
        <Text
          style={[
            styles.messageText,
            { color: isMe ? themeColors.buttonText : themeColors.text },
          ]}
        >
          {item.text}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Top Navigation Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
            Chat Room
          </Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.subText }]}>
            ID: {conversationId?.substring(0, 8)}...
          </Text>
        </View>
      </View>

      {/* Message List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.messageList}
          inverted // Keeps recent messages scrolled to the bottom
        />
      )}

      {/* Input Bar */}
      <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.cardBackground }]}>
        <TextInput
          style={[
            styles.textInput,
            { backgroundColor: themeColors.inputBg, color: themeColors.text, borderColor: themeColors.border },
          ]}
          placeholder="Type a message..."
          placeholderTextColor={themeColors.subText}
          value={messageText}
          onChangeText={setMessageText}
          multiline
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: themeColors.accent },
            !messageText.trim() && { opacity: 0.5 },
          ]}
          onPress={handleSendMessage}
          disabled={!messageText.trim()}
        >
          <Ionicons name="send" size={18} color={themeColors.buttonText} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 40 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 15,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
  },
  myBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  theirBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 15,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
    borderWidth: 1,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});