/**
 * DOM Utilities Module
 * 
 * This module provides utility functions for DOM manipulation, element selection,
 * and common UI operations. It abstracts away repetitive DOM operations and
 * provides a consistent API for interacting with the DOM.
 * 
 * @version 1.0.0
 * @author SIMRS Order UI Team
 */

import { APP_CONFIG } from '../config/constants.js';

/**
 * Query selector utility - selects a single element
 * @param {string} selector - CSS selector
 * @returns {Element|null} - Selected element or null
 */
export const qs = (selector) => {
  try {
    return document.querySelector(selector);
  } catch (error) {
    console.warn(`Invalid selector: ${selector}`, error);
    return null;
  }
};

/**
 * Query selector all utility - selects multiple elements
 * @param {string} selector - CSS selector
 * @returns {Element[]} - Array of selected elements
 */
export const qsa = (selector) => {
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch (error) {
    console.warn(`Invalid selector: ${selector}`, error);
    return [];
  }
};

/**
 * Set element value utility
 * @param {string} selector - CSS selector
 * @param {string} value - Value to set
 * @returns {boolean} - Success status
 */
export const setValue = (selector, value) => {
  try {
    const element = qs(selector);
    if (element) {
      element.value = value ?? "";
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to set value for ${selector}:`, error);
    return false;
  }
};

/**
 * Get element value utility
 * @param {string} selector - CSS selector
 * @returns {string} - Element value or empty string
 */
export const getValue = (selector) => {
  try {
    const element = qs(selector);
    return element?.value?.trim() || "";
  } catch (error) {
    console.warn(`Failed to get value for ${selector}:`, error);
    return "";
  }
};

/**
 * Set element text content
 * @param {string} selector - CSS selector
 * @param {string} text - Text content to set
 * @returns {boolean} - Success status
 */
export const setText = (selector, text) => {
  try {
    const element = qs(selector);
    if (element) {
      element.textContent = text ?? "";
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to set text for ${selector}:`, error);
    return false;
  }
};

/**
 * Set element HTML content
 * @param {string} selector - CSS selector
 * @param {string} html - HTML content to set
 * @returns {boolean} - Success status
 */
export const setHTML = (selector, html) => {
  try {
    const element = qs(selector);
    if (element) {
      element.innerHTML = html ?? "";
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to set HTML for ${selector}:`, error);
    return false;
  }
};

/**
 * Show/hide element utility
 * @param {string} selector - CSS selector
 * @param {boolean} show - Whether to show or hide
 * @returns {boolean} - Success status
 */
export const toggleVisibility = (selector, show) => {
  try {
    const element = qs(selector);
    if (element) {
      element.hidden = !show;
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to toggle visibility for ${selector}:`, error);
    return false;
  }
};

/**
 * Enable/disable element utility
 * @param {string} selector - CSS selector
 * @param {boolean} enabled - Whether to enable or disable
 * @returns {boolean} - Success status
 */
export const toggleEnabled = (selector, enabled) => {
  try {
    const element = qs(selector);
    if (element) {
      element.disabled = !enabled;
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to toggle enabled state for ${selector}:`, error);
    return false;
  }
};

/**
 * Add CSS class to element
 * @param {string} selector - CSS selector
 * @param {string} className - Class name to add
 * @returns {boolean} - Success status
 */
export const addClass = (selector, className) => {
  try {
    const element = qs(selector);
    if (element && className) {
      element.classList.add(className);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to add class ${className} to ${selector}:`, error);
    return false;
  }
};

/**
 * Remove CSS class from element
 * @param {string} selector - CSS selector
 * @param {string} className - Class name to remove
 * @returns {boolean} - Success status
 */
export const removeClass = (selector, className) => {
  try {
    const element = qs(selector);
    if (element && className) {
      element.classList.remove(className);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to remove class ${className} from ${selector}:`, error);
    return false;
  }
};

/**
 * Toggle CSS class on element
 * @param {string} selector - CSS selector
 * @param {string} className - Class name to toggle
 * @returns {boolean} - Success status
 */
export const toggleClass = (selector, className) => {
  try {
    const element = qs(selector);
    if (element && className) {
      element.classList.toggle(className);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to toggle class ${className} on ${selector}:`, error);
    return false;
  }
};

/**
 * Create and show toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type (info, success, error, warning)
 * @param {number} duration - Duration in milliseconds (optional)
 */
export const showToast = (message, type = APP_CONFIG.TOAST_TYPES.INFO, duration = APP_CONFIG.UI.TOAST_DURATION) => {
  try {
    const toast = qs("#toast");
    if (!toast) {
      console.warn("Toast element not found");
      return;
    }

    // Set message in the toast-message span or directly in toast if span doesn't exist
    const messageElement = qs("#toast-message") || toast;
    messageElement.textContent = message;

    // Set border color based on type
    const colors = {
      [APP_CONFIG.TOAST_TYPES.ERROR]: "#e74c3c",
      [APP_CONFIG.TOAST_TYPES.SUCCESS]: "#2ecc71",
      [APP_CONFIG.TOAST_TYPES.WARNING]: "#f39c12",
      [APP_CONFIG.TOAST_TYPES.INFO]: "#1b2347",
    };

    toast.style.borderColor = colors[type] || colors[APP_CONFIG.TOAST_TYPES.INFO];

    // Show toast
    toast.hidden = false;

    // Auto-hide after duration
    setTimeout(() => {
      toast.hidden = true;
    }, duration);

  } catch (error) {
    console.error("Failed to show toast:", error);
    // Fallback to alert if toast fails
    alert(`${type.toUpperCase()}: ${message}`);
  }
};

/**
 * Create a debounced function
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
export const debounce = (func, delay = APP_CONFIG.UI.DEBOUNCE_DELAY) => {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
};

/**
 * Create a throttled function
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Throttled function
 */
export const throttle = (func, delay = APP_CONFIG.UI.DEBOUNCE_DELAY) => {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
};

/**
 * Safely add event listener with error handling
 * @param {string} selector - CSS selector
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 * @param {Object} options - Event listener options
 * @returns {boolean} - Success status
 */
export const addEventListener = (selector, event, handler, options = {}) => {
  try {
    const element = qs(selector);
    if (element && typeof handler === 'function') {
      element.addEventListener(event, handler, options);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to add event listener for ${selector}:`, error);
    return false;
  }
};

/**
 * Safely remove event listener
 * @param {string} selector - CSS selector
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 * @returns {boolean} - Success status
 */
export const removeEventListener = (selector, event, handler) => {
  try {
    const element = qs(selector);
    if (element && typeof handler === 'function') {
      element.removeEventListener(event, handler);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to remove event listener for ${selector}:`, error);
    return false;
  }
};

/**
 * Get element's dataset value
 * @param {string} selector - CSS selector
 * @param {string} key - Dataset key
 * @returns {string|null} - Dataset value or null
 */
export const getDataset = (selector, key) => {
  try {
    const element = qs(selector);
    return element?.dataset?.[key] || null;
  } catch (error) {
    console.warn(`Failed to get dataset ${key} for ${selector}:`, error);
    return null;
  }
};

/**
 * Set element's dataset value
 * @param {string} selector - CSS selector
 * @param {string} key - Dataset key
 * @param {string} value - Dataset value
 * @returns {boolean} - Success status
 */
export const setDataset = (selector, key, value) => {
  try {
    const element = qs(selector);
    if (element && key) {
      element.dataset[key] = value ?? "";
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to set dataset ${key} for ${selector}:`, error);
    return false;
  }
};

export default {
  qs,
  qsa,
  setValue,
  getValue,
  setText,
  setHTML,
  toggleVisibility,
  toggleEnabled,
  addClass,
  removeClass,
  toggleClass,
  showToast,
  debounce,
  throttle,
  addEventListener,
  removeEventListener,
  getDataset,
  setDataset,
};