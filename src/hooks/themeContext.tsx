/**
 * themeContext.tsx
 */

import React, { createContext, useContext, useState } from 'react';

export type ThemeOption = 'default' | 'beige-purple' | 'white-black';

export interface ThemeColors {
  background: string;
  cardBackground: string;
  text: string;
  subText: string;
  accent: string;
  border: string;
  inputBg: string;
  buttonText: string;
}

export const themeSchemes: Record<ThemeOption, ThemeColors> = {
  default: {
    background: '#121212',
    cardBackground: '#1E1E1E',
    text: '#FFFFFF',
    subText: '#AAAAAA',
    accent: '#03DAC5',
    border: '#333333',
    inputBg: '#1E1E1E',
    buttonText: '#121212',
  },
  'beige-purple': {
    background: '#F5F5DC',
    cardBackground: '#E8E8C8',
    text: '#333333',
    subText: '#555555',
    accent: '#800080',
    border: '#D3D3A1',
    inputBg: '#FFFFFF',
    buttonText: '#FFFFFF',
  },
  'white-black': {
    background: '#FFFFFF',
    cardBackground: '#F0F0F0',
    text: '#000000',
    subText: '#666666',
    accent: '#000000',
    border: '#E0E0E0',
    inputBg: '#F5F5F5',
    buttonText: '#FFFFFF',
  },
};

interface ThemeContextType {
  selectedTheme: ThemeOption;
  themeColors: ThemeColors;
  setTheme: (theme: ThemeOption) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>('default');

  const setTheme = (theme: ThemeOption) => {
    setSelectedTheme(theme);
  };

  const themeColors = themeSchemes[selectedTheme];

  return (
    <ThemeContext.Provider value={{ selectedTheme, themeColors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};