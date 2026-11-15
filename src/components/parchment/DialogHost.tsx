/**
 * DialogHost.tsx
 * Draws the question or notice that `Alert.alert` raised in a browser (utils/dialogQueue.ts): a torn sheet of parchment under a
 * wax seal, over the dimmed page. The title is in blackletter, the words follow, and each choice is a button: a plank for an
 * ordinary choice, wax for the main one when there are several, dark wax for a warning, a dashed trail for "cancel". One dialog at
 * a time; the next one appears when this one is answered. Escape and a click outside leave the way "cancel" does.
 * Mounted once, in app/_layout.web.tsx. A phone never loads it.
 */

import React, { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/mapTheme';
import { withAlpha } from '../../theme/parchment';
import { answerDialog, currentDialog, DialogButton, leaveButton, subscribeDialogs } from '../../utils/dialogQueue';
import { MapButton, MapButtonVariant } from './Button';
import { Paper } from './Paper';
import { Text } from './Text';

/** Plank for a choice, wax for the main one when there are several, dark wax for a warning, a dashed trail for "cancel". */
function variantFor(button: DialogButton, all: DialogButton[]): MapButtonVariant {
  if (button.style === 'cancel') return 'ghost';
  if (button.style === 'destructive') return 'danger';
  const choices = all.filter((other) => other.style !== 'cancel' && other.style !== 'destructive');
  return all.length > 1 && button === choices[choices.length - 1] ? 'wax' : 'plank';
}

export function DialogHost() {
  const { themeColors: c } = useTheme();
  const dialog = useSyncExternalStore(subscribeDialogs, currentDialog, currentDialog);
  if (!dialog) return null;

  const leaving = leaveButton(dialog);
  const leave = () => {
    if (leaving) answerDialog(dialog.id, leaving);
  };
  const stacked = dialog.buttons.length > 2;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={leave}>
      <View style={[styles.backdrop, { backgroundColor: withAlpha(c.burn, 0.62) }]}>
        {leaving ? <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={leave} /> : null}
        <Paper torn="both" pin="seal" angle={-0.5} style={styles.card} contentStyle={styles.body}>
          <View accessibilityRole="alert" style={styles.words}>
            <Text kind="display" accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
              {dialog.title}
            </Text>
            {dialog.message ? (
              <Text kind="body" style={[styles.message, { color: c.ink }]}>
                {dialog.message}
              </Text>
            ) : null}
          </View>
          <View style={[styles.buttons, stacked && styles.stacked]}>
            {dialog.buttons.map((button, index) => (
              <MapButton
                key={index}
                small
                title={button.text || 'OK'}
                variant={variantFor(button, dialog.buttons)}
                onPress={() => answerDialog(dialog.id, button)}
                style={stacked ? undefined : styles.button}
              />
            ))}
          </View>
        </Paper>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440 },
  body: { paddingHorizontal: 26, paddingTop: 30, paddingBottom: 26, gap: 18 },
  words: { gap: 8 },
  title: { fontSize: 32, lineHeight: 38 },
  message: { fontSize: 19, lineHeight: 25 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stacked: { flexDirection: 'column', flexWrap: 'nowrap' },
  // Two buttons share a row; a narrow window wraps the second one underneath.
  button: { flexGrow: 1, flexBasis: 130 },
});
