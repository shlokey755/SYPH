/**
 * Paper.tsx
 * A scrap of the map pinned to the page: the card every list row, message slip, sheet and panel is made from.
 *
 *   <Paper seed={id} pin="tack">...</Paper>            a card, turned a little by its id, held by a brass tack
 *   <Paper trail contentStyle={{ padding: 12 }}>       with a dashed trail line drawn just inside its edge
 *   <Paper torn="top" tone="alt">                      its top edge torn off, so the page shows through the ragged gap
 *
 * `contentStyle` goes on the paper itself (padding, flexDirection, gap); `style` goes on the outside (margins, width).
 * Do not put anything the person types into or scrolls inside a Paper that is turned: keep `angle` and `seed` for display cards.
 */

import React from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/mapTheme';
import { ThemeColors } from '../../theme/colors';
import { Lift, mixColors, tilt, withAlpha } from '../../theme/parchment';
import { ART } from './art';
import { Tack, WaxSeal } from './Pins';
import { FILL_IMAGE, paperShadow } from './platform';

/** `paper` fresh parchment, `alt` tea-stained, `accent` sea-blue (your own message slips), `night` for use over the night sea. */
export type PaperTone = 'paper' | 'alt' | 'accent' | 'night';

export interface ToneLook {
  background: string;
  /** Text on it. */
  ink: string;
  /** Secondary text on it. */
  inkSoft: string;
  /** Highlights and links on it. */
  stamp: string;
}

export function toneLook(c: ThemeColors, tone: PaperTone): ToneLook {
  switch (tone) {
    case 'alt':
      return { background: c.paperAlt, ink: c.ink, inkSoft: c.inkSoft, stamp: c.stamp };
    case 'accent':
      return { background: c.accent, ink: c.buttonText, inkSoft: withAlpha(c.buttonText, 0.8), stamp: c.buttonText };
    case 'night':
      return { background: c.night, ink: c.nightInk, inkSoft: c.nightSoft, stamp: '#E9B96E' };
    default:
      return { background: c.paper, ink: c.ink, inkSoft: c.inkSoft, stamp: c.stamp };
  }
}

/** Height of a torn edge. It is drawn above (or below) the paper, so the paper itself starts after it. */
export const TEAR_HEIGHT = 26;

export interface PaperProps {
  children?: React.ReactNode;
  tone?: PaperTone;
  /** Turns the paper a little, the same way every time for the same seed (a message id, a name). */
  seed?: string | number;
  /** The most the seed may turn it, in degrees. */
  maxTilt?: number;
  /** An exact angle in degrees. Wins over the seed. */
  angle?: number;
  /** A dashed trail line just inside the edge, like a route drawn on the map. */
  trail?: boolean;
  /** Which edges are torn off. */
  torn?: 'none' | 'top' | 'bottom' | 'both';
  /** `tack` one brass tack at the top, `nails` a nail in each corner, `seal` a blob of red wax on the top right. */
  pin?: 'none' | 'tack' | 'nails' | 'seal';
  /** How high it lies above the page. Torn paper always gets a flat cut-out shadow instead. */
  lift?: Lift;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

function TearEdge({ color, shadow, flipped }: { color: string; shadow: string; flipped: boolean }) {
  return (
    <View pointerEvents="none" style={{ height: TEAR_HEIGHT, transform: flipped ? [{ scaleY: -1 }] : undefined }}>
      <Image
        source={ART.tear}
        resizeMode="stretch"
        tintColor={shadow}
        style={[FILL_IMAGE, { transform: [{ translateY: flipped ? -2 : 2 }] }]}
      />
      <Image source={ART.tear} resizeMode="stretch" tintColor={color} style={FILL_IMAGE} />
      <Image
        source={ART.tearRim}
        resizeMode="stretch"
        tintColor={mixColors(color, '#FFFFFF', 0.6)}
        style={[FILL_IMAGE, { opacity: 0.8 }]}
      />
    </View>
  );
}

export function Paper({
  children,
  tone = 'paper',
  seed,
  maxTilt = 1,
  angle,
  trail = false,
  torn = 'none',
  pin = 'none',
  lift = 1,
  radius = 3,
  style,
  contentStyle,
}: PaperProps) {
  const { themeColors: c } = useTheme();
  const look = toneLook(c, tone);
  const rotation = angle ?? (seed !== undefined ? tilt(seed, maxTilt) : 0);
  const tornTop = torn === 'top' || torn === 'both';
  const tornBottom = torn === 'bottom' || torn === 'both';
  const flatShadow = withAlpha(c.shadow, 0.3);
  const topInset = tornTop ? TEAR_HEIGHT : 0;
  const bottomInset = tornBottom ? TEAR_HEIGHT : 0;
  const trailColor = tone === 'paper' || tone === 'alt' ? c.trail : withAlpha(look.ink, 0.5);
  const sealAngle = seed !== undefined ? tilt(seed, 20) : 8;

  return (
    <View style={[rotation ? { transform: [{ rotate: `${rotation}deg` }] } : null, style]}>
      {torn !== 'none' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 1,
            right: -1,
            top: topInset + 2,
            bottom: bottomInset - 2,
            backgroundColor: flatShadow,
            borderRadius: radius,
          }}
        />
      ) : null}
      {tornTop ? <TearEdge color={look.background} shadow={flatShadow} flipped={false} /> : null}
      <View
        style={[
          {
            backgroundColor: look.background,
            borderTopLeftRadius: tornTop ? 0 : radius,
            borderTopRightRadius: tornTop ? 0 : radius,
            borderBottomLeftRadius: tornBottom ? 0 : radius,
            borderBottomRightRadius: tornBottom ? 0 : radius,
          },
          torn === 'none' ? paperShadow(c.shadow, lift) : null,
          contentStyle,
        ]}
      >
        {trail ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: tornTop ? 9 : 5,
              bottom: tornBottom ? 9 : 5,
              left: 5,
              right: 5,
              borderWidth: 1.2,
              borderStyle: 'dashed',
              borderColor: trailColor,
              borderRadius: Math.max(0, radius - 1),
            }}
          />
        ) : null}
        {children}
      </View>
      {tornBottom ? <TearEdge color={look.background} shadow={flatShadow} flipped /> : null}

      {pin === 'tack' ? (
        <Tack color={c.pins[0]} style={{ position: 'absolute', top: topInset - 7, left: '50%', marginLeft: -8 }} />
      ) : null}
      {pin === 'seal' ? (
        <WaxSeal color={c.stamp} size={28} angle={sealAngle} style={{ position: 'absolute', top: topInset - 12, right: 14 }} />
      ) : null}
      {pin === 'nails' ? (
        <>
          <Tack color={c.pins[0]} size={9} style={{ position: 'absolute', top: topInset + 5, left: 6 }} />
          <Tack color={c.pins[0]} size={9} style={{ position: 'absolute', top: topInset + 5, right: 6 }} />
          <Tack color={c.pins[0]} size={9} style={{ position: 'absolute', bottom: bottomInset + 5, left: 6 }} />
          <Tack color={c.pins[0]} size={9} style={{ position: 'absolute', bottom: bottomInset + 5, right: 6 }} />
        </>
      ) : null}
    </View>
  );
}
