import { createContext, useContext } from 'react';
import { PaletteKey } from '../constants';

interface ThemeContextType {
  paletteKey: PaletteKey;
  activePalette: string[];
  updatePaletteKey: (key: PaletteKey) => void;
  // Helper to get a specific user's color efficiently
  getUserColor: (user: User) => string; 
}

export const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};