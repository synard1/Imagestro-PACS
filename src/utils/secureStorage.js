/**
 * Secure LocalStorage Helper
 * Provides safe methods for storing and retrieving data from localStorage
 * with automatic sanitization and validation
 */

import { sanitizeObject, ORDER_FIELD_TYPES } from './security';

/**
 * Safely get data from localStorage with sanitization
 * @param {string} key - LocalStorage key
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {any} Sanitized data or default value
 */
export const getSecureItem = (key, defaultValue = null) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    
    const parsed = JSON.parse(raw);
    
    // Validate structure for known keys
    if (key === 'orders_offline' && !Array.isArray(parsed)) {
      console.error('[SecureStorage] Invalid structure for orders_offline, expected array');
      return defaultValue;
    }
    
    // Sanitize the data
    if (typeof parsed === 'object' && parsed !== null) {
      return Array.isArray(parsed)
        ? parsed.map(item => sanitizeObject(item, ORDER_FIELD_TYPES))
        : sanitizeObject(parsed, ORDER_FIELD_TYPES);
    }
    
    return parsed;
  } catch (error) {
    console.error(`[SecureStorage] Failed to get item "${key}":`, error);
    return defaultValue;
  }
};

/**
 * Safely set data to localStorage with sanitization
 * @param {string} key - LocalStorage key
 * @param {any} value - Value to store
 * @returns {boolean} Success status
 */
export const setSecureItem = (key, value) => {
  try {
    // Sanitize before storing
    const sanitized = typeof value === 'object' && value !== null
      ? Array.isArray(value)
        ? value.map(item => sanitizeObject(item, ORDER_FIELD_TYPES))
        : sanitizeObject(value, ORDER_FIELD_TYPES)
      : value;
    
    const serialized = JSON.stringify(sanitized);
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    console.error(`[SecureStorage] Failed to set item "${key}":`, error);
    return false;
  }
};

/**
 * Safely remove item from localStorage
 * @param {string} key - LocalStorage key
 * @returns {boolean} Success status
 */
export const removeSecureItem = (key) => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`[SecureStorage] Failed to remove item "${key}":`, error);
    return false;
  }
};

/**
 * Get offline orders with validation and sanitization
 * @returns {Array} Array of sanitized offline orders
 */
export const getOfflineOrders = () => {
  return getSecureItem('orders_offline', []);
};

/**
 * Set offline orders with validation and sanitization
 * @param {Array} orders - Array of orders to store
 * @returns {boolean} Success status
 */
export const setOfflineOrders = (orders) => {
  if (!Array.isArray(orders)) {
    console.error('[SecureStorage] setOfflineOrders expects an array');
    return false;
  }
  
  return setSecureItem('orders_offline', orders);
};

/**
 * Update a single offline order
 * @param {string} orderId - Order ID to update
 * @param {Object} updates - Updates to apply
 * @returns {Object|null} Updated order or null if not found
 */
export const updateOfflineOrder = (orderId, updates) => {
  const orders = getOfflineOrders();
  const index = orders.findIndex(o => o.id === orderId);
  
  if (index === -1) {
    console.warn(`[SecureStorage] Order ${orderId} not found in offline storage`);
    return null;
  }
  
  // Merge updates with existing order
  orders[index] = {
    ...orders[index],
    ...sanitizeObject(updates, ORDER_FIELD_TYPES)
  };
  
  // Save back to localStorage
  setOfflineOrders(orders);
  
  return orders[index];
};

/**
 * Add a new offline order
 * @param {Object} order - Order to add
 * @returns {boolean} Success status
 */
export const addOfflineOrder = (order) => {
  const orders = getOfflineOrders();
  const sanitizedOrder = sanitizeObject(order, ORDER_FIELD_TYPES);
  
  orders.push(sanitizedOrder);
  return setOfflineOrders(orders);
};

/**
 * Remove an offline order
 * @param {string} orderId - Order ID to remove
 * @returns {boolean} Success status
 */
export const removeOfflineOrder = (orderId) => {
  const orders = getOfflineOrders();
  const filtered = orders.filter(o => o.id !== orderId);
  
  return setOfflineOrders(filtered);
};

/**
 * Check if an order exists in offline storage
 * @param {string} orderId - Order ID to check
 * @returns {boolean} True if order exists
 */
export const isOfflineOrder = (orderId) => {
  const orders = getOfflineOrders();
  return orders.some(o => o.id === orderId);
};
