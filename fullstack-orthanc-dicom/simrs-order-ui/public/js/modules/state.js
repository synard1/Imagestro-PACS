/**
 * State Management Module
 * 
 * This module provides a centralized state management system with event-driven
 * architecture for managing application state, data flow, and component communication.
 * It includes reactive state updates, event handling, and data persistence.
 * 
 * @version 1.0.0
 * @author SIMRS Order UI Team
 */

import { APP_CONFIG } from '../config/constants.js';
import { AuthStorage, LocationCache, SuggestionsCache, RegistrationSequence } from '../utils/storage.js';

/**
 * Event Emitter for state management
 */
class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    
    this.events.get(event).add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.events.get(event);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.events.delete(event);
        }
      }
    };
  }

  /**
   * Subscribe to an event once
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  once(event, callback) {
    const unsubscribe = this.on(event, (...args) => {
      unsubscribe();
      callback(...args);
    });
    return unsubscribe;
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {...any} args - Event arguments
   */
  emit(event, ...args) {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in event callback for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event
   * @param {string} event - Event name
   */
  off(event) {
    this.events.delete(event);
  }

  /**
   * Remove all listeners
   */
  clear() {
    this.events.clear();
  }

  /**
   * Get list of events
   * @returns {Array} - Array of event names
   */
  getEvents() {
    return Array.from(this.events.keys());
  }

  /**
   * Get number of listeners for an event
   * @param {string} event - Event name
   * @returns {number} - Number of listeners
   */
  listenerCount(event) {
    const callbacks = this.events.get(event);
    return callbacks ? callbacks.size : 0;
  }
}

/**
 * State Store class for managing application state
 */
class StateStore {
  constructor(initialState = {}) {
    this.state = { ...initialState };
    this.eventEmitter = new EventEmitter();
    this.middleware = [];
    this.history = [];
    this.maxHistorySize = 50;
  }

  /**
   * Get current state
   * @param {string} path - State path (optional)
   * @returns {any} - State value
   */
  getState(path = null) {
    if (!path) return { ...this.state };
    
    return path.split('.').reduce((obj, key) => {
      return obj && obj[key] !== undefined ? obj[key] : undefined;
    }, this.state);
  }

  /**
   * Set state
   * @param {string|Object} pathOrState - State path or state object
   * @param {any} value - Value to set (if path is string)
   * @param {boolean} silent - Skip event emission
   */
  setState(pathOrState, value = undefined, silent = false) {
    const prevState = { ...this.state };
    
    if (typeof pathOrState === 'string') {
      // Set specific path
      this._setNestedValue(this.state, pathOrState, value);
    } else {
      // Merge state object
      this.state = { ...this.state, ...pathOrState };
    }

    // Apply middleware
    this.middleware.forEach(middleware => {
      try {
        middleware(prevState, this.state);
      } catch (error) {
        console.error('Middleware error:', error);
      }
    });

    // Add to history
    this._addToHistory(prevState, this.state);

    // Emit events
    if (!silent) {
      this.eventEmitter.emit('state:change', this.state, prevState);
      
      if (typeof pathOrState === 'string') {
        this.eventEmitter.emit(`state:change:${pathOrState}`, value, this._getNestedValue(prevState, pathOrState));
      }
    }
  }

  /**
   * Subscribe to state changes
   * @param {string|Function} pathOrCallback - State path or callback function
   * @param {Function} callback - Callback function (if path is provided)
   * @returns {Function} - Unsubscribe function
   */
  subscribe(pathOrCallback, callback = null) {
    if (typeof pathOrCallback === 'function') {
      // Subscribe to all state changes
      return this.eventEmitter.on('state:change', pathOrCallback);
    } else {
      // Subscribe to specific path changes
      return this.eventEmitter.on(`state:change:${pathOrCallback}`, callback);
    }
  }

  /**
   * Add middleware
   * @param {Function} middleware - Middleware function
   */
  addMiddleware(middleware) {
    this.middleware.push(middleware);
  }

  /**
   * Remove middleware
   * @param {Function} middleware - Middleware function
   */
  removeMiddleware(middleware) {
    const index = this.middleware.indexOf(middleware);
    if (index > -1) {
      this.middleware.splice(index, 1);
    }
  }

  /**
   * Reset state
   * @param {Object} newState - New state
   */
  reset(newState = {}) {
    this.state = { ...newState };
    this.history = [];
    this.eventEmitter.emit('state:reset', this.state);
  }

  /**
   * Get state history
   * @returns {Array} - State history
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Set nested value in object
   * @private
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * Get nested value from object
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Add state change to history
   * @private
   */
  _addToHistory(prevState, newState) {
    this.history.push({
      timestamp: new Date().toISOString(),
      prevState: { ...prevState },
      newState: { ...newState },
    });

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }
}

/**
 * Application State Manager
 */
class AppStateManager {
  constructor() {
    this.store = new StateStore(this._getInitialState());
    this._setupMiddleware();
    this._setupPersistence();
    this._initializeState();
  }

