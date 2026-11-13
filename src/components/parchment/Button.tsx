/**
 * Button.tsx
 * Buttons that feel made of what is on a pirate ship.
 *
 *   MapButton   a button for words. `plank` (the default) is a ship's plank with a nail at each end, `wax` is a slab of red
 *               wax for the one thing the screen is about, `danger` is darker wax for deleting and leaving, `ghost` is a dashed
 *               trail with no fill, for the quieter second choice.
 *   RoundButton a round brass medallion with an icon on it: send, call controls, close.
 *
 * Both sink a little when pressed, and on the web they brighten under the mouse and show a hand cursor.
 */

import React from 'react';
import { Image, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/mapTheme';
import { ThemeColors } from '../../theme/colors';
import { mixColors } from '../../theme/parchment';
import { ART } from './art';
import { Compass } from './Compass';
import { Tack } from './Pins';
import { isHovered, paperShadow, POINTER } from './platform';
import { Text } from './Text';

export type MapButtonVariant = 'plank' | 'wax' | 'danger' | 'ghost';

/** The colour for an icon you draw yourself and pass as `icon`. */
export function buttonInk(c: ThemeColors, variant: MapButtonVariant = 'plank'): string {
  return variant === 'ghost' ? c.text : c.buttonText;
}

export interface MapButtonProps {
  title: string;
  onPress: () => void;
  variant?: MapButtonVariant;
  /** An icon shown before the title, drawn by the caller in `buttonInk(themeColors, variant)`. */
  icon?: React.ReactNode;
  /** Shows a turning compass in place of the title and ignores presses. */
  loading?: boolean;
  disabled?: boolean;
  /** A shorter button, for inside a row or a sheet. */
  small?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function MapButton({
  title,
  onPress,
  variant = 'plank',
  icon,
  loading = false,
  disabled = false,
  small = false,
  accessibilityLabel,
  style,
}: MapButtonProps) {
  const { themeColors: c } = useTheme();
  const inactive = disabled || loading;
  const ink = buttonInk(c, variant);
  const wax = variant === 'danger' ? c.danger : c.stamp;
  const minHeight = small ? 38 : 48;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        POINTER,
        { opacity: disabled ? 0.55 : 1, transform: [{ translateY: pressed ? 2 : 0 }, { scale: pressed ? 0.985 : 1 }] },
        style,
      ]}
    >
      {(state) => {
        const hovered = isHovered(state);
        const content = loading ? (
          <Compass spin size={small ? 20 : 24} color={ink} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {icon}
            <Text
              kind="label"
              style={{
                color: ink,
                fontSize: small ? 15 : 17,
                lineHeight: small ? 20 : 22,
                letterSpacing: 1,
                textShadowColor: variant === 'ghost' ? 'transparent' : 'rgba(0, 0, 0, 0.55)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 1,
              }}
            >
              {title}
            </Text>
          </View>
        );

        if (variant === 'ghost') {
          return (
            <View
              style={{
                minHeight,
                borderRadius: 7,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.trail,
                backgroundColor: state.pressed ? 'rgba(51, 32, 15, 0.12)' : hovered ? 'rgba(51, 32, 15, 0.07)' : 'transparent',
                paddingHorizontal: 20,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {content}
            </View>
          );
        }

        if (variant === 'wax') {
          return <WaxSlab color={wax} minHeight={minHeight} pressed={state.pressed} hovered={hovered} shadow={c.shadow}>{content}</WaxSlab>;
        }
        if (variant === 'danger') {
          return <WaxSlab color={wax} minHeight={minHeight} pressed={state.pressed} hovered={hovered} shadow={c.shadow}>{content}</WaxSlab>;
        }

        return (
          <View
            style={[
              { borderRadius: 7, backgroundColor: c.wood, borderWidth: 1, borderColor: mixColors(c.wood, '#000000', 0.55) },
              paperShadow(c.shadow, state.pressed ? 0 : 2),
            ]}
          >
            <View
              style={{
                minHeight,
                borderRadius: 6,
                overflow: 'hidden',
                paddingHorizontal: 26,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image source={ART.wood} resizeMode="cover" style={StyleSheet.absoluteFill} />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: 'rgba(255, 230, 180, 0.28)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(0, 0, 0, 0.3)' }} />
              {state.pressed ? (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.22)' }]} />
              ) : hovered ? (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255, 214, 150, 0.16)' }]} />
              ) : null}
              <Tack color={c.brass} size={7} style={{ position: 'absolute', left: 9, top: '50%', marginTop: -3.5 }} />
              <Tack color={c.brass} size={7} style={{ position: 'absolute', right: 9, top: '50%', marginTop: -3.5 }} />
              {content}
            </View>
          </View>
        );
      }}
    </Pressable>
  );
}

