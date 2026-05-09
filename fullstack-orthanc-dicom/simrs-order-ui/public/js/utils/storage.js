/**
 * Storage Utilities Module
 * 
 * This module provides utility functions for localStorage operations with
 * error handling, data validation, and type safety. It abstracts away
 * the complexity of localStorage operations and provides a consistent API.
 * 
 * @version 1.0.0
 * @author SIMRS Order UI Team
 */

import { APP_CONFIG } from '../config/constants.js';

/**
 * Storage utility class for localStorage operations
 */
class StorageUtil {
  /**
   * Check if localStorage is available
   * @returns {boolean} - Whether localStorage is available
   */
  static isAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (error) {
      console.warn('localStorage is not available:', error);
      return false;
    }
  }

  /**
   * Get item from localStorage with error handling
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default value if key doesn't exist
   * @returns {*} - Stored value or default value
   */
  static getItem(key, defaultValue = null) {
    if (!this.isAvailable() || !key) {
      return defaultValue;
    }

    try {
      const item = localStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }
      
      // Try to parse as JSON, if it fails return the raw string
      try {
        return JSON.parse(item);
      } catch (parseError) {
        // If JSON parsing fails, return the raw string (useful for JWT tokens)
        return item;
      }
    } catch (error) {
      console.warn(`Failed to get item '${key}' from localStorage:`, error);
      return defaultValue;
    }
  }

  /**
   * Set item in localStorage with error handling
   * @param {string} key - Storage key
   * @param {*} value - Value to store
   * @returns {boolean} - Success status
   */
  static setItem(key, value) {
    if (!this.isAvailable() || !key) {
      return false;
    }

    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Failed to set item '${key}' in localStorage:`, error);
      return false;
    }
  }

  /**
   * Remove item from localStorage
   * @param {string} key - Storage key
   * @returns {boolean} - Success status
   */
  static removeItem(key) {
    if (!this.isAvailable() || !key) {
      return false;
    }

    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`Failed to remove item '${key}' from localStorage:`, error);
      return false;
    }
  }

  /**
   * Clear all items from localStorage
   * @returns {boolean} - Success status
   */
  static clear() {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
      return false;
    }
  }

  /**
   * Check if key exists in localStorage
   * @param {string} key - Storage key
   * @returns {boolean} - Whether key exists
   */
  static hasItem(key) {
    if (!this.isAvailable() || !key) {
      return false;
    }

    try {
      return localStorage.getItem(key) !== null;
    } catch (error) {
      console.warn(`Failed to check item '${key}' in localStorage:`, error);
      return false;
    }
  }

  /**
   * Get all keys from localStorage
   * @returns {string[]} - Array of keys
   */
  static getKeys() {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      return Object.keys(localStorage);
    } catch (error) {
      console.warn('Failed to get keys from localStorage:', error);
      return [];
    }
  }

  /**
   * Get storage size in bytes (approximate)
   * @returns {number} - Storage size in bytes
   */
  static getSize() {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      let total = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += localStorage[key].length + key.length;
        }
      }
      return total;
    } catch (error) {
      console.warn('Failed to calculate localStorage size:', error);
      return 0;
    }
  }
}

/**
 * Authentication token management
 */
export const AuthStorage = {
  /**
   * Get authentication token
   * @returns {string|null} - Auth token or null
   */
  getToken() {
    return StorageUtil.getItem(APP_CONFIG.AUTH.TOKEN_KEY, null);
  },

  /**
   * Set authentication token
   * @param {string} token - Auth token
   * @returns {boolean} - Success status
   */
  setToken(token) {
    if (!token || typeof token !== 'string') {
      return false;
    }
    return StorageUtil.setItem(APP_CONFIG.AUTH.TOKEN_KEY, token);
  },

  /**
   * Remove authentication token
   * @returns {boolean} - Success status
   */
  removeToken() {
    return StorageUtil.removeItem(APP_CONFIG.AUTH.TOKEN_KEY);
  },

  /**
   * Get user data from localStorage
   * @returns {Object|null} - User data or null
   */
  getUser() {
    return StorageUtil.getItem('simrs_user_data', null);
  },

  /**
   * Set user data in localStorage
   * @param {Object} user - User data
   * @returns {boolean} - Success status
   */
  setUser(user) {
    if (!user || typeof user !== 'object') {
      return false;
    }
    return StorageUtil.setItem('simrs_user_data', user);
  },

  /**
   * Remove user data from localStorage
   * @returns {boolean} - Success status
   */
  removeUser() {
    return StorageUtil.removeItem('simrs_user_data');
  },

  /**
   * Get login time
   * @returns {string|null} - Login timestamp or null
   */
  getLoginTime() {
    return StorageUtil.getItem('simrs_login_time', null);
  },

  /**
   * Set login time
   * @param {string} timestamp - Login timestamp
   * @returns {boolean} - Success status
   */
  setLoginTime(timestamp) {
    return StorageUtil.setItem('simrs_login_time', timestamp);
  },

  /**
   * Remove login time
   * @returns {boolean} - Success status
   */
  removeLoginTime() {
    return StorageUtil.removeItem('simrs_login_time');
  },

  /**
   * Check if user is authenticated
   * @returns {boolean} - Whether user has valid token
   */
  isAuthenticated() {
    const token = this.getToken();
    return token && token.length > 0;
  },

  /**
   * Clear all authentication data
   * @returns {boolean} - Success status
   */
  clearAll() {
    const tokenRemoved = this.removeToken();
    const userRemoved = this.removeUser();
    const timeRemoved = this.removeLoginTime();
    return tokenRemoved && userRemoved && timeRemoved;
  },
};

/**
 * Cache management for SATUSEHAT locations
 */
export const LocationCache = {
  /**
   * Get cached locations
   * @returns {Array} - Array of locations
   */
  getLocations() {
    return StorageUtil.getItem(APP_CONFIG.CACHE.LOCATIONS_KEY, []);
  },

  /**
   * Set cached locations
   * @param {Array} locations - Array of locations
   * @returns {boolean} - Success status
   */
  setLocations(locations) {
    if (!Array.isArray(locations)) {
      return false;
    }

    const success = StorageUtil.setItem(APP_CONFIG.CACHE.LOCATIONS_KEY, locations);
    
    if (success) {
      // Update metadata
      const meta = {
        timestamp: Date.now(),
        version: APP_CONFIG.CACHE.CACHE_VERSION,
        count: locations.length,
      };
      StorageUtil.setItem(APP_CONFIG.CACHE.LOCATIONS_META_KEY, meta);
    }

    return success;
  },

  /**
   * Get cache metadata
   * @returns {Object} - Cache metadata
   */
  getMeta() {
    return StorageUtil.getItem(APP_CONFIG.CACHE.LOCATIONS_META_KEY, {});
  },

  /**
   * Get cache age in milliseconds
   * @returns {number} - Cache age in milliseconds
   */
  getCacheAge() {
    const meta = this.getMeta();
    return meta.timestamp ? Date.now() - meta.timestamp : 0;
  },

  /**
   * Get human-readable cache age
   * @returns {string} - Human-readable cache age
   */
  getCacheAgeString() {
    const ageMs = this.getCacheAge();
    const ageMinutes = Math.floor(ageMs / (1000 * 60));
    const ageHours = Math.floor(ageMinutes / 60);
    
    if (ageHours > 0) {
      return `${ageHours} jam yang lalu`;
    } else if (ageMinutes > 0) {
      return `${ageMinutes} menit yang lalu`;
    } else {
      return "baru saja";
    }
  },

  /**
   * Check if cache is valid (not too old)
   * @param {number} maxAgeMs - Maximum age in milliseconds
   * @returns {boolean} - Whether cache is valid
   */
  isValid(maxAgeMs = 24 * 60 * 60 * 1000) { // Default: 24 hours
    return this.getCacheAge() < maxAgeMs;
  },

  /**
   * Check if cache is expired
   * @param {number} maxAgeMs - Maximum age in milliseconds
   * @returns {boolean} - Whether cache is expired
   */
  isExpired(maxAgeMs = 24 * 60 * 60 * 1000) { // Default: 24 hours
    return this.getCacheAge() >= maxAgeMs;
  },

  /**
   * Clear location cache
   * @returns {boolean} - Success status
   */
  clear() {
    const success1 = StorageUtil.removeItem(APP_CONFIG.CACHE.LOCATIONS_KEY);
    const success2 = StorageUtil.removeItem(APP_CONFIG.CACHE.LOCATIONS_META_KEY);
    return success1 && success2;
  },
};

/**
 * Suggestions management for form inputs
 */
export const SuggestionsCache = {
  /**
   * Save suggestion for a specific key
   * @param {string} key - Suggestion key
   * @param {string} value - Suggestion value
   * @param {number} max - Maximum number of suggestions to keep
   * @returns {boolean} - Success status
   */
  saveSuggestion(key, value, max = APP_CONFIG.CACHE.SUGGESTIONS_MAX) {
    if (!key || !value || typeof value !== 'string') {
      return false;
    }

    const suggestions = this.getSuggestions(key);
    const filtered = suggestions.filter(v => v !== value);
    filtered.unshift(value);
    
    return StorageUtil.setItem(key, filtered.slice(0, max));
  },

  /**
   * Get suggestions for a specific key
   * @param {string} key - Suggestion key
   * @returns {Array} - Array of suggestions
   */
  getSuggestions(key) {
    if (!key) {
      return [];
    }
    return StorageUtil.getItem(key, []);
  },

  /**
   * Clear suggestions for a specific key
   * @param {string} key - Suggestion key
   * @returns {boolean} - Success status
   */
  clearSuggestions(key) {
    if (!key) {
      return false;
    }
    return StorageUtil.removeItem(key);
  },

  /**
   * Get all suggestions from localStorage
   * @returns {Object} - Object containing all suggestion keys and their values
   */
  getAllSuggestions() {
    const allSuggestions = {};
    
    try {
      // Get all keys from localStorage
      const keys = StorageUtil.getKeys();
      
      // Filter keys that are likely suggestion keys (you can customize this logic)
      const suggestionKeys = keys.filter(key => 
        key.includes('suggestion') || 
        key.includes('autocomplete') ||
        key.includes('search_history') ||
        key.startsWith('simrs_suggestions_')
      );
      
      // Get suggestions for each key
      suggestionKeys.forEach(key => {
        const suggestions = this.getSuggestions(key);
        if (suggestions && suggestions.length > 0) {
          allSuggestions[key] = suggestions;
        }
      });
      
      return allSuggestions;
    } catch (error) {
      console.warn('Failed to get all suggestions:', error);
      return {};
    }
  },

  /**
   * Clear all suggestions from localStorage
   * @returns {boolean} - Success status
   */
  clearAllSuggestions() {
    try {
      const keys = StorageUtil.getKeys();
      const suggestionKeys = keys.filter(key => 
        key.includes('suggestion') || 
        key.includes('autocomplete') ||
        key.includes('search_history') ||
        key.startsWith('simrs_suggestions_')
      );
      
      let success = true;
      suggestionKeys.forEach(key => {
        if (!this.clearSuggestions(key)) {
          success = false;
        }
      });
      
      return success;
    } catch (error) {
      console.warn('Failed to clear all suggestions:', error);
      return false;
    }
  },
};

/**
 * Registration sequence management
 */
export const RegistrationSequence = {
  /**
   * Get next sequence number for registration
   * @param {string} serviceType - Service type (RJ, RI, IGD)
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   * @returns {number} - Next sequence number
   */
  getNextSequence(serviceType, dateStr) {
    if (!serviceType || !dateStr) {
      return 1;
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return 1;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    
    const key = `${APP_CONFIG.REGISTRATION.SEQUENCE_KEY_PREFIX}${serviceType}_${year}${day}${month}`;
    const currentSeq = StorageUtil.getItem(key, 0);
    const nextSeq = currentSeq + 1;
    
    StorageUtil.setItem(key, nextSeq);
    return nextSeq;
  },

  /**
   * Reset sequence for a specific service type and date
   * @param {string} serviceType - Service type
   * @param {string} dateStr - Date string
   * @returns {boolean} - Success status
   */
  resetSequence(serviceType, dateStr) {
    if (!serviceType || !dateStr) {
      return false;
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return false;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    
    const key = `${APP_CONFIG.REGISTRATION.SEQUENCE_KEY_PREFIX}${serviceType}_${year}${day}${month}`;
    return StorageUtil.removeItem(key);
  },
};

// Export the main StorageUtil class and specialized utilities
export { StorageUtil };

export default {
  StorageUtil,
  AuthStorage,
  LocationCache,
  SuggestionsCache,
  RegistrationSequence,
};