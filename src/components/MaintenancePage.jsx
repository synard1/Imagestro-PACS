import React, { useState, useEffect, useCallback } from 'react';

/**
 * MaintenancePage - React component for displaying maintenance/offline page
 * 
 * This component provides a responsive maintenance page with retry functionality,
 * server status checking, and URL preservation for redirect when server recovers.
 */
const MaintenancePage = ({
  onRetry,
  estimatedRecovery = null,
  originalUrl = window.location.href,
  serverStatus = 'unavailable',
  maxRetries = 3,
  autoRetryInterval = 120000, // 2 minutes
  className = ''
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState(''); // 'checking', 'success', 'error'
  const [autoRetryTimer, setAutoRetryTimer] = useState(null);

  /**
   * Show status message with type
   */
  const showStatus = useCallback((message, type) => {
    setStatusMessage(message);
    setStatusType(type);
  }, []);

  /**
   * Hide status message
   */
  const hideStatus = useCallback(() => {
    setStatusMessage('');
    setStatusType('');
  }, []);

  /**
   * Check server status and handle retry logic
   */
  const checkServerStatus = useCallback(async () => {
    setIsChecking(true);
    showStatus('Checking server status...', 'checking');

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(originalUrl, {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        showStatus('Server is back online! Redirecting...', 'success');
        
        // Call onRetry callback if provided
        if (onRetry) {
          onRetry();
        } else {
          // Default behavior: redirect to original URL
          setTimeout(() => {
            window.location.href = originalUrl;
          }, 1500);
        }
        return;
      }
    } catch (error) {
      console.log('Server check failed:', error.message);
    }

    // Server still unavailable
    const newRetryCount = retryCount + 1;
    setRetryCount(newRetryCount);

    if (newRetryCount >= maxRetries) {
      showStatus('Server is still unavailable. Please try again later or contact support.', 'error');
      setIsChecking(false);
      scheduleAutoRetry(60000); // Retry in 1 minute
    } else {
      showStatus(`Server still unavailable. Retrying automatically in 10 seconds... (${newRetryCount}/${maxRetries})`, 'error');
      scheduleAutoRetry(10000); // Retry in 10 seconds
    }
  }, [originalUrl, retryCount, maxRetries, onRetry, showStatus]);

  /**
   * Schedule automatic retry
   */
  const scheduleAutoRetry = useCallback((delay) => {
    if (autoRetryTimer) {
      clearTimeout(autoRetryTimer);
    }

    const timer = setTimeout(() => {
      hideStatus();
      setIsChecking(false);
      if (retryCount < maxRetries) {
        checkServerStatus();
      }
    }, delay);

    setAutoRetryTimer(timer);
  }, [autoRetryTimer, retryCount, maxRetries, checkServerStatus, hideStatus]);

  /**
   * Handle manual retry button click
   */
  const handleRetryClick = useCallback(() => {
    if (autoRetryTimer) {
      clearTimeout(autoRetryTimer);
      setAutoRetryTimer(null);
    }
    checkServerStatus();
  }, [autoRetryTimer, checkServerStatus]);

  /**
   * Navigate to homepage
   */
  const goToHomepage = useCallback(() => {
    window.location.href = '/';
  }, []);

  /**
   * Handle server recovery notifications
   */
  useEffect(() => {
    // Listen for service worker messages
    const handleServiceWorkerMessage = (event) => {
      if (event.data.type === 'SERVER_RECOVERY') {
        showStatus('Server recovery detected! Redirecting...', 'success');
        setTimeout(() => {
          if (onRetry) {
            onRetry();
          } else {
            window.location.href = originalUrl;
          }
        }, 1000);
      } else if (event.data.type === 'REDIRECT_TO_ORIGINAL') {
        showStatus('Server recovered! Redirecting to original page...', 'success');
        setTimeout(() => {
          if (onRetry) {
            onRetry();
          } else {
            window.location.href = event.data.originalUrl || originalUrl;
          }
        }, 1000);
      }
    };

    // Register service worker message listener
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    // Listen for broadcast channel messages
    let channel = null;
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('maintenance-updates');
      
      const handleBroadcastMessage = (event) => {
        if (event.data.type === 'SERVER_RECOVERY') {
          showStatus('Server recovery detected! Redirecting...', 'success');
          setTimeout(() => {
            if (onRetry) {
              onRetry();
            } else {
              window.location.href = originalUrl;
            }
          }, 1000);
        }
      };

      channel.addEventListener('message', handleBroadcastMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
      if (channel) {
        channel.close();
      }
    };
  }, [originalUrl, onRetry, showStatus]);

  /**
   * Handle page visibility changes
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && retryCount < maxRetries && !isChecking) {
        setTimeout(checkServerStatus, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [retryCount, maxRetries, isChecking, checkServerStatus]);

  /**
   * Store original URL for recovery
   */
  useEffect(() => {
    localStorage.setItem('maintenance-original-url', originalUrl);
  }, [originalUrl]);

  /**
   * Auto-retry setup
   */
  useEffect(() => {
    if (retryCount < maxRetries && autoRetryInterval > 0) {
      scheduleAutoRetry(autoRetryInterval);
    }

    return () => {
      if (autoRetryTimer) {
        clearTimeout(autoRetryTimer);
      }
    };
  }, [retryCount, maxRetries, autoRetryInterval, scheduleAutoRetry, autoRetryTimer]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (autoRetryTimer) {
        clearTimeout(autoRetryTimer);
      }
    };
  }, [autoRetryTimer]);

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-5 ${className}`} data-maintenance-page="true">
      <div className="bg-white rounded-2xl shadow-2xl p-12 text-center max-w-2xl w-full border border-slate-200">
        <div className="mb-8">
          <div className="inline-block mb-4">
            <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="60" height="60" rx="12" fill="#3b82f6"/>
              <path d="M20 30h20M30 20v20" stroke="white" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="30" cy="30" r="15" stroke="white" strokeWidth="2" fill="none"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 m-0">MWL PACS UI</h1>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-red-600 mb-4">Server Temporarily Unavailable</h2>
          <p className="text-slate-600 text-base mb-4">
            The server is currently {serverStatus === 'offline' ? 'offline' : 'experiencing issues'}. 
            We're working to restore service as quickly as possible.
          </p>
          
          {estimatedRecovery && (
            <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm border border-yellow-200">
              <strong>Estimated Recovery:</strong> {estimatedRecovery}
            </div>
          )}
        </div>

        <div className="mb-8 flex gap-3 justify-center flex-wrap">
          <button 
            className={`bg-blue-500 text-white border-none py-3.5 px-7 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200 flex items-center gap-2 min-w-[180px] justify-center ${
              isChecking ? 'bg-slate-400 cursor-not-allowed' : 'hover:bg-blue-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/40'
            }`}
            onClick={handleRetryClick}
            disabled={isChecking}
          >
            <span style={{ display: isChecking ? 'none' : 'inline' }}>
              Check Server Status
            </span>
            <span style={{ display: isChecking ? 'inline-flex' : 'none' }}>
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 20 20">
                <circle 
                  cx="10" 
                  cy="10" 
                  r="8" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  fill="none" 
                  strokeDasharray="50.27" 
                  strokeDashoffset="50.27"
                />
              </svg>
            </span>
          </button>
          
          <button 
            className="bg-transparent text-slate-600 border-2 border-slate-200 py-3 px-6 rounded-xl text-base font-medium cursor-pointer transition-all duration-200 hover:border-slate-300 hover:text-slate-700 hover:-translate-y-0.5"
            onClick={goToHomepage}
          >
            Go to Homepage
          </button>
        </div>

        {statusMessage && (
          <div className={`mb-6 p-4 rounded-lg text-sm font-medium ${
            statusType === 'checking' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
            statusType === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
            'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {statusMessage}
          </div>
        )}

        <div className="border-t border-slate-200 pt-6 text-slate-600 text-sm">
          {retryCount > 0 && (
            <div className="mb-3">
              <p>Retry attempts: {retryCount}/{maxRetries}</p>
            </div>
          )}
          
          <div className="mb-4">
            <small>Attempted to access: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono break-all">{originalUrl}</code></small>
          </div>
          
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <a href="mailto:support@example.com" className="text-blue-500 no-underline font-medium hover:underline">Contact Support</a>
            <span className="text-slate-300 hidden sm:inline">•</span>
            <a href="/status" target="_blank" rel="noopener noreferrer" className="text-blue-500 no-underline font-medium hover:underline">System Status</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;