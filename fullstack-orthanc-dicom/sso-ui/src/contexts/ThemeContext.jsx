import React, { createContext, useContext, useReducer, useEffect } from 'react'

// Theme context
const ThemeContext = createContext(null)

// Theme actions
const THEME_ACTIONS = {
  SET_THEME: 'SET_THEME',
  TOGGLE_THEME: 'TOGGLE_THEME',
  SET_FONT_SIZE: 'SET_FONT_SIZE',
  SET_REDUCED_MOTION: 'SET_REDUCED_MOTION',
  SET_HIGH_CONTRAST: 'SET_HIGH_CONTRAST',
  RESET_PREFERENCES: 'RESET_PREFERENCES',
}

// Available themes
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
}

// Font size options
export const FONT_SIZES = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
  EXTRA_LARGE: 'extra-large',
}

// Initial state
const initialState = {
  theme: THEMES.SYSTEM,
  actualTheme: THEMES.LIGHT, // The actual theme being used (resolved from system)
  fontSize: FONT_SIZES.MEDIUM,
  reducedMotion: false,
  highContrast: false,
}

// Storage keys
const STORAGE_KEYS = {
  THEME: 'dicom_theme_preference',
  FONT_SIZE: 'dicom_font_size',
  REDUCED_MOTION: 'dicom_reduced_motion',
  HIGH_CONTRAST: 'dicom_high_contrast',
}

// Theme reducer
function themeReducer(state, action) {
  switch (action.type) {
    case THEME_ACTIONS.SET_THEME:
      return {
        ...state,
        theme: action.payload.theme,
        actualTheme: action.payload.actualTheme,
      }

    case THEME_ACTIONS.TOGGLE_THEME:
      const newTheme = state.actualTheme === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT
      return {
        ...state,
        theme: newTheme,
        actualTheme: newTheme,
      }

    case THEME_ACTIONS.SET_FONT_SIZE:
      return {
        ...state,
        fontSize: action.payload,
      }

    case THEME_ACTIONS.SET_REDUCED_MOTION:
      return {
        ...state,
        reducedMotion: action.payload,
      }

    case THEME_ACTIONS.SET_HIGH_CONTRAST:
      return {
        ...state,
        highContrast: action.payload,
      }

    case THEME_ACTIONS.RESET_PREFERENCES:
      return {
        ...initialState,
        actualTheme: getSystemTheme(),
      }

    default:
      return state
  }
}

// Get system theme preference
function getSystemTheme() {
  if (typeof window === 'undefined') return THEMES.LIGHT
  
  return window.matchMedia('(prefers-color-scheme: dark)').matches 
    ? THEMES.DARK 
    : THEMES.LIGHT
}

// Get system reduced motion preference
function getSystemReducedMotion() {
  if (typeof window === 'undefined') return false
  
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Get system high contrast preference
function getSystemHighContrast() {
  if (typeof window === 'undefined') return false
  
  return window.matchMedia('(prefers-contrast: high)').matches
}

// Apply theme to document
function applyThemeToDocument(theme, fontSize, reducedMotion, highContrast) {
  const root = document.documentElement
  
  // Apply theme class
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
  
  // Apply font size
  root.classList.remove('text-sm', 'text-base', 'text-lg', 'text-xl')
  switch (fontSize) {
    case FONT_SIZES.SMALL:
      root.classList.add('text-sm')
      break
    case FONT_SIZES.LARGE:
      root.classList.add('text-lg')
      break
    case FONT_SIZES.EXTRA_LARGE:
      root.classList.add('text-xl')
      break
    default:
      root.classList.add('text-base')
  }
  
  // Apply reduced motion
  if (reducedMotion) {
    root.classList.add('reduce-motion')
  } else {
    root.classList.remove('reduce-motion')
  }
  
  // Apply high contrast
  if (highContrast) {
    root.classList.add('high-contrast')
  } else {
    root.classList.remove('high-contrast')
  }
  
  // Set CSS custom properties
  root.style.setProperty('--font-size-scale', getFontSizeScale(fontSize))
}

// Get font size scale factor
function getFontSizeScale(fontSize) {
  switch (fontSize) {
    case FONT_SIZES.SMALL:
      return '0.875'
    case FONT_SIZES.LARGE:
      return '1.125'
    case FONT_SIZES.EXTRA_LARGE:
      return '1.25'
    default:
      return '1'
  }
}

// Load preferences from storage
function loadPreferences() {
  if (typeof window === 'undefined') return initialState
  
  try {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME) || THEMES.SYSTEM
    const fontSize = localStorage.getItem(STORAGE_KEYS.FONT_SIZE) || FONT_SIZES.MEDIUM
    const reducedMotion = localStorage.getItem(STORAGE_KEYS.REDUCED_MOTION) === 'true' || getSystemReducedMotion()
    const highContrast = localStorage.getItem(STORAGE_KEYS.HIGH_CONTRAST) === 'true' || getSystemHighContrast()
    
    const actualTheme = theme === THEMES.SYSTEM ? getSystemTheme() : theme
    
    return {
      theme,
      actualTheme,
      fontSize,
      reducedMotion,
      highContrast,
    }
  } catch (error) {
    console.error('Error loading theme preferences:', error)
    return {
      ...initialState,
      actualTheme: getSystemTheme(),
    }
  }
}

// Save preferences to storage
function savePreferences(state) {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, state.theme)
    localStorage.setItem(STORAGE_KEYS.FONT_SIZE, state.fontSize)
    localStorage.setItem(STORAGE_KEYS.REDUCED_MOTION, state.reducedMotion.toString())
    localStorage.setItem(STORAGE_KEYS.HIGH_CONTRAST, state.highContrast.toString())
  } catch (error) {
    console.error('Error saving theme preferences:', error)
  }
}

// Theme provider component
export function ThemeProvider({ children }) {
  const [state, dispatch] = useReducer(themeReducer, initialState, loadPreferences)

  // Set theme
  const setTheme = (theme) => {
    const actualTheme = theme === THEMES.SYSTEM ? getSystemTheme() : theme
    
    dispatch({
      type: THEME_ACTIONS.SET_THEME,
      payload: { theme, actualTheme },
    })
  }

  // Toggle between light and dark theme
  const toggleTheme = () => {
    dispatch({ type: THEME_ACTIONS.TOGGLE_THEME })
  }

  // Set font size
  const setFontSize = (fontSize) => {
    dispatch({
      type: THEME_ACTIONS.SET_FONT_SIZE,
      payload: fontSize,
    })
  }

  // Set reduced motion preference
  const setReducedMotion = (reducedMotion) => {
    dispatch({
      type: THEME_ACTIONS.SET_REDUCED_MOTION,
      payload: reducedMotion,
    })
  }

  // Set high contrast preference
  const setHighContrast = (highContrast) => {
    dispatch({
      type: THEME_ACTIONS.SET_HIGH_CONTRAST,
      payload: highContrast,
    })
  }

  // Reset all preferences to defaults
  const resetPreferences = () => {
    dispatch({ type: THEME_ACTIONS.RESET_PREFERENCES })
  }

  // Listen for system theme changes
  useEffect(() => {
    if (state.theme !== THEMES.SYSTEM) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const handleChange = (e) => {
      const actualTheme = e.matches ? THEMES.DARK : THEMES.LIGHT
      dispatch({
        type: THEME_ACTIONS.SET_THEME,
        payload: { theme: THEMES.SYSTEM, actualTheme },
      })
    }

    mediaQuery.addEventListener('change', handleChange)
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [state.theme])

  // Listen for system reduced motion changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    
    const handleChange = (e) => {
      if (localStorage.getItem(STORAGE_KEYS.REDUCED_MOTION) === null) {
        setReducedMotion(e.matches)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  // Listen for system high contrast changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: high)')
    
    const handleChange = (e) => {
      if (localStorage.getItem(STORAGE_KEYS.HIGH_CONTRAST) === null) {
        setHighContrast(e.matches)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  // Apply theme changes to document
  useEffect(() => {
    applyThemeToDocument(state.actualTheme, state.fontSize, state.reducedMotion, state.highContrast)
    savePreferences(state)
  }, [state])

  // Initialize theme on mount
  useEffect(() => {
    applyThemeToDocument(state.actualTheme, state.fontSize, state.reducedMotion, state.highContrast)
  }, [])

  const value = {
    ...state,
    setTheme,
    toggleTheme,
    setFontSize,
    setReducedMotion,
    setHighContrast,
    resetPreferences,
    isSystemTheme: state.theme === THEMES.SYSTEM,
    isDarkMode: state.actualTheme === THEMES.DARK,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

// Custom hook to use theme context
export function useTheme() {
  const context = useContext(ThemeContext)
  
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  
  return context
}