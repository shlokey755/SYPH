export interface UserProfile {
  uid: string;
  username: string;
  usernameLowercase?: string;
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
  receiverId?: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: any;
}

export interface ConversationParticipant {
  uid: string;
  username: string;
  profileImageUrl?: string;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  groupName?: string;
  participant1?: ConversationParticipant;
  participant2?: ConversationParticipant;
  participants?: ConversationParticipant[];
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