/**
 * Dashboard Configuration
 * Centralized configuration for dashboard features and settings
 */

// Helper function to parse boolean environment variables
const parseBooleanEnv = (value, defaultValue = false) => {
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true'
  }
  return defaultValue
}

// Helper function to parse number environment variables
const parseNumberEnv = (value, defaultValue = 0) => {
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

// Helper function to parse float environment variables
const parseFloatEnv = (value, defaultValue = 0.0) => {
  const parsed = parseFloat(value)
  return isNaN(parsed) ? defaultValue : parsed
}

// Environment variable helper function
const getEnvBoolean = (key, defaultValue = false) => {
  const value = import.meta.env[key]
  if (value === undefined) return defaultValue
  return value === 'true' || value === true
}

const getEnvNumber = (key, defaultValue = 0) => {
  const value = import.meta.env[key]
  if (value === undefined) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

// Dashboard configuration object
export const dashboardConfig = {
  // Feature toggles
  features: {
    // Enable/disable statistics cards section
    enableStats: getEnvBoolean('VITE_DASHBOARD_ENABLE_STATS', true),
    
    // Enable/disable services section
    enableServices: getEnvBoolean('VITE_DASHBOARD_ENABLE_SERVICES', true),
    
    // Enable/disable recent activity section
    enableRecentActivity: getEnvBoolean('VITE_DASHBOARD_ENABLE_RECENT_ACTIVITY', true),
    
    // Enable/disable quick actions section
    enableQuickActions: getEnvBoolean('VITE_DASHBOARD_ENABLE_QUICK_ACTIONS', true),
    
    // Enable/disable API test component (for debugging)
    enableApiTest: getEnvBoolean('VITE_DASHBOARD_ENABLE_API_TEST', false),
  },

  // Mock data configuration
  mockData: {
    enabled: getEnvBoolean('VITE_USE_MOCK_DATA', false),
    fallbackEnabled: getEnvBoolean('VITE_FALLBACK_TO_MOCK', true),
    simulateDelay: getEnvBoolean('VITE_MOCK_API_DELAY', true),
    errorRate: parseFloatEnv(import.meta.env.VITE_MOCK_ERROR_RATE, 0.05),
    debugMode: getEnvBoolean('VITE_DEBUG_MODE', false)
  },

  // Data loading settings
  dataLoading: {
    // Auto-refresh interval for statistics (in milliseconds) - 5 minutes to prevent server overload
    statsRefreshInterval: getEnvNumber('VITE_DASHBOARD_STATS_REFRESH_INTERVAL', 300000),
    
    // Maximum number of recent activity items to display
    activityLimit: getEnvNumber('VITE_DASHBOARD_ACTIVITY_LIMIT', 10),
    
    // Enable/disable automatic data refresh
    enableAutoRefresh: getEnvBoolean('VITE_DASHBOARD_ENABLE_AUTO_REFRESH', false),
  },

  // UI settings
  ui: {
    // Show loading skeletons
    showLoadingSkeletons: getEnvBoolean('VITE_DASHBOARD_SHOW_LOADING_SKELETONS', true),
    
    // Animation settings
    enableAnimations: getEnvBoolean('VITE_DASHBOARD_ENABLE_ANIMATIONS', true),
    
    // Grid layout settings
    statsGridCols: {
      mobile: 1,
      tablet: 2,
      desktop: 4
    },
    
    servicesGridCols: {
      mobile: 1,
      tablet: 2,
      desktop: 3,
      large: 4
    }
  },

  // Debug and monitoring settings
  debug: {
    // Enable debug monitor component
    enableDebugMonitor: getEnvBoolean('VITE_DASHBOARD_ENABLE_DEBUG_MONITOR', false),
  },

  // Service cards configuration
  serviceCards: [
    {
      id: 'mwl',
      name: 'Modality Worklist',
      description: 'Manage DICOM worklist items and scheduling',
      icon: '📋',
      path: '/services/mwl',
      permission: 'mwl.read',
      color: 'bg-blue-500',
      enabled: getEnvBoolean('VITE_DASHBOARD_SERVICE_MWL_ENABLED', true),
    },
    {
      id: 'orthanc',
      name: 'Orthanc DICOM',
      description: 'View and manage DICOM studies and images',
      icon: '🏥',
      path: '/services/orthanc',
      permission: 'orthanc.read',
      color: 'bg-green-500',
      enabled: getEnvBoolean('VITE_DASHBOARD_SERVICE_ORTHANC_ENABLED', true),
    },
    {
      id: 'orders',
      name: 'Order Management',
      description: 'Create and track medical imaging orders',
      icon: '📝',
      path: '/services/orders',
      permission: 'orders.read',
      color: 'bg-purple-500',
      enabled: getEnvBoolean('VITE_DASHBOARD_SERVICE_ORDERS_ENABLED', true),
    },
    {
      id: 'users',
      name: 'User Management',
      description: 'Manage users, roles, and permissions',
      icon: '👥',
      path: '/users',
      permission: 'users.read',
      color: 'bg-orange-500',
      enabled: getEnvBoolean('VITE_DASHBOARD_SERVICE_USERS_ENABLED', true),
    },
  ],

  // Quick actions configuration
  quickActions: [
    {
      id: 'add-worklist',
      title: 'Add Worklist Item',
      description: 'Create new DICOM worklist entry',
      icon: '➕',
      to: '/services/mwl/create',
      permission: 'mwl.create',
      enabled: getEnvBoolean('VITE_DASHBOARD_ACTION_ADD_WORKLIST_ENABLED', true),
    },
    {
      id: 'new-order',
      title: 'New Order',
      description: 'Create medical imaging order',
      icon: '📝',
      to: '/services/orders/create',
      permission: 'orders.create',
      enabled: getEnvBoolean('VITE_DASHBOARD_ACTION_NEW_ORDER_ENABLED', true),
    },
    {
      id: 'add-user',
      title: 'Add User',
      description: 'Create new user account',
      icon: '👤',
      to: '/users/create',
      permission: 'users.create',
      enabled: getEnvBoolean('VITE_DASHBOARD_ACTION_ADD_USER_ENABLED', true),
    },
    {
      id: 'view-profile',
      title: 'View Profile',
      description: 'Update your profile settings',
      icon: '⚙️',
      to: '/profile',
      permission: null, // No permission required
      enabled: getEnvBoolean('VITE_DASHBOARD_ACTION_VIEW_PROFILE_ENABLED', true),
    },
  ],

  // Statistics configuration
  statistics: {
    // Define which statistics to show
    enabledStats: {
      totalUsers: getEnvBoolean('VITE_DASHBOARD_STAT_TOTAL_USERS_ENABLED', true),
      activeSessions: getEnvBoolean('VITE_DASHBOARD_STAT_ACTIVE_SESSIONS_ENABLED', true),
      dicomStudies: getEnvBoolean('VITE_DASHBOARD_STAT_DICOM_STUDIES_ENABLED', true),
      worklistItems: getEnvBoolean('VITE_DASHBOARD_STAT_WORKLIST_ITEMS_ENABLED', true),
    },
    
    // Show percentage changes
    showChanges: getEnvBoolean('VITE_DASHBOARD_STAT_SHOW_CHANGES', true),
  }
}

// Helper functions
export const isDashboardFeatureEnabled = (featureName) => {
  return dashboardConfig.features[featureName] || false
}

export const getEnabledServiceCards = () => {
  return dashboardConfig.serviceCards.filter(card => card.enabled)
}

export const getEnabledQuickActions = () => {
  return dashboardConfig.quickActions.filter(action => action.enabled)
}

export const getStatsRefreshInterval = () => {
  return dashboardConfig.dataLoading.statsRefreshInterval
}

export const getActivityLimit = () => {
  return dashboardConfig.dataLoading.activityLimit
}

/**
 * Check if mock data is enabled
 */
export function isMockDataEnabled() {
  return dashboardConfig.mockData.enabled
}

/**
 * Check if fallback to mock data is enabled
 */
export function isFallbackToMockEnabled() {
  return dashboardConfig.mockData.fallbackEnabled
}

/**
 * Get mock data configuration
 */
export function getMockDataConfig() {
  return dashboardConfig.mockData
}

/**
 * Check if debug mode is enabled
 */
export function isDebugModeEnabled() {
  return dashboardConfig.mockData.debugMode
}

// Development helper - log current configuration
if (import.meta.env.DEV) {
  if (process.env.NODE_ENV === 'development') {
  console.log('Dashboard Configuration:', dashboardConfig)
}
}

export default dashboardConfig