/**

 * add.tsx

 * Add Tab - Search for users and add individually or in groups with dynamic theme support

 */



import { Ionicons } from '@expo/vector-icons';

import { useRouter } from 'expo-router';

import { useState } from 'react';

import {
  ActivityIndicator,

  Alert,

  FlatList,

  Image,

  Modal,

  StyleSheet,

  Text,

  TextInput,

  TouchableOpacity,

  View,
} from 'react-native';

import { useTheme } from '../../hooks/themeContext';

import { useAuth } from '../../hooks/useAuth';

import { useConversations } from '../../hooks/useConversations';

import { SearchResult, useUserSearch } from '../../hooks/useUserSearch';



export default function AddTab() {

  const { currentUser } = useAuth();

  const { themeColors } = useTheme();

  const router = useRouter();

  const { results, isSearching, searchUsers, clearSearch } = useUserSearch();

  const { getOrCreateConversation, createGroupConversation } = useConversations(currentUser?.uid);

  const [searchTerm, setSearchTerm] = useState('');

  const [isAddingUser, setIsAddingUser] = useState<string | null>(null);

  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const [showGroupNameModal, setShowGroupNameModal] = useState(false);

  const [groupName, setGroupName] = useState('');



  const handleSearch = (text: string) => {

    setSearchTerm(text);

    if (text.trim()) {

      searchUsers(text.trim(), currentUser?.uid || '');

    } else {

      clearSearch();

    }

  };



  const toggleUserSelection = (userId: string) => {

    const newSelected = new Set(selectedUsers);

    if (newSelected.has(userId)) {

      newSelected.delete(userId);

    } else {

      newSelected.add(userId);

    }

    setSelectedUsers(newSelected);

  };



  const handleAddSingleUser = async (user: SearchResult) => {

    if (!currentUser?.uid) {

      Alert.alert('Error', 'User authentication error');

      return;

    }



    setIsAddingUser(user.uid);



    try {

      const conversationId = await getOrCreateConversation(

        currentUser.uid,

        user.uid,

        user.username,

        user.profileImageUrl,

        currentUser?.username

      );



      if (conversationId) {

        setSearchTerm('');

        clearSearch();

        router.push({

          pathname: '/chat/[id]',

          params: { id: conversationId },

        });

      } else {

        Alert.alert('Error', 'Could not start conversation');

      }

    } catch (error: any) {

      console.error('Failed to start chat:', error);

      Alert.alert('Error', error?.message || 'Failed to add user');

    } finally {

      setIsAddingUser(null);

    }

  };



  const handleCreateGroupChat = async () => {

    if (selectedUsers.size === 0) {

      Alert.alert('Error', 'Select at least one user');

      return;

    }



    if (selectedUsers.size === 1) {

      Alert.alert('Info', 'Select at least 2 users for a group chat');

      return;

    }



    const selectedUserData = results.filter((r) => selectedUsers.has(r.uid));



    try {

      const groupChatId = await createGroupConversation(

        currentUser?.uid || '',

        selectedUserData,

        currentUser?.username || 'Anonymous',

        groupName || undefined

      );



      if (groupChatId) {

        setSelectedUsers(new Set());

        setGroupName('');

        setSearchTerm('');

        clearSearch();



        router.push({

          pathname: '/chat/[id]',

          params: { id: groupChatId },

        });

      } else {

        Alert.alert('Error', 'Failed to create group');

      }

    } catch (error: any) {

      console.error('Group chat creation error:', error);

      Alert.alert('Error', error?.message || 'Failed to create group chat');

    }

  };



  const renderUserCard = ({ item }: { item: SearchResult }) => {

    const initial = item.username?.[0]?.toUpperCase() || '?';

    const isLoading = isAddingUser === item.uid;

    const isSelected = selectedUsers.has(item.uid);



    return (

      <View

        style={[

          styles.userCard,

          {

            backgroundColor: themeColors.cardBackground,

            borderColor: themeColors.border,

          },

        ]}

      >

        <TouchableOpacity

          style={styles.userInfo}

          onPress={() => {

            if (selectedUsers.size > 0) {

              toggleUserSelection(item.uid);

            }

          }}

          onLongPress={() => toggleUserSelection(item.uid)}

          delayLongPress={200}

        >

          {item.profileImageUrl ? (

            <Image source={{ uri: item.profileImageUrl }} style={styles.avatar} />

          ) : (

            <View style={[styles.avatarPlaceholder, { backgroundColor: themeColors.accent }]}>

              <Text style={[styles.avatarText, { color: themeColors.buttonText }]}>{initial}</Text>

            </View>

          )}



          <View style={styles.userDetails}>

            <Text style={[styles.username, { color: themeColors.text }]}>{item.username}</Text>

            <Text style={[styles.userId, { color: themeColors.subText }]}>

              User ID: {item.uid.substring(0, 8)}...

            </Text>

          </View>

        </TouchableOpacity>



        {selectedUsers.size === 0 ? (

          <TouchableOpacity

            style={[

              styles.addButton,

              { backgroundColor: themeColors.accent },

              isLoading && { opacity: 0.6 },

            ]}

            onPress={() => handleAddSingleUser(item)}

            disabled={isLoading}

          >

            {isLoading ? (

              <ActivityIndicator size="small" color={themeColors.buttonText} />

            ) : (

              <Ionicons name="add" size={24} color={themeColors.buttonText} />

            )}

          </TouchableOpacity>

        ) : (

          <TouchableOpacity

            style={[

              styles.addButton,

              isSelected

                ? [styles.selectedButton, { borderColor: themeColors.accent }]

                : { backgroundColor: 'transparent' },

            ]}

            onPress={() => toggleUserSelection(item.uid)}

          >

            <Ionicons

              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}

              size={24}

              color={isSelected ? themeColors.accent : themeColors.subText}

            />

          </TouchableOpacity>

        )}

      </View>

    );

  };



  const hasSelection = selectedUsers.size > 0;



  return (

    <View style={[styles.container, { backgroundColor: themeColors.background }]}>

      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>

        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Add Friends</Text>

        {hasSelection && (

          <Text

            style={[

              styles.selectionCount,

              { backgroundColor: themeColors.accent, color: themeColors.buttonText },

            ]}

          >

            {selectedUsers.size} selected

          </Text>

        )}

      </View>



      {/* Search Bar */}

      <View

        style={[

          styles.searchContainer,

          {

            backgroundColor: themeColors.cardBackground,

            borderColor: themeColors.border,

          },

        ]}

      >

        <Ionicons name="search" size={20} color={themeColors.subText} style={styles.searchIcon} />

        <TextInput

          style={[styles.searchInput, { color: themeColors.text }]}

          placeholder="Search username..."

          placeholderTextColor={themeColors.subText}

          value={searchTerm}

          onChangeText={handleSearch}

          autoCapitalize="none"

        />

        {searchTerm ? (

          <TouchableOpacity

            onPress={() => {

              setSearchTerm('');

              clearSearch();

            }}

          >

            <Ionicons name="close" size={20} color={themeColors.subText} />

          </TouchableOpacity>

        ) : null}

      </View>



      {/* Results */}

      {isSearching ? (

        <View style={styles.loadingContainer}>

          <ActivityIndicator size="large" color={themeColors.accent} />

        </View>

      ) : results.length > 0 ? (

        <FlatList

          data={results}

          renderItem={renderUserCard}

          keyExtractor={(item) => item.uid}

          style={styles.resultsList}

          contentContainerStyle={styles.resultsContent}

        />

      ) : searchTerm ? (

        <View style={styles.emptyState}>

          <Ionicons name="search-outline" size={48} color={themeColors.subText} />

          <Text style={[styles.emptyText, { color: themeColors.subText }]}>No users found</Text>

          <Text style={[styles.emptySubtext, { color: themeColors.subText }]}>

            Try searching for a different username

          </Text>

        </View>

      ) : (

        <View style={styles.emptyState}>

          <Ionicons name="people-outline" size={48} color={themeColors.subText} />

          <Text style={[styles.emptyText, { color: themeColors.subText }]}>Search for users</Text>

          <Text style={[styles.emptySubtext, { color: themeColors.subText }]}>

            Type a username to find and add friends

          </Text>

        </View>

      )}



      {/* Group Chat Button */}

      {hasSelection && selectedUsers.size >= 2 && (

        <View

          style={[

            styles.groupChatButtonContainer,

            {

              backgroundColor: themeColors.cardBackground,

              borderTopColor: themeColors.border,

            },

          ]}

        >

          <TouchableOpacity

            style={[styles.groupChatButton, { backgroundColor: themeColors.accent }]}

            onPress={() => setShowGroupNameModal(true)}

          >

            <Ionicons name="people" size={20} color={themeColors.buttonText} />

            <Text style={[styles.groupChatButtonText, { color: themeColors.buttonText }]}>

              Create Group Chat ({selectedUsers.size})

            </Text>

          </TouchableOpacity>

        </View>

      )}



      {/* Group Name Modal */}

      <Modal

        visible={showGroupNameModal}

        animationType="slide"

        transparent={true}

        onRequestClose={() => setShowGroupNameModal(false)}

      >

        <View style={styles.modalOverlay}>

          <View

            style={[

              styles.modalContent,

              { backgroundColor: themeColors.cardBackground },

            ]}

          >

            <Text style={[styles.modalTitle, { color: themeColors.text }]}>

              Group Chat Name (Optional)

            </Text>

            <TextInput

              style={[

                styles.modalInput,

                {

                  backgroundColor: themeColors.inputBg,

                  color: themeColors.text,

                  borderColor: themeColors.border,

                },

              ]}

              placeholder="Enter group name or leave blank"

              placeholderTextColor={themeColors.subText}

              value={groupName}

              onChangeText={setGroupName}

            />

            <View style={styles.modalButtonsContainer}>

              <TouchableOpacity

                style={[styles.modalCancelButton, { backgroundColor: themeColors.inputBg }]}

                onPress={() => setShowGroupNameModal(false)}

              >

                <Text style={[styles.modalCancelButtonText, { color: themeColors.subText }]}>

                  Cancel

                </Text>

              </TouchableOpacity>

              <TouchableOpacity

                style={[styles.modalCreateButton, { backgroundColor: themeColors.accent }]}

                onPress={() => {

                  setShowGroupNameModal(false);

                  handleCreateGroupChat();

                }}

              >

                <Text style={[styles.modalCreateButtonText, { color: themeColors.buttonText }]}>

                  Create

                </Text>

              </TouchableOpacity>

            </View>

          </View>

        </View>

      </Modal>

    </View>

  );

}



const styles = StyleSheet.create({

  container: {

    flex: 1,

    paddingTop: 50,

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

  selectionCount: {

    paddingHorizontal: 12,

    paddingVertical: 6,

    borderRadius: 20,

    fontWeight: '600',

    fontSize: 12,

  },

  searchContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    borderRadius: 10,

    marginHorizontal: 15,

    marginVertical: 15,

    paddingHorizontal: 12,

    borderWidth: 1,

  },

  searchIcon: {

    marginRight: 10,

  },

  searchInput: {

    flex: 1,

    fontSize: 16,

    paddingVertical: 12,

  },

  loadingContainer: {

    flex: 1,

    justifyContent: 'center',

    alignItems: 'center',

  },

  resultsList: {

    flex: 1,

  },

  resultsContent: {

    paddingHorizontal: 10,

    paddingVertical: 10,

  },

  userCard: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    borderRadius: 12,

    padding: 12,

    marginBottom: 10,

    borderWidth: 1,

  },

  userInfo: {

    flexDirection: 'row',

    alignItems: 'center',

    flex: 1,

  },

  avatar: {

    width: 50,

    height: 50,

    borderRadius: 25,

    marginRight: 12,

  },

  avatarPlaceholder: {

    width: 50,

    height: 50,

    borderRadius: 25,

    justifyContent: 'center',

    alignItems: 'center',

    marginRight: 12,

  },

  avatarText: {

    fontWeight: 'bold',

    fontSize: 20,

  },

  userDetails: {

    flex: 1,

  },

  username: {

    fontSize: 16,

    fontWeight: '600',

    marginBottom: 4,

  },

  userId: {

    fontSize: 12,

  },

  addButton: {

    borderRadius: 50,

    width: 40,

    height: 40,

    justifyContent: 'center',

    alignItems: 'center',

  },

  selectedButton: {

    backgroundColor: 'transparent',

    borderWidth: 2,

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

  groupChatButtonContainer: {

    paddingHorizontal: 15,

    paddingVertical: 12,

    borderTopWidth: 1,

  },

  groupChatButton: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    padding: 14,

    borderRadius: 10,

    gap: 8,

  },

  groupChatButtonText: {

    fontWeight: 'bold',

    fontSize: 16,

  },

  modalOverlay: {

    flex: 1,

    backgroundColor: 'rgba(0, 0, 0, 0.7)',

    justifyContent: 'center',

    alignItems: 'center',

  },

  modalContent: {

    borderRadius: 15,

    padding: 20,

    width: '80%',

  },

  modalTitle: {

    fontSize: 18,

    fontWeight: 'bold',

    marginBottom: 15,

  },

  modalInput: {

    padding: 12,

    borderRadius: 10,

    marginBottom: 15,

    fontSize: 14,

    borderWidth: 1,

  },

  modalButtonsContainer: {

    flexDirection: 'row',

    gap: 10,

  },

  modalCancelButton: {

    flex: 1,

    padding: 12,

    borderRadius: 10,

    alignItems: 'center',

  },

  modalCancelButtonText: {

    fontWeight: '600',

  },

  modalCreateButton: {

    flex: 1,

    padding: 12,

    borderRadius: 10,

    alignItems: 'center',

  },

  modalCreateButtonText: {

    fontWeight: 'bold',

  },

});

