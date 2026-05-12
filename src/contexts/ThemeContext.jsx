/**
 * Theme Context and Provider
 * 
 * Provides global theme state management for the Layout Theme System.
 * Handles theme persistence to localStorage and applies CSS variables to document root.
 * 
 * Requirements: 2.2, 2.4, 5.2, 5.3
 */

import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  THEMES,
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  getThemeById,
  getThemesList,
  isValidThemeId,
  themeToCssVariables,
  getInitialThemeId
} from '../config/themes';

/**
 * Theme Context
 * Provides access to current theme, theme setter, and available themes
 */
export const ThemeContext = createContext(null);

/**
 * Apply CSS variables to document root
 * @param {Object} theme - Theme configuration to apply
 */
const applyCssVariables = (theme) => {
  if (!theme || !theme.colors) return;
  
  const cssVariables = themeToCssVariables(theme);
  const root = document.documentElement;
  
  Object.entries(cssVariables).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
};

/**
 * Load theme preference from localStorage
 * Priority: localStorage > environment variable > hardcoded default
 * @returns {string} Theme ID from storage, env var, or default
 */
const loadThemeFromStorage = () => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.activeThemeId && isValidThemeId(parsed.activeThemeId)) {
        return parsed.activeThemeId;
      }
    }
  } catch (error) {
    console.warn('Failed to load theme preference from storage:', error);
  }
  // Fall back to environment-based default or hardcoded default
  return getInitialThemeId();
};

/**
 * Save theme preference to localStorage
 * @param {string} themeId - Theme ID to save
 */
const saveThemeToStorage = (themeId) => {
  try {
    const data = {
      activeThemeId: themeId,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save theme preference to storage:', error);
  }
};

/**
 * Theme Provider Component
 * Wraps the application and provides theme context to all children
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export const ThemeProvider = ({ children }) => {
  const [currentThemeId, setCurrentThemeId] = useState(() => loadThemeFromStorage());
  const [isLoading, setIsLoading] = useState(true);

  // Get current theme configuration
  const currentTheme = useMemo(() => {
    return getThemeById(currentThemeId) || getThemeById(DEFAULT_THEME_ID);
  }, [currentThemeId]);

  // Get list of all available themes
  const themes = useMemo(() => getThemesList(), []);

  // Apply CSS variables when theme changes
  useEffect(() => {
    if (currentTheme) {
      applyCssVariables(currentTheme);
    }
  }, [currentTheme]);

  // Initial load effect
  useEffect(() => {
    setIsLoading(false);
  }, []);

  /**
   * Set the active theme
   * @param {string} themeId - ID of the theme to activate
   */
  const setTheme = useCallback((themeId) => {
    if (!isValidThemeId(themeId)) {
      console.warn(`Invalid theme ID: ${themeId}. Using default theme.`);
      themeId = DEFAULT_THEME_ID;
    }
    
    setCurrentThemeId(themeId);
    saveThemeToStorage(themeId);
  }, []);

  // Context value
  const contextValue = useMemo(() => ({
    currentTheme,
    setTheme,
    themes,
    isLoading,
    currentThemeId
  }), [currentTheme, setTheme, themes, isLoading, currentThemeId]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
