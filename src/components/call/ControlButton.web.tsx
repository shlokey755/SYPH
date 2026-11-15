/**
 * ControlButton.web.tsx
 * The buttons on the call screens (mute, speaker, camera, switch camera) in a browser: brass-rimmed medallions that turn gold while
 * switched on. Same props as ControlButton.tsx. A phone never loads this file.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTheme } from '../../theme/mapTheme';
import { RoundButton, roundLook } from '../parchment';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}

export function ControlButton({ icon, label, active, onPress }: Props) {
  const { themeColors: c } = useTheme();
  const lit = !!active;
  return (
    <RoundButton tone="paper" size={58} active={lit} onPress={onPress} accessibilityLabel={label}>
      <Ionicons name={icon} size={26} color={roundLook(c, 'paper', lit).ink} />
    </RoundButton>
  );
}
