/**

 * add.tsx

 * Add Tab - Search for users and add individually or in groups with dynamic theme support

 */



import { Ionicons } from '@expo/vector-icons';

import { useRouter } from 'expo-router';

import { useState } from 'react';

import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Avatar,
  buttonInk,
  Compass,
  Field,
  Loading,
  MapButton,
  PageTexture,
  RoundButton,
  roundLook,
  Text,
  TextInput,
  TrailLine,
} from '../../components/parchment';

import { useTheme } from '../../hooks/themeContext';

import { useAuth } from '../../hooks/useAuth';

import { useConversations } from '../../hooks/useConversations';

import { SearchResult, useUserSearch } from '../../hooks/useUserSearch';



export default function AddTab() {

  const { currentUser } = useAuth();

  const { themeColors } = useTheme();
  const insets = useSafeAreaInsets();

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

    

    const isLoading = isAddingUser === item.uid;

    const isSelected = selectedUsers.has(item.uid);



    return (

      <View

        style={[

          styles.userCard,

          {

            backgroundColor: themeColors.paper,

            borderColor: themeColors.trail,

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

          <Avatar name={item.username} size={46} seed={item.uid} />



          <View style={styles.userDetails}>

            <Text style={[styles.username, { color: themeColors.text }]}>{item.displayName || item.username}</Text>

            <Text style={[styles.userId, { color: themeColors.subText }]}>

              {item.displayName ? `@${item.username}` : `User ID: ${item.uid.substring(0, 8)}...`}

            </Text>

          </View>

        </TouchableOpacity>



        {selectedUsers.size === 0 ? (

          <RoundButton
            tone="wax"
            size={44}
            onPress={() => handleAddSingleUser(item)}
            disabled={isLoading}
            accessibilityLabel={`Add ${item.username}`}
          >
            {isLoading ? <Compass size={22} spin color={roundLook(themeColors, 'wax').ink} /> : <Ionicons name="add" size={24} color={roundLook(themeColors, 'wax').ink} />}
          </RoundButton>

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

    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <PageTexture variant="map" />

      <View style={styles.header}>

        <Text kind="display" style={[styles.headerTitle, { color: themeColors.ink }]}>
          Add Friends
        </Text>

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



      <TrailLine x style={styles.trailLine} />
      {/* Search Bar */}

      <View

        style={[

          styles.searchContainer,

          {

            backgroundColor: themeColors.paper,

            borderColor: themeColors.trail,

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

          <Loading label="Searching the seas..." />

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

              backgroundColor: themeColors.paper,

              borderTopColor: themeColors.brass,

            },

          ]}

        >

          <MapButton
            title={`Create group chat (${selectedUsers.size})`}
            onPress={() => setShowGroupNameModal(true)}
            icon={<Ionicons name="people" size={20} color={buttonInk(themeColors, 'plank')} />}
          />

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

            style={[styles.modalContent, { backgroundColor: themeColors.paper, borderColor: themeColors.trail }]}

          >

            <Text kind="display" style={[styles.modalTitle, { color: themeColors.ink }]}>

              Group Chat Name (Optional)

            </Text>

            <Field
              boxStyle={styles.modalInput}
              placeholder="Enter group name or leave blank"
              value={groupName}
              onChangeText={setGroupName}
            />

            <View style={styles.modalButtonsContainer}>

              <MapButton variant="ghost" small title="Cancel" style={styles.modalButton} onPress={() => setShowGroupNameModal(false)} />
              <MapButton
                small
                title="Create"
                style={styles.modalButton}
                onPress={() => {
                  setShowGroupNameModal(false);
                  handleCreateGroupChat();
                }}
              />

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

    paddingBottom: 4,

  },

  headerTitle: {
    fontSize: 40,
    lineHeight: 46,
  },
  trailLine: { marginHorizontal: 15 },

  selectionCount: {

    paddingHorizontal: 12,

    paddingVertical: 6,

    borderRadius: 20,

    fontWeight: '600',

    fontSize: 15,

  },

  searchContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    borderRadius: 4,

    marginHorizontal: 15,

    marginVertical: 15,

    paddingHorizontal: 12,

    borderWidth: 1.5,
    borderStyle: 'dashed',

  },

  searchIcon: {

    marginRight: 10,

  },

  searchInput: {

    flex: 1,

    fontSize: 18,

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

    borderRadius: 4,

    padding: 12,

    marginBottom: 10,

    borderWidth: 1.5,
    borderStyle: 'dashed',

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

    fontSize: 18,

    fontWeight: '600',

    marginBottom: 4,

  },

  userId: {

    fontSize: 15,

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

    fontSize: 18,

    marginTop: 12,

  },

  emptySubtext: {

    fontSize: 15,

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

    fontSize: 18,

  },

  modalOverlay: {

    flex: 1,

    backgroundColor: 'rgba(51, 38, 27, 0.6)',

    justifyContent: 'center',

    alignItems: 'center',

  },

  modalContent: {
    borderRadius: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 20,
    width: '80%',
    maxWidth: 380,
  },
  modalButton: { flex: 1 },

  modalTitle: {

    fontSize: 32,
    lineHeight: 36,

    fontWeight: 'bold',

    marginBottom: 15,

  },

  modalInput: {
    marginBottom: 15,
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

