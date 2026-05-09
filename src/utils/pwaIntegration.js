/**
 * PWA Integration Utilities
 * 
 * This module provides utilities for integrating PWA functionality
 * into the main application, including service worker registration
 * and offline handling.
 */

import React from 'react';
import pwaManager from '../services/pwaManager.js';

/**
 * Initialize PWA functionality
 * @returns {Promise<PWAManager>} PWA manager instance
 */
export async function initializePWA() {
  try {
    await pwaManager.register();
    console.log('[PWA Integration] PWA initialized successfully');
    return pwaManager;
    
  } catch (error) {
    console.error('[PWA Integration] Failed to initialize PWA:', error);
    throw error;
  }
}

/**
 * Get PWA manager instance
 * @returns {PWAManager|null} PWA manager instance or null if not initialized
 */
export function getPWAManager() {
  return pwaManager;
}

/**
 * Check if PWA is supported
 * @returns {boolean} True if PWA is supported
 */
export function isPWASupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Check if app is running as PWA
 * @returns {boolean} True if running as PWA
 */
export function isPWAInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

/**
 * Show PWA install prompt if available
 * @returns {Promise<boolean>} True if prompt was shown
 */
export async function showInstallPrompt() {
  try {
    await pwaManager.showInstallPrompt();
    return true;
  } catch (error) {
    console.error('[PWA Integration] Failed to show install prompt:', error);
    return false;
  }
}

/**
 * Check for PWA updates
 * @returns {Promise<boolean>} True if update is available
 */
export async function checkForUpdates() {
  try {
    return await pwaManager.checkForUpdates();
  } catch (error) {
    console.error('[PWA Integration] Failed to check for updates:', error);
    return false;
  }
}

/**
 * Apply PWA update
 * @returns {Promise<void>}
 */
export async function applyUpdate() {
  try {
    await pwaManager.applyUpdate();
  } catch (error) {
    console.error('[PWA Integration] Failed to apply update:', error);
  }
}

/**
 * Get PWA status information
 * @returns {Object} PWA status
 */
export function getPWAStatus() {
  return {
    supported: isPWASupported(),
    initialized: true,
    installed: isPWAInstalled(),
    ...pwaManager.getInstallationInfo()
  };
}

/**
 * Set up PWA event listeners
 * @param {Object} callbacks - Event callbacks
 * @param {Function} callbacks.onInstallAvailable - Called when install is available
 * @param {Function} callbacks.onUpdateAvailable - Called when update is available
 * @param {Function} callbacks.onOffline - Called when going offline
 * @param {Function} callbacks.onOnline - Called when coming online
 */
export function setupPWAEventListeners(callbacks = {}) {
  const {
    onInstallAvailable,
    onUpdateAvailable,
    onOffline,
    onOnline
  } = callbacks;

  // PWA install available
  if (onInstallAvailable) {
    window.addEventListener('pwa-install-available', (event) => {
      onInstallAvailable(event.detail);
    });
  }

  // PWA update available
  if (onUpdateAvailable) {
    window.addEventListener('pwa-update-available', (event) => {
      onUpdateAvailable(event.detail);
    });
  }

  // Network status changes
  if (onOffline) {
    window.addEventListener('offline', onOffline);
  }

  if (onOnline) {
    window.addEventListener('online', onOnline);
  }
}

/**
 * Create a React hook for PWA functionality
 * @returns {Object} PWA hook with state and methods
 */
export function usePWA() {
  const [pwaStatus, setPWAStatus] = React.useState(getPWAStatus());
  const [installPromptAvailable, setInstallPromptAvailable] = React.useState(false);
  const [updateAvailable, setUpdateAvailable] = React.useState(false);

  React.useEffect(() => {
    // Initialize PWA
    initializePWA().catch(console.error);

    // Set up event listeners
    setupPWAEventListeners({
      onInstallAvailable: () => setInstallPromptAvailable(true),
      onUpdateAvailable: () => setUpdateAvailable(true),
      onOffline: () => setPWAStatus(prev => ({ ...prev, online: false })),
      onOnline: () => setPWAStatus(prev => ({ ...prev, online: true }))
    });

    // Update status periodically
    const interval = setInterval(() => {
      setPWAStatus(getPWAStatus());
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return {
    status: pwaStatus,
    installPromptAvailable,
    updateAvailable,
    showInstallPrompt,
    checkForUpdates,
    applyUpdate,
    isSupported: isPWASupported(),
    isInstalled: isPWAInstalled()
  };
}

/**
 * Cleanup PWA resources
 */
export function cleanupPWA() {
  pwaManager.destroy();
}

// Export default object with all utilities
export default {
  initializePWA,
  getPWAManager,
  isPWASupported,
  isPWAInstalled,
  showInstallPrompt,
  checkForUpdates,
  applyUpdate,
  getPWAStatus,
  setupPWAEventListeners,
  usePWA,
  cleanupPWA
};