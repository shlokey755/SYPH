import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../../firebaseConfig';


interface Message {
  id: string;
  text: string;
  senderId: string;
  username: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: any;
}

export default function HomeScreen() {
  // Input fields state
  const [text, setText] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // App logic state
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isRegistering, setIsRegistering] = useState(false); // Toggle between Login and Register views

  // 1. Listen for Authentication Changes (Are we logged in or out?)
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribeAuth();
  }, []);

  // 2. Listen for Live Messages when a user is authenticated
  useEffect(() => {
    if (!currentUser) return;

    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const loadedMessages: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        loadedMessages.push({
          id: doc.id,
          text: data.text || '',
          senderId: data.senderId || '',
          username: data.username || 'Anonymous',
          status: data.status || 'sent',
          createdAt: data.createdAt,
        });
      });
      setMessages(loadedMessages);
    });

    return () => unsubscribeMessages();
  }, [currentUser]);

  // 3. Handle Create Account (Registering)
  // 3. Handle Create Account (Registering)
const handleRegister = async () => {
  if (!username || !password) return Alert.alert('Error', 'Please fill out all fields.');
  try {
    // Create a hidden fake email structure for Firebase using their chosen username
    const fakeEmail = `${username.trim().toLowerCase()}@syph.com`;
    
    // 1. Create the user credentials
    const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
    
    // 2. Attach their real username as the "displayName" so it shows above the gray bubbles
    await updateProfile(userCredential.user, {
      displayName: username.trim()
    });

    Alert.alert('Success', 'Account created successfully!');
  } catch (error: any) {
    Alert.alert('Registration Failed', error.message);
  }
};

  // 4. Handle Account Sign In
  const handleLogin = async () => {
    if (!username || !password) return Alert.alert('Error', 'Please fill out all fields.');
    try {
      const fakeEmail = `${username.trim().toLowerCase()}@syph.com`;
      await signInWithEmailAndPassword(auth, fakeEmail, password);
    } catch (error: any) {
      Alert.alert('Login Failed', 'Incorrect username or password.');
    }
  };

  // 5. Handle Logout
  const handleLogout = () => {
    signOut(auth);
  };

  // 6. Send Message with profile data attached
  const handleSend = async () => {
    if (text.trim() === '') return; 

    try {
      // Extrapolate original username out of the fake email wrapper
      const userDisplay = currentUser.email.split('@')[0];

      await addDoc(collection(db, 'messages'), {
        text: text,
        senderId: currentUser.uid, 
        username: userDisplay, // Saved into history so everyone can read your name
        status: 'sent', 
        createdAt: serverTimestamp(),
      });
      setText(''); 
    } catch (error) {
      console.error(error);
    }
  };

  const getMinutesAgo = (createdAt: any) => {
    if (!createdAt) return '0m';
    const msgTime = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const diffMs = new Date().getTime() - msgTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins <= 0 ? 'just now' : `${diffMins}m ago`;
  };

  // 🚪 RENDER VIEW A: AUTH SCREEN (Login / Sign up interface)
  if (!currentUser) {
    return (
      <View style={styles.container}>
        <Text style={styles.authTitle}>💬 Setup Your Profile</Text>
        <Text style={styles.authSubtitle}>{isRegistering ? 'Create a unique chat key' : 'Sign back into your account'}</Text>
        
        <TextInput 
          style={styles.authInput}
          placeholder="Enter Username"
          placeholderTextColor="#666"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput 
          style={styles.authInput}
          placeholder="Enter Password"
          placeholderTextColor="#666"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
        />

        <TouchableOpacity style={styles.primaryButton} onPress={isRegistering ? handleRegister : handleLogin}>
          <Text style={styles.buttonText}>{isRegistering ? 'Register Username' : 'Login'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsRegistering(!isRegistering)}>
          <Text style={styles.toggleText}>
            {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register Here"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 💬 RENDER VIEW B: ACTIVE CHAT SCREEN
  const currentDisplayUsername = currentUser.email.split('@')[0];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Global Chat Room 🌐</Text>
          <Text style={styles.subtitle}>Signed in as: @{currentDisplayUsername}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Leave</Text>
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.list}
        renderItem={({ item, index }) => {
          const isMyMessage = item.senderId === currentUser.uid;
          const isLatestMessage = index === messages.length - 1;

          let dynamicBubbleStyle: any = styles.receivedBubble; 
          if (isMyMessage) {
            if (item.status === 'sent') dynamicBubbleStyle = styles.sentBubble;       
            else if (item.status === 'delivered') dynamicBubbleStyle = styles.deliveredBubble; 
            else if (item.status === 'read') dynamicBubbleStyle = styles.readBubble;       
          }

          return (
            <View style={[styles.rowContainer, isMyMessage ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
              {/* Show sender username above text bubbles from incoming friends */}
              {!isMyMessage && <Text style={styles.usernameLabel}>@{item.username}</Text>}
              
              <View style={[styles.messageBubble, dynamicBubbleStyle]}>
                <Text style={isMyMessage ? styles.sentText : styles.receivedText}>
                  {item.text}
                </Text>
              </View>
              
              {isMyMessage && item.status === 'read' && isLatestMessage && (
                <Text style={styles.outsideStatusText}>seen {getMinutesAgo(item.createdAt)}</Text>
              )}
            </View>
          );
        }}
      />

      <View style={styles.inputContainer}>
        <TextInput 
          style={styles.input}
          placeholder="Type a message here..."
          placeholderTextColor="#666"
          value={text}
          onChangeText={setText}
        />
        <Button title="Send" onPress={handleSend} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212', 
    paddingTop: 50,
    paddingHorizontal: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingBottom: 10,
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 12,
    color: '#aaa',
  },
  logoutButton: {
    backgroundColor: '#CF6679',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  logoutText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  authTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginTop: 80,
  },
  authSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
    marginTop: 5,
  },
  authInput: {
    backgroundColor: '#1E1E1E',
    color: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  toggleText: {
    color: '#007AFF',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
  list: {
    flex: 1,
    marginBottom: 10,
  },
  rowContainer: {
    marginBottom: 8,
    maxWidth: '75%',
  },
  usernameLabel: {
    color: '#666',
    fontSize: 11,
    marginBottom: 2,
    paddingLeft: 4,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 18,
  },
  sentBubble: {
    backgroundColor: '#3A3D52', 
    borderBottomRightRadius: 2,
  },
  deliveredBubble: {
    backgroundColor: '#6200EE', 
    borderBottomRightRadius: 2,
  },
  readBubble: {
    backgroundColor: '#03DAC5', 
    borderBottomRightRadius: 2,
  },
  receivedBubble: {
    backgroundColor: '#2A2A2A', 
    borderBottomLeftRadius: 2,
  },
  sentText: {
    color: '#fff',
    fontSize: 16,
  },
  receivedText: {
    color: '#fff',
    fontSize: 16,
  },
  outsideStatusText: {
    fontSize: 11,
    color: '#555555', 
    textAlign: 'right',
    marginTop: 3,
    paddingRight: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#1E1E1E',
    padding: 5,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#333',
  },
  input: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
    color: '#fff',
  },
});