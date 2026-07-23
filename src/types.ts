/**
 * types.ts (UPDATED with Group Chat Support)
 */

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  walletBalance: number;
  lastUsernameChange?: any;
  createdAt: any;
}

export interface Message {
  id: string;
  text: string;
  senderId: string;
  senderUsername: string;
  receiverId?: string; // For 1-on-1 chats
  status: 'sent' | 'delivered' | 'read';
  createdAt: any;
}

export interface ConversationParticipant {
  uid: string;
  username: string;
  profileImageUrl?: string;
}

// Updated: Now supports both 1-on-1 and group conversations
export interface Conversation {
  id: string;
  isGroup: boolean; // ← NEW: Flag for group chat
  groupName?: string; // ← NEW: Name for group
  participant1?: ConversationParticipant; // For 1-on-1 chats
  participant2?: ConversationParticipant; // For 1-on-1 chats
  participants?: ConversationParticipant[]; // ← NEW: For group chats
  lastMessage?: string;
  lastMessageTime?: any;
  lastMessageSenderId?: string;
  isDeleted?: boolean;
  deletedAt?: any;
  createdAt: any;
}

export interface Contact {
  id: string;
  uid: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  category: 'personal' | 'work' | 'family' | 'business';
  isVerified?: boolean;
  createdAt: any;
}

export interface FeedPost {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  content: string;
  mediaUrl?: string;
  likes: number;
  timestamp: any;
}

export interface WalletTransaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  type: 'transfer' | 'payment' | 'refund';
  status: 'pending' | 'completed' | 'failed';
  timestamp: any;
}

export interface AppContextType {
  currentUser: UserProfile | null;
  isLoading: boolean;
  isRegistering: boolean;
  setIsRegistering: (value: boolean) => void;
}