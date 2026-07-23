/**
 * ToastNotification.tsx
 * Toast notification component for incoming messages
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle
} from 'react-native';

// Toast data interface
interface Toast {
  id: string;
  senderUsername: string;
  messageText: string;
  conversationId: string;
  timestamp: number;
}

// Component props interface
interface ToastNotificationProps {
  toast: Toast | null;
  onDismiss: () => void;
  onPress?: (conversationId: string) => void;
  duration?: number;
}

/**
 * ToastNotification Component
 * Displays a notification toast that slides in from top
 */
export const ToastNotification = ({
  toast,
  onDismiss,
  onPress,
  duration = 4000,
}: ToastNotificationProps) => {
  // Animation value for sliding
  const [slideAnim] = React.useState(new Animated.Value(-100));

  // Local state for toast data
  const [toastData, setToastData] = useState<Toast | null>(toast);

  /**
   * Effect: Handle toast appearing/disappearing
   */
  useEffect(() => {
    // Early exit if no toast
    if (!toast) {
      return;
    }

    // Set toast data
    setToastData(toast);

    // Animate slide in
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Set timeout to auto-dismiss
    const timer = setTimeout(() => {
      // Animate slide out
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        // Clear data after animation completes
        onDismiss();
        setToastData(null);
      });
    }, duration);

    // Cleanup timer
    return () => clearTimeout(timer);
  }, [toast, duration, slideAnim, onDismiss]);

  /**
   * Handle toast press - navigate to conversation
   */
  const handlePress = () => {
    if (!toastData) return;

    // Call onPress callback if provided
    onPress?.(toastData.conversationId);

    // Animate out and dismiss
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
      setToastData(null);
    });
  };

  // Don't render if no toast data
  if (!toastData) {
    return null;
  }

  const senderInitial = toastData.senderUsername[0]?.toUpperCase() || '?';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.toast}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        {/* Avatar with sender initial */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{senderInitial}</Text>
          </View>
        </View>

        {/* Sender name and message preview */}
        <View style={styles.contentContainer}>
          <Text style={styles.senderName} numberOfLines={1}>
            {toastData.senderUsername}
          </Text>
          <Text style={styles.messagePreview} numberOfLines={1}>
            {toastData.messageText}
          </Text>
        </View>

        {/* Close button */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={20} color="#aaa" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  } as ViewStyle,

  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    marginHorizontal: 10,
    marginTop: 50,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#03DAC5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  } as ViewStyle,

  avatarContainer: {
    marginRight: 10,
  } as ViewStyle,

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#03DAC5',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,

  avatarText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 16,
  } as TextStyle,

  contentContainer: {
    flex: 1,
    marginRight: 8,
  } as ViewStyle,

  senderName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  } as TextStyle,

  messagePreview: {
    color: '#aaa',
    fontSize: 12,
    lineHeight: 16,
  } as TextStyle,

  closeButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
});

export default ToastNotification;