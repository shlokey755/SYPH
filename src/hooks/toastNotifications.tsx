/**
 * toastNotifications.tsx
 * App-wide toast system (FR-09, NFR-06).
 *
 *   const toast = useToast();
 *   toast.success('Saved');
 *   toast.error('Upload failed', 'Check your connection');
 *   const id = toast.progress('Uploading photo', 0);   // progress toast stays until dismissed
 *   toast.update(id, { progress: 0.5 });
 *   toast.dismiss(id);
 */

import { Ionicons } from '@expo/vector-icons';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './themeContext';

export type ToastType = 'success' | 'error' | 'info' | 'message' | 'progress';

export interface ToastOptions {
  type?: ToastType;
  title: string;
  message?: string;
  /** 0..1, only used by progress toasts. */
  progress?: number;
  /** ms before auto-dismiss. 0 keeps it until dismissed. */
  duration?: number;
  onPress?: () => void;
}

interface ToastItem extends ToastOptions {
  id: string;
  type: ToastType;
}

interface ToastApi {
  show: (options: ToastOptions) => string;
  update: (id: string, patch: Partial<ToastOptions>) => void;
  dismiss: (id: string) => void;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
  progress: (title: string, progress?: number) => string;
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 3500;

const ToastContext = createContext<ToastApi | undefined>(undefined);

const ICONS: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
  message: 'chatbubble-ellipses',
  progress: 'cloud-upload',
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    counter.current += 1;
    const id = `toast-${Date.now()}-${counter.current}`;
    const item: ToastItem = { ...options, id, type: options.type ?? 'info' };
    setToasts((prev) => [...prev, item].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const update = useCallback((id: string, patch: Partial<ToastOptions>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      update,
      dismiss,
      success: (title, message) => show({ type: 'success', title, message }),
      error: (title, message) => show({ type: 'error', title, message, duration: 5000 }),
      info: (title, message) => show({ type: 'info', title, message }),
      progress: (title, progress = 0) => show({ type: 'progress', title, progress, duration: 0 }),
    }),
    [show, update, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};

function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const { themeColors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [anim]);

  const duration =
    toast.duration ?? (toast.type === 'progress' ? 0 : DEFAULT_DURATION);

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [duration, toast.id, onDismiss]);

  const color = toast.type === 'error' ? themeColors.danger : themeColors.accent;
  const pct = Math.max(0, Math.min(1, toast.progress ?? 0));

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
      }}
    >
      <Pressable
        accessibilityRole="alert"
        onPress={() => {
          toast.onPress?.();
          onDismiss(toast.id);
        }}
        style={[
          styles.toast,
          {
            backgroundColor: themeColors.cardBackground,
            borderColor: themeColors.border,
            borderLeftColor: color,
          },
        ]}
      >
        <Ionicons name={ICONS[toast.type]} size={22} color={color} />
        <View style={styles.body}>
          <Text style={[styles.title, { color: themeColors.text }]} numberOfLines={1}>
            {toast.title}
          </Text>
          {toast.message ? (
            <Text style={[styles.message, { color: themeColors.subText }]} numberOfLines={2}>
              {toast.message}
            </Text>
          ) : null}
          {toast.type === 'progress' ? (
            <View style={[styles.track, { backgroundColor: themeColors.border }]}>
              <View style={[styles.fill, { backgroundColor: color, width: `${pct * 100}%` }]} />
            </View>
          ) : null}
        </View>
        <Pressable onPress={() => onDismiss(toast.id)} hitSlop={10}>
          <Ionicons name="close" size={18} color={themeColors.subText} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 12,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  body: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600' },
  message: { fontSize: 12, marginTop: 2 },
  track: { height: 4, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