  /**
   * Get initial state
   * @private
   */
  _getInitialState() {
    return {
      // Authentication state
      auth: {
        isAuthenticated: false,
        user: null,
        token: null,
        loginTime: null,
      },

      // Application state
      app: {
        isLoading: false,
        currentPage: 'login',
        config: null,
        error: null,
        notifications: [],
      },

      // UI state
      ui: {
        sidebarCollapsed: false,
        theme: 'light',
        language: 'id',
        modals: {},
        forms: {},
      },

      // Data state
      data: {
        patients: [],
        practitioners: [],
        locations: [],
        procedures: [],
        orders: [],
        activeOrder: null,
        suggestions: {},
      },

      // Cache state
      cache: {
        lastUpdated: {},
        expirationTimes: {},
      },
    };
  }

  /**
   * Setup middleware
   * @private
   */
  _setupMiddleware() {
    // Logging middleware
    this.store.addMiddleware((prevState, newState) => {
      if (APP_CONFIG.DEBUG_MODE) {
        console.log('State changed:', {
          prev: prevState,
          new: newState,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Validation middleware
    this.store.addMiddleware((prevState, newState) => {
      this._validateState(newState);
    });

    // Persistence middleware
    this.store.addMiddleware((prevState, newState) => {
      this._persistState(newState);
    });
  }

  /**
   * Setup state persistence
   * @private
   */
  _setupPersistence() {
    // Subscribe to auth changes for token persistence
    this.store.subscribe('auth', (authState) => {
      if (authState.token) {
        AuthStorage.setToken(authState.token);
        AuthStorage.setUser(authState.user);
      } else {
        AuthStorage.clearAuth();
      }
    });

    // Subscribe to UI preferences
    this.store.subscribe('ui.theme', (theme) => {
      localStorage.setItem('ui_theme', theme);
    });

    this.store.subscribe('ui.language', (language) => {
      localStorage.setItem('ui_language', language);
    });

    this.store.subscribe('ui.sidebarCollapsed', (collapsed) => {
      localStorage.setItem('ui_sidebar_collapsed', JSON.stringify(collapsed));
    });
  }

  /**
   * Initialize state from storage
   * @private
   */
  _initializeState() {
    // Restore auth state
    const token = AuthStorage.getToken();
    const user = AuthStorage.getUser();
    
    if (token && user) {
      this.store.setState('auth', {
        isAuthenticated: true,
        user,
        token,
        loginTime: AuthStorage.getLoginTime(),
      }, true);
    }

    // Restore UI preferences
    const theme = localStorage.getItem('ui_theme') || 'light';
    const language = localStorage.getItem('ui_language') || 'id';
    const sidebarCollapsed = JSON.parse(localStorage.getItem('ui_sidebar_collapsed') || 'false');

    this.store.setState('ui', {
      ...this.store.getState('ui'),
      theme,
      language,
      sidebarCollapsed,
    }, true);

    // Load cached data
    this._loadCachedData();
  }

  /**
   * Load cached data
   * @private
   */
  _loadCachedData() {
    // Load locations cache
    const locations = LocationCache.getLocations();
    if (locations.length > 0) {
      this.store.setState('data.locations', locations, true);
    }

    // Load suggestions cache
    const suggestions = SuggestionsCache.getAllSuggestions();
    this.store.setState('data.suggestions', suggestions, true);
  }

  /**
   * Validate state
   * @private
   */
  _validateState(state) {
    // Validate auth state
    if (state.auth && state.auth.isAuthenticated && !state.auth.token) {
      console.warn('Invalid auth state: authenticated but no token');
    }

    // Validate required data
    if (state.data) {
      if (state.data.activeOrder && !state.data.orders.find(o => o.id === state.data.activeOrder.id)) {
        console.warn('Active order not found in orders list');
      }
    }
  }

  /**
   * Persist state to storage
   * @private
   */
  _persistState(state) {
    // Cache locations
    if (state.data && state.data.locations && state.data.locations.length > 0) {
      LocationCache.setLocations(state.data.locations);
    }

    // Cache suggestions
    if (state.data && state.data.suggestions) {
      Object.entries(state.data.suggestions).forEach(([key, suggestions]) => {
        if (suggestions && suggestions.length > 0) {
          SuggestionsCache.setSuggestions(key, suggestions);
        }
      });
    }
  }

  /**
   * Get state
   * @param {string} path - State path
   * @returns {any} - State value
   */
  getState(path) {
    return this.store.getState(path);
  }

  /**
   * Set state
   * @param {string|Object} pathOrState - State path or state object
   * @param {any} value - Value to set
   */
  setState(pathOrState, value) {
    this.store.setState(pathOrState, value);
  }

  /**
   * Subscribe to state changes
   * @param {string|Function} pathOrCallback - State path or callback
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  subscribe(pathOrCallback, callback) {
    return this.store.subscribe(pathOrCallback, callback);
  }

  /**
   * Authentication actions
   */
  auth = {
    login: (user, token) => {
      this.setState('auth', {
        isAuthenticated: true,
        user,
        token,
        loginTime: new Date().toISOString(),
      });
      this.setState('app.currentPage', 'dashboard');
    },

    logout: () => {
      this.setState('auth', {
        isAuthenticated: false,
        user: null,
        token: null,
        loginTime: null,
      });
      this.setState('app.currentPage', 'login');
      this.setState('data.activeOrder', null);
    },

    updateUser: (user) => {
      this.setState('auth.user', user);
    },
  };

  /**
   * Application actions
   */
  app = {
    setLoading: (isLoading) => {
      this.setState('app.isLoading', isLoading);
    },

    setCurrentPage: (page) => {
      this.setState('app.currentPage', page);
    },

    setConfig: (config) => {
      this.setState('app.config', config);
    },

    setError: (error) => {
      this.setState('app.error', error);
    },

    clearError: () => {
      this.setState('app.error', null);
    },

    addNotification: (notification) => {
      const notifications = this.getState('app.notifications') || [];
      const newNotification = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...notification,
      };
      this.setState('app.notifications', [...notifications, newNotification]);
    },

    removeNotification: (id) => {
      const notifications = this.getState('app.notifications') || [];
      this.setState('app.notifications', notifications.filter(n => n.id !== id));
    },

    clearNotifications: () => {
      this.setState('app.notifications', []);
    },
  };

  /**
   * UI actions
   */
  ui = {
    toggleSidebar: () => {
      const collapsed = this.getState('ui.sidebarCollapsed');
      this.setState('ui.sidebarCollapsed', !collapsed);
    },

    setTheme: (theme) => {
      this.setState('ui.theme', theme);
    },

    setLanguage: (language) => {
      this.setState('ui.language', language);
    },

    openModal: (modalId, data = {}) => {
      const modals = this.getState('ui.modals') || {};
      this.setState('ui.modals', {
        ...modals,
        [modalId]: { isOpen: true, data },
      });
    },

    closeModal: (modalId) => {
      const modals = this.getState('ui.modals') || {};
      this.setState('ui.modals', {
        ...modals,
        [modalId]: { isOpen: false, data: {} },
      });
    },

    setFormData: (formId, data) => {
      const forms = this.getState('ui.forms') || {};
      this.setState('ui.forms', {
        ...forms,
        [formId]: data,
      });
    },

    clearFormData: (formId) => {
      const forms = this.getState('ui.forms') || {};
      const newForms = { ...forms };
      delete newForms[formId];
      this.setState('ui.forms', newForms);
    },
  };

  /**
   * Data actions
   */
  data = {
    setPatients: (patients) => {
      this.setState('data.patients', patients);
    },

    addPatient: (patient) => {
      const patients = this.getState('data.patients') || [];
      this.setState('data.patients', [...patients, patient]);
    },

    updatePatient: (patientId, updates) => {
      const patients = this.getState('data.patients') || [];
      const updatedPatients = patients.map(p => 
        p.id === patientId ? { ...p, ...updates } : p
      );
      this.setState('data.patients', updatedPatients);
    },

    setPractitioners: (practitioners) => {
      this.setState('data.practitioners', practitioners);
    },

    setLocations: (locations) => {
      this.setState('data.locations', locations);
    },

    setProcedures: (procedures) => {
      this.setState('data.procedures', procedures);
    },

    setOrders: (orders) => {
      this.setState('data.orders', orders);
    },

    addOrder: (order) => {
      const orders = this.getState('data.orders') || [];
      this.setState('data.orders', [...orders, order]);
    },

    updateOrder: (orderId, updates) => {
      const orders = this.getState('data.orders') || [];
      const updatedOrders = orders.map(o => 
        o.id === orderId ? { ...o, ...updates } : o
      );
      this.setState('data.orders', updatedOrders);
    },

    setActiveOrder: (order) => {
      this.setState('data.activeOrder', order);
    },

    setSuggestions: (key, suggestions) => {
      const currentSuggestions = this.getState('data.suggestions') || {};
      this.setState('data.suggestions', {
        ...currentSuggestions,
        [key]: suggestions,
      });
    },
  };

  /**
   * Reset application state
   */
  reset() {
    this.store.reset(this._getInitialState());
  }

  /**
   * Get state history
   */
  getHistory() {
    return this.store.getHistory();
  }

  /**
   * Export state for debugging
   */
  exportState() {
    return {
      state: this.getState(),
      history: this.getHistory(),
      timestamp: new Date().toISOString(),
    };
  }
}

// Create singleton instance
const appState = new AppStateManager();

// Export state management interface
export const State = {
  // Core methods
  getState: (path) => appState.getState(path),
  setState: (pathOrState, value) => appState.setState(pathOrState, value),
  subscribe: (pathOrCallback, callback) => appState.subscribe(pathOrCallback, callback),

  // Action groups
  auth: appState.auth,
  app: appState.app,
  ui: appState.ui,
  data: appState.data,

  // Utility methods
  reset: () => appState.reset(),
  getHistory: () => appState.getHistory(),
  exportState: () => appState.exportState(),
};

// Export classes for advanced usage
export { EventEmitter, StateStore, AppStateManager };

// Export singleton instance
export default State;