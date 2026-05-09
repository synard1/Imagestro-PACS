import React, { useState, useEffect } from 'react';
import { 
  initializePWA, 
  getPWAStatus, 
  showInstallPrompt, 
  checkForUpdates, 
  applyUpdate,
  setupPWAEventListeners 
} from '../utils/pwaIntegration';

/**
 * PWAStatus - Component for displaying and managing PWA status
 * 
 * This component shows the current PWA status and provides controls
 * for PWA installation, updates, and offline functionality.
 */
const PWAStatus = ({ className = '' }) => {
  const [status, setStatus] = useState(getPWAStatus());
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  /**
   * Update PWA status
   */
  const updateStatus = () => {
    setStatus(getPWAStatus());
  };

  /**
   * Handle PWA installation
   */
  const handleInstall = async () => {
    setIsLoading(true);
    setMessage('');

    try {
      const success = await showInstallPrompt();
      if (success) {
        setMessage('Install prompt shown');
        setInstallPromptAvailable(false);
      } else {
        setMessage('Install prompt not available');
      }
    } catch (error) {
      setMessage('Failed to show install prompt');
      console.error('Install error:', error);
    } finally {
      setIsLoading(false);
      updateStatus();
    }
  };

  /**
   * Handle PWA update check
   */
  const handleCheckUpdates = async () => {
    setIsLoading(true);
    setMessage('');

    try {
      const hasUpdate = await checkForUpdates();
      if (hasUpdate) {
        setMessage('Update available');
        setUpdateAvailable(true);
      } else {
        setMessage('No updates available');
      }
    } catch (error) {
      setMessage('Failed to check for updates');
      console.error('Update check error:', error);
    } finally {
      setIsLoading(false);
      updateStatus();
    }
  };

  /**
   * Handle PWA update application
   */
  const handleApplyUpdate = async () => {
    setIsLoading(true);
    setMessage('');

    try {
      await applyUpdate();
      setMessage('Update applied, reloading...');
    } catch (error) {
      setMessage('Failed to apply update');
      console.error('Update apply error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Initialize PWA and set up event listeners
   */
  useEffect(() => {
    // Initialize PWA
    initializePWA().catch(console.error);

    // Set up event listeners
    setupPWAEventListeners({
      onInstallAvailable: () => {
        setInstallPromptAvailable(true);
        setMessage('PWA installation available');
      },
      onUpdateAvailable: () => {
        setUpdateAvailable(true);
        setMessage('PWA update available');
      },
      onOffline: () => {
        setMessage('You are now offline');
        updateStatus();
      },
      onOnline: () => {
        setMessage('You are back online');
        updateStatus();
      }
    });

    // Update status periodically
    const interval = setInterval(updateStatus, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  /**
   * Get status indicator color
   */
  const getStatusColor = () => {
    if (!status.supported) return 'text-gray-500';
    if (!status.online) return 'text-red-500';
    if (status.installed) return 'text-green-500';
    if (status.initialized) return 'text-blue-500';
    return 'text-yellow-500';
  };

  /**
   * Get status text
   */
  const getStatusText = () => {
    if (!status.supported) return 'PWA not supported';
    if (!status.online) return 'Offline';
    if (status.installed) return 'PWA installed';
    if (status.initialized) return 'PWA ready';
    return 'PWA initializing';
  };

  return (
    <div className={`pwa-status bg-white rounded-lg shadow-md p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">PWA Status</h3>
        <div className={`flex items-center gap-2 ${getStatusColor()}`}>
          <div className="w-3 h-3 rounded-full bg-current"></div>
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
      </div>

      {/* Status Details */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div>
          <span className="font-medium">Supported:</span>
          <span className={`ml-2 ${status.supported ? 'text-green-600' : 'text-red-600'}`}>
            {status.supported ? 'Yes' : 'No'}
          </span>
        </div>
        <div>
          <span className="font-medium">Initialized:</span>
          <span className={`ml-2 ${status.initialized ? 'text-green-600' : 'text-red-600'}`}>
            {status.initialized ? 'Yes' : 'No'}
          </span>
        </div>
        <div>
          <span className="font-medium">Installed:</span>
          <span className={`ml-2 ${status.installed ? 'text-green-600' : 'text-red-600'}`}>
            {status.installed ? 'Yes' : 'No'}
          </span>
        </div>
        <div>
          <span className="font-medium">Online:</span>
          <span className={`ml-2 ${status.online ? 'text-green-600' : 'text-red-600'}`}>
            {status.online ? 'Yes' : 'No'}
          </span>
        </div>
        {status.serviceWorkerRegistered && (
          <>
            <div>
              <span className="font-medium">Service Worker:</span>
              <span className="ml-2 text-green-600">Active</span>
            </div>
            <div>
              <span className="font-medium">Update Available:</span>
              <span className={`ml-2 ${updateAvailable ? 'text-orange-600' : 'text-green-600'}`}>
                {updateAvailable ? 'Yes' : 'No'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {installPromptAvailable && !status.installed && (
          <button
            onClick={handleInstall}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isLoading ? 'Installing...' : 'Install PWA'}
          </button>
        )}

        {status.initialized && (
          <button
            onClick={handleCheckUpdates}
            disabled={isLoading}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isLoading ? 'Checking...' : 'Check Updates'}
          </button>
        )}

        {updateAvailable && (
          <button
            onClick={handleApplyUpdate}
            disabled={isLoading}
            className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isLoading ? 'Updating...' : 'Apply Update'}
          </button>
        )}
      </div>

      {/* Message Display */}
      {message && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
          {message}
        </div>
      )}

      {/* PWA Features */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <h4 className="text-sm font-semibold mb-2">PWA Features</h4>
        <div className="grid grid-cols-1 gap-2 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status.supported ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span>Offline functionality</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status.serviceWorkerRegistered ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span>Background sync</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status.installed ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
            <span>App-like experience</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status.initialized ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span>Automatic updates</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAStatus;