import React, { useState, useEffect, useRef } from 'react';
import { isDevelopmentMode } from '../utils/cacheManager';
import serverMonitor from '../utils/serverMonitor';

/**
 * Real-time Server Status Monitor
 * Monitors development server status and shows popup when offline
 */
const ServerStatusMonitor = () => {
  const [serverStatus, setServerStatus] = useState('checking');
  const [showOfflinePopup, setShowOfflinePopup] = useState(false);
  const [lastOnlineTime, setLastOnlineTime] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);

  // Only run in development mode
  if (!isDevelopmentMode()) {
    return null;
  }

  useEffect(() => {
    // Listen to server monitor status changes
    const handleStatusChange = (status, details) => {
      console.log('[ServerStatusMonitor] Status change received:', status, details);
      
      if (status === 'online') {
        handleServerOnline();
      } else if (status === 'offline') {
        handleServerOffline();
      }
    };

    serverMonitor.onStatusChange(handleStatusChange);

    // Get initial status
    const initialStatus = serverMonitor.getStatus();
    if (initialStatus.lastStatus && initialStatus.lastStatus !== 'unknown') {
      setServerStatus(initialStatus.lastStatus);
      if (initialStatus.lastStatus === 'offline') {
        setShowOfflinePopup(true);
      }
    }

    return () => {
      serverMonitor.offStatusChange(handleStatusChange);
    };
  }, []);

  const checkServerStatus = async () => {
    // Use the server monitor utility for checking
    const status = await serverMonitor.forceCheck();
    console.log('[ServerStatusMonitor] Force check result:', status);
    return status;
  };

  const handleServerOnline = () => {
    const wasOffline = serverStatus === 'offline';
    
    setServerStatus('online');
    setRetryCount(0);
    setLastOnlineTime(new Date());

    if (wasOffline) {
      console.log('[ServerMonitor] Server back online!');
      setShowOfflinePopup(false);
      
      // Show recovery notification
      showNotification('Server is back online!', 'success');
    }
  };

  const handleServerOffline = () => {
    const wasOnline = serverStatus === 'online' || serverStatus === 'checking';
    
    setServerStatus('offline');
    setRetryCount(prev => prev + 1);

    if (wasOnline) {
      console.log('[ServerMonitor] Server went offline!');
      setShowOfflinePopup(true);
      
      // Show offline notification
      showNotification('Development server is offline', 'error');
    }
  };

  const showNotification = (message, type) => {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#10b981' : '#ef4444'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10001;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      animation: slideIn 0.3s ease-out;
    `;

    notification.textContent = message;

    // Add animation styles if not already present
    if (!document.querySelector('#server-monitor-animations')) {
      const style = document.createElement('style');
      style.id = 'server-monitor-animations';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 3000);
  };

  const handleRetryConnection = async () => {
    console.log('[ServerStatusMonitor] Manual retry requested');
    setRetryCount(prev => prev + 1);
    
    // Show checking state
    setServerStatus('checking');
    
    // Force check server status
    await checkServerStatus();
  };

  const handleDismissPopup = () => {
    setShowOfflinePopup(false);
  };

  const formatTime = (date) => {
    if (!date) return 'Unknown';
    return date.toLocaleTimeString();
  };

  const getStatusColor = () => {
    switch (serverStatus) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-red-500';
      case 'checking': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (serverStatus) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'checking': return 'Checking...';
      default: return 'Unknown';
    }
  };

  return (
    <>
      {/* Status Indicator - Always visible in development */}
      <div className="fixed top-4 left-4 bg-white border border-gray-300 rounded-lg shadow-lg p-2 text-xs z-50">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
          <span className="text-gray-700">Dev Server: {getStatusText()}</span>
        </div>
      </div>

      {/* Offline Popup */}
      {showOfflinePopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Development Server Offline</h3>
                <p className="text-sm text-gray-600">The development server has stopped running</p>
              </div>
            </div>

            {/* Status Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Status:</span>
                  <span className="ml-2 font-medium text-red-600">Offline</span>
                </div>
                <div>
                  <span className="text-gray-500">Retry Count:</span>
                  <span className="ml-2 font-medium">{retryCount}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Last Online:</span>
                  <span className="ml-2 font-medium">{formatTime(lastOnlineTime)}</span>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="mb-6">
              <h4 className="font-medium text-gray-900 mb-2">To restore service:</h4>
              <ol className="text-sm text-gray-600 space-y-1">
                <li>1. Run <code className="bg-gray-100 px-1 rounded">npm run dev</code> in your terminal</li>
                <li>2. Wait for the server to start</li>
                <li>3. Click "Check Connection" below</li>
              </ol>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleRetryConnection}
                className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors"
              >
                Check Connection
              </button>
              <button
                onClick={handleDismissPopup}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Dismiss
              </button>
            </div>

            {/* Auto-retry info */}
            <div className="mt-4 text-xs text-gray-500 text-center">
              Automatically checking every 3 seconds...
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ServerStatusMonitor;