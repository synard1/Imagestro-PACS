/**
 * Theme Configuration Registry
 * 
 * This file contains all available themes for the Layout Theme System.
 * Each theme includes color schemes, icons, and styling properties.
 * 
 * Requirements: 2.1, 3.1, 3.2, 3.3
 */

import { 
  Briefcase, Building2, Heart, Stethoscope, Sparkles, Zap,
  // Professional theme icons
  LayoutDashboard, ClipboardList, ListTodo, FileText, Files, Database, Shield, HardDrive, Settings,
  // Medical theme icons
  Activity, HeartPulse, Clipboard, FileHeart, FolderHeart, Pill, ShieldCheck, Server, Cog,
  // Modern theme icons
  LayoutGrid, ListChecks, CheckSquare, FileCode, Layers, Boxes, Lock, Cloud, Sliders,
  // Dark theme icons
  Moon, Terminal, MonitorDot, FileTerminal, FolderClosed, CircuitBoard, ShieldAlert, HardDriveDownload, SlidersHorizontal,
  // Clinical theme icons
  Scan, ScanLine, MonitorCheck, FileCheck2, FolderOpen, Microscope, ShieldPlus, Database as DatabaseIcon, Wrench
} from 'lucide-react';

/**
 * Theme configuration interface:
 * - id: unique identifier for the theme
 * - name: display name
 * - description: brief description of the theme
 * - colors: complete color scheme including sidebar, header, button, and login colors
 * - icon: main theme icon component
 * - loginIcon: icon displayed on login page
 */

export const THEMES = {
  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'Clean blue theme for corporate environments',
    colors: {
      primary: '#1e40af',
      primaryDark: '#1e3a8a',
      accent: '#3b82f6',
      accentLight: '#93c5fd',
      sidebar: {
        bg: '#f8fafc',
        text: '#334155',
        activeItem: '#dbeafe',
        hoverItem: '#f1f5f9'
      },
      header: {
        bg: '#ffffff',
        text: '#1e293b'
      },
      button: {
        primary: '#2563eb',
        primaryHover: '#1d4ed8'
      },
      login: {
        bgGradientFrom: '#1e40af',
        bgGradientTo: '#3b82f6',
        cardBg: '#ffffff'
      }
    },
    icon: Briefcase,
    loginIcon: Building2,
    // Navigation icons for professional theme
    navIcons: {
      dashboard: LayoutDashboard,
      orders: ClipboardList,
      worklist: ListTodo,
      reports: FileText,
      studies: Files,
      masterData: Database,
      audit: Shield,
      storage: HardDrive,
      settings: Settings
    }
  },

  medical: {
    id: 'medical',
    name: 'Medical',
    description: 'Calming teal theme for healthcare settings',
    colors: {
      primary: '#0d9488',
      primaryDark: '#0f766e',
      accent: '#14b8a6',
      accentLight: '#5eead4',
      sidebar: {
        bg: '#f0fdfa',
        text: '#134e4a',
        activeItem: '#ccfbf1',
        hoverItem: '#f0fdfa'
      },
      header: {
        bg: '#ffffff',
        text: '#134e4a'
      },
      button: {
        primary: '#0d9488',
        primaryHover: '#0f766e'
      },
      login: {
        bgGradientFrom: '#0d9488',
        bgGradientTo: '#14b8a6',
        cardBg: '#ffffff'
      }
    },
    icon: Heart,
    loginIcon: Stethoscope,
    // Navigation icons for medical theme
    navIcons: {
      dashboard: HeartPulse,
      orders: Clipboard,
      worklist: Activity,
      reports: FileHeart,
      studies: FolderHeart,
      masterData: Pill,
      audit: ShieldCheck,
      storage: Server,
      settings: Cog
    }
  },

  modern: {
    id: 'modern',
    name: 'Modern',
    description: 'Vibrant purple theme for modern applications',
    colors: {
      primary: '#7c3aed',
      primaryDark: '#6d28d9',
      accent: '#a78bfa',
      accentLight: '#c4b5fd',
      sidebar: {
        bg: '#faf5ff',
        text: '#4c1d95',
        activeItem: '#ede9fe',
        hoverItem: '#f5f3ff'
      },
      header: {
        bg: '#ffffff',
        text: '#4c1d95'
      },
      button: {
        primary: '#7c3aed',
        primaryHover: '#6d28d9'
      },
      login: {
        bgGradientFrom: '#7c3aed',
        bgGradientTo: '#a78bfa',
        cardBg: '#ffffff'
      }
    },
    icon: Sparkles,
    loginIcon: Zap,
    // Navigation icons for modern theme
    navIcons: {
      dashboard: LayoutGrid,
      orders: ListChecks,
      worklist: CheckSquare,
      reports: FileCode,
      studies: Layers,
      masterData: Boxes,
      audit: Lock,
      storage: Cloud,
      settings: Sliders
    }
  },

  dark: {
    id: 'dark',
    name: 'Dark',
    description: 'Sleek dark theme for low-light environments',
    colors: {
      primary: '#60a5fa',
      primaryDark: '#3b82f6',
      accent: '#93c5fd',
      accentLight: '#1e3a5f',
      sidebar: {
        bg: '#0f172a',
        text: '#94a3b8',
        activeItem: '#1e293b',
        hoverItem: '#1e293b'
      },
      header: {
        bg: '#1e293b',
        text: '#e2e8f0'
      },
      button: {
        primary: '#3b82f6',
        primaryHover: '#2563eb'
      },
      login: {
        bgGradientFrom: '#0f172a',
        bgGradientTo: '#1e293b',
        cardBg: '#1e293b'
      }
    },
    icon: Moon,
    loginIcon: Terminal,
    // Navigation icons for dark theme
    navIcons: {
      dashboard: MonitorDot,
      orders: FileTerminal,
      worklist: ListChecks,
      reports: FileTerminal,
      studies: FolderClosed,
      masterData: CircuitBoard,
      audit: ShieldAlert,
      storage: HardDriveDownload,
      settings: SlidersHorizontal
    }
  },

  clinical: {
    id: 'clinical',
    name: 'Clinical',
    description: 'Professional blue-gray theme for clinical and radiology environments',
    colors: {
      primary: '#0f766e',
      primaryDark: '#115e59',
      accent: '#14b8a6',
      accentLight: '#99f6e4',
      sidebar: {
        bg: '#f8fafc',
        text: '#334155',
        activeItem: '#e0f2fe',
        hoverItem: '#f1f5f9'
      },
      header: {
        bg: '#ffffff',
        text: '#1e293b'
      },
      button: {
        primary: '#0891b2',
        primaryHover: '#0e7490'
      },
      login: {
        bgGradientFrom: '#0f766e',
        bgGradientTo: '#0891b2',
        cardBg: '#ffffff'
      }
    },
    icon: Scan,
    loginIcon: ScanLine,
    // Navigation icons for clinical theme
    navIcons: {
      dashboard: MonitorCheck,
      orders: ClipboardList,
      worklist: ListChecks,
      reports: FileCheck2,
      studies: FolderOpen,
      masterData: Microscope,
      audit: ShieldPlus,
      storage: DatabaseIcon,
      settings: Wrench
    }
  }
};

// Default theme ID
export const DEFAULT_THEME_ID = 'professional';

// Storage key for theme preference
export const THEME_STORAGE_KEY = 'app_theme_preference';

/**
 * Get the default theme ID from environment variable or fallback to hardcoded default
 * Environment variable: VITE_DEFAULT_THEME
 * @returns {string} Theme ID to use as default
 */
export const getEnvDefaultTheme = () => {
  const envTheme = import.meta.env.VITE_DEFAULT_THEME;
  if (envTheme && isValidThemeId(envTheme)) {
    return envTheme;
  }
  return DEFAULT_THEME_ID;
};

/**
 * Get the initial theme ID considering environment and defaults
 * Priority: environment variable > hardcoded default
 * @returns {string} Theme ID to use as initial/default
 */
export const getInitialThemeId = () => {
  return getEnvDefaultTheme();
};

/**
 * Get all available themes as an array
 * @returns {Array} Array of theme configurations
 */
export const getThemesList = () => Object.values(THEMES);

/**
 * Get theme by ID
 * @param {string} themeId - The theme identifier
 * @returns {Object|null} Theme configuration or null if not found
 */
export const getThemeById = (themeId) => THEMES[themeId] || null;

/**
 * Get all theme IDs
 * @returns {Array<string>} Array of theme identifiers
 */
export const getThemeIds = () => Object.keys(THEMES);

/**
 * Check if a theme ID is valid
 * @param {string} themeId - The theme identifier to validate
 * @returns {boolean} True if theme exists
 */
export const isValidThemeId = (themeId) => themeId in THEMES;

/**
 * Get the default theme configuration
 * @returns {Object} Default theme configuration
 */
export const getDefaultTheme = () => THEMES[DEFAULT_THEME_ID];

/**
 * Validate that a theme has all required properties
 * @param {Object} theme - Theme configuration to validate
 * @returns {boolean} True if theme has all required properties
 */
export const isThemeComplete = (theme) => {
  if (!theme || typeof theme !== 'object') return false;
  
  const requiredProps = ['id', 'name', 'description', 'colors', 'icon', 'loginIcon'];
  const requiredColorProps = ['primary', 'primaryDark', 'accent', 'accentLight', 'sidebar', 'header', 'button', 'login'];
  const requiredSidebarProps = ['bg', 'text', 'activeItem', 'hoverItem'];
  const requiredHeaderProps = ['bg', 'text'];
  const requiredButtonProps = ['primary', 'primaryHover'];
  const requiredLoginProps = ['bgGradientFrom', 'bgGradientTo', 'cardBg'];
  
  // Check top-level properties
  for (const prop of requiredProps) {
    if (!(prop in theme)) return false;
  }
  
  // Check colors object
  const { colors } = theme;
  if (!colors || typeof colors !== 'object') return false;
  
  for (const prop of requiredColorProps) {
    if (!(prop in colors)) return false;
  }
  
  // Check nested color objects
  for (const prop of requiredSidebarProps) {
    if (!(prop in colors.sidebar)) return false;
  }
  
  for (const prop of requiredHeaderProps) {
    if (!(prop in colors.header)) return false;
  }
  
  for (const prop of requiredButtonProps) {
    if (!(prop in colors.button)) return false;
  }
  
  for (const prop of requiredLoginProps) {
    if (!(prop in colors.login)) return false;
  }
  
  return true;
};

/**
 * Convert theme colors to CSS variables object
 * @param {Object} theme - Theme configuration
 * @returns {Object} Object with CSS variable names and values
 */
export const themeToCssVariables = (theme) => {
  if (!theme || !theme.colors) return {};
  
  const { colors } = theme;
  
  return {
    '--theme-primary': colors.primary,
    '--theme-primary-dark': colors.primaryDark,
    '--theme-accent': colors.accent,
    '--theme-accent-light': colors.accentLight,
    '--theme-sidebar-bg': colors.sidebar.bg,
    '--theme-sidebar-text': colors.sidebar.text,
    '--theme-sidebar-active': colors.sidebar.activeItem,
    '--theme-sidebar-hover': colors.sidebar.hoverItem,
    '--theme-header-bg': colors.header.bg,
    '--theme-header-text': colors.header.text,
    '--theme-button-primary': colors.button.primary,
    '--theme-button-primary-hover': colors.button.primaryHover,
    '--theme-login-gradient-from': colors.login.bgGradientFrom,
    '--theme-login-gradient-to': colors.login.bgGradientTo,
    '--theme-login-card-bg': colors.login.cardBg
  };
};

/**
 * Get navigation icon for a specific menu item based on current theme
 * @param {Object} theme - Current theme configuration
 * @param {string} iconKey - Key for the navigation icon (dashboard, orders, worklist, etc.)
 * @param {React.ComponentType} fallbackIcon - Fallback icon if theme icon not found
 * @returns {React.ComponentType} Icon component
 */
export const getNavIcon = (theme, iconKey, fallbackIcon) => {
  if (!theme || !theme.navIcons || !theme.navIcons[iconKey]) {
    return fallbackIcon;
  }
  return theme.navIcons[iconKey];
};

/**
 * Navigation icon key mapping for menu labels
 * Maps menu labels to their corresponding navIcon keys
 */
export const NAV_ICON_KEYS = {
  'Dashboard': 'dashboard',
  'Orders': 'orders',
  'Worklist': 'worklist',
  'Reports (PDF)': 'reports',
  'Studies': 'studies',
  'Master Data': 'masterData',
  'Audit Logs': 'audit',
  'Auth Audit Logs': 'audit',
  'Storage Management': 'storage',
  'Settings': 'settings',
  'Tools': 'settings'
};

export default THEMES;