function WaxSlab({
  color,
  minHeight,
  pressed,
  hovered,
  shadow,
  children,
}: {
  color: string;
  minHeight: number;
  pressed: boolean;
  hovered: boolean;
  shadow: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        { borderRadius: 10, backgroundColor: color, borderWidth: 2, borderColor: mixColors(color, '#000000', 0.38) },
        paperShadow(shadow, pressed ? 0 : 2),
      ]}
    >
      <View style={{ minHeight: minHeight - 4, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '45%', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: 3,
            right: 3,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: mixColors(color, '#000000', 0.25),
          }}
        />
        {pressed ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.2)' }]} />
        ) : hovered ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255, 220, 190, 0.14)' }]} />
        ) : null}
        {children}
      </View>
    </View>
  );
}

export type RoundTone = 'paper' | 'wax' | 'wood' | 'sea' | 'night';

export interface RoundLook {
  /** The brass rim. */
  ring: string;
  /** The face of the medallion. */
  face: string;
  /** The colour to draw an icon in. */
  ink: string;
}

/** What a round button is made of, so the icon you put on it can be drawn in the right colour. */
export function roundLook(c: ThemeColors, tone: RoundTone = 'paper', active = false): RoundLook {
  if (active) return { ring: c.brass, face: c.pins[0], ink: c.ink };
  switch (tone) {
    case 'wax':
      return { ring: c.brass, face: c.stamp, ink: c.buttonText };
    case 'wood':
      return { ring: c.brass, face: c.wood, ink: c.buttonText };
    case 'sea':
      return { ring: c.brass, face: c.accent, ink: c.buttonText };
    case 'night':
      return { ring: c.brass, face: c.night, ink: c.nightInk };
    default:
      return { ring: c.brass, face: c.paper, ink: c.ink };
  }
}

export interface RoundButtonProps {
  onPress: () => void;
  /** The icon, drawn by the caller in `roundLook(themeColors, tone, active).ink`. */
  children?: React.ReactNode;
  accessibilityLabel: string;
  size?: number;
  tone?: RoundTone;
  /** Lit up, for toggles such as mute or speaker: a brass face. */
  active?: boolean;
  disabled?: boolean;
  /** Looks faded but still takes presses (a send button with nothing to send that also opens a menu when held). */
  dimmed?: boolean;
  /** Holding the button. */
  onLongPress?: () => void;
  delayLongPress?: number;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function RoundButton({
  onPress,
  children,
  accessibilityLabel,
  size = 44,
  tone = 'paper',
  active = false,
  disabled = false,
  dimmed = false,
  onLongPress,
  delayLongPress,
  accessibilityHint,
  style,
}: RoundButtonProps) {
  const { themeColors: c } = useTheme();
  const look = roundLook(c, tone, active);
  const edge = mixColors(look.ring, '#000000', 0.5);
  const ring = Math.max(3, Math.round(size * 0.09));
  const face = size - ring * 2;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || dimmed, selected: active }}
      hitSlop={6}
      style={({ pressed }) => [
        POINTER,
        { opacity: disabled ? 0.5 : dimmed ? 0.45 : 1, transform: [{ scale: pressed ? 0.93 : 1 }] },
        style,
      ]}
    >
      {(state) => (
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: look.ring,
              borderWidth: 1,
              borderColor: edge,
              padding: ring - 1,
            },
            paperShadow(c.shadow, state.pressed ? 0 : 2),
          ]}
        >
          <View
            style={{
              width: face - 2,
              height: face - 2,
              borderRadius: face / 2,
              backgroundColor: look.face,
              borderWidth: 1,
              borderColor: edge,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {children}
            {isHovered(state) ? (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255, 230, 180, 0.18)' }]} />
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}
