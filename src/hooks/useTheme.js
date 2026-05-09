/**
 * useTheme Hook
 * 
 * Custom hook for accessing theme context from any component.
 * Provides access to currentTheme, setTheme, and themes list.
 * 
 * Requirements: 2.2, 6.1
 */

import { useContext } from 'react';
import { ThemeContext } from '../contexts/ThemeContext';

/**
 * Custom hook to access theme context
 * 
 * @returns {Object} Theme context value containing:
 *   - currentTheme: Current active theme configuration
 *   - setTheme: Function to change the active theme
 *   - themes: Array of all available themes
 *   - isLoading: Boolean indicating if theme is still loading
 *   - currentThemeId: ID of the current active theme
 * 
 * @throws {Error} If used outside of ThemeProvider
 * 
 * @example
 * const { currentTheme, setTheme, themes } = useTheme();
 * 
 * // Change theme
 * setTheme('medical');
 * 
 * // Access current theme colors
 * const primaryColor = currentTheme.colors.primary;
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  
  if (context === null) {
    throw new Error(
      'useTheme must be used within a ThemeProvider. ' +
      'Wrap your component tree with <ThemeProvider> to use this hook.'
    );
  }
  
  return context;
}

export default useTheme;
