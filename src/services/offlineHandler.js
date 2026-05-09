/**
 * OfflineHandler - Manages offline scenarios and maintenance page display
 * 
 * This class provides network status detection, maintenance page serving logic,
 * and retry scheduling with server recovery detection.
 */

class OfflineHandler {
  constructor() {
    this.isOnlineStatus = navigator.onLine;
    this.lastOnlineCheck = Date.now();
    this.retrySchedule = [];
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
    this.healthCheckInterval = 30000; // 30 seconds
    this.healthCheckTimer = null;
    
    // Bind event listeners
    this.bindNetworkEvents();
    
    // Start periodic health checks
    this.startHealthChecks();
  }

  /**
   * Bind network status event listeners
   */
  bindNetworkEvents() {
    window.addEventListener('online', () => {
      console.log('[OfflineHandler] Network came online');
      this.isOnlineStatus = true;
      this.lastOnlineCheck = Date.now();
      this.handleNetworkRecovery();
    });

    window.addEventListener('offline', () => {
      console.log('[OfflineHandler] Network went offline');
      this.isOnlineStatus = false;
      this.handleNetworkLoss();
    });
  }

  /**
   * Check if the application is currently online
   * @returns {boolean} Current online status
   */
  isOnline() {
    return this.isOnlineStatus && navigator.onLine;
  }

  /**
   * Get the maintenance page HTML response
   * @param {string} originalUrl - The URL the user was trying to access
   * @param {Object} options - Additional options for the maintenance page
   * @returns {Response} HTML response for the maintenance page
   */
  getMaintenancePage(originalUrl = window.location.href, options = {}) {
    const {
      estimatedRecovery = null,
      serverStatus = 'unavailable',
      retryCount = 0,
      maxRetries = this.maxRetries
    } = options;

    const maintenanceHTML = this.generateMaintenanceHTML({
      originalUrl,
      estimatedRecovery,
      serverStatus,
      retryCount,
      maxRetries
    });

    return new Response(maintenanceHTML, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Maintenance-Page': 'true',
        'X-Original-URL': originalUrl
      }
    });
  }

  /**
   * Handle offline requests by serving maintenance page
   * @param {Request} request - The failed request
   * @returns {Response} Maintenance page response
   */
  handleOfflineRequest(request) {
    console.log('[OfflineHandler] Handling offline request:', request.url);
    
    // Log the offline request for analytics
    this.logOfflineRequest(request);
    
    return this.getMaintenancePage(request.url, {
      serverStatus: 'offline',
      retryCount: this.getRetryCount(request.url)
    });
  }

  /**
   * Schedule a retry for a failed request
   * @param {string} url - The URL to retry
   * @param {Function} callback - Callback to execute on successful retry
   */
  scheduleRetry(url, callback) {
    const retryInfo = {
      url,
      callback,
      attempts: 0,
      nextRetry: Date.now() + this.retryDelay,
      maxRetries: this.maxRetries
    };

    this.retrySchedule.push(retryInfo);
    console.log('[OfflineHandler] Scheduled retry for:', url);
  }

  /**
   * Start periodic health checks to detect server recovery
   */
  startHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform a health check to detect server recovery
   */
  async performHealthCheck() {
    if (!this.isOnline()) {
      return;
    }

    try {
      // Try to reach the health check endpoint or main page
      const healthCheckUrl = '/api/health' || '/';
      const response = await fetch(healthCheckUrl, {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) {
        console.log('[OfflineHandler] Server recovery detected');
        this.handleServerRecovery();
      }
    } catch (error) {
      console.log('[OfflineHandler] Health check failed:', error.message);
    }
  }

  /**
   * Handle server recovery - redirect users back to the application
   */
  handleServerRecovery() {
    console.log('[OfflineHandler] Handling server recovery');
    
    // Process pending retries
    this.processPendingRetries();
    
    // Notify all open maintenance pages about recovery
    this.notifyMaintenancePages();
    
    // If current page is maintenance page, redirect to original URL
    if (this.isMaintenancePage()) {
      const originalUrl = this.getOriginalUrl();
      if (originalUrl && originalUrl !== window.location.href) {
        console.log('[OfflineHandler] Redirecting to original URL:', originalUrl);
        window.location.href = originalUrl;
      }
    }
  }

  /**
   * Handle network recovery (online event)
   */
  handleNetworkRecovery() {
    console.log('[OfflineHandler] Network recovery detected');
    
    // Start health checks to detect server availability
    this.startHealthChecks();
    
    // Immediately perform a health check
    this.performHealthCheck();
  }

  /**
   * Handle network loss (offline event)
   */
  handleNetworkLoss() {
    console.log('[OfflineHandler] Network loss detected');
    
    // Stop health checks since we're offline
    this.stopHealthChecks();
  }

  /**
   * Process pending retries
   */
  async processPendingRetries() {
    const now = Date.now();
    const pendingRetries = this.retrySchedule.filter(retry => retry.nextRetry <= now);

    for (const retry of pendingRetries) {
      try {
        await retry.callback();
        // Remove successful retry from schedule
        this.retrySchedule = this.retrySchedule.filter(r => r !== retry);
        console.log('[OfflineHandler] Retry successful for:', retry.url);
      } catch (error) {
        retry.attempts++;
        if (retry.attempts >= retry.maxRetries) {
          // Remove failed retry from schedule
          this.retrySchedule = this.retrySchedule.filter(r => r !== retry);
          console.log('[OfflineHandler] Retry failed permanently for:', retry.url);
        } else {
          // Schedule next retry with exponential backoff
          retry.nextRetry = now + (this.retryDelay * Math.pow(2, retry.attempts));
          console.log('[OfflineHandler] Retry failed, scheduling next attempt for:', retry.url);
        }
      }
    }
  }

  /**
   * Notify all maintenance pages about server recovery
   */
  notifyMaintenancePages() {
    // Use BroadcastChannel to notify all tabs/windows
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('maintenance-updates');
      channel.postMessage({
        type: 'SERVER_RECOVERY',
        timestamp: Date.now()
      });
      channel.close();
    }
  }

  /**
   * Check if current page is a maintenance page
   * @returns {boolean} True if current page is maintenance page
   */
  isMaintenancePage() {
    return document.querySelector('[data-maintenance-page="true"]') !== null ||
           window.location.pathname === '/maintenance' ||
           document.title.includes('Maintenance');
  }

  /**
   * Get the original URL from maintenance page
   * @returns {string|null} Original URL or null if not found
   */
  getOriginalUrl() {
    // Try to get from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const originalUrl = urlParams.get('originalUrl');
    
    if (originalUrl) {
      return decodeURIComponent(originalUrl);
    }

    // Try to get from localStorage
    const storedUrl = localStorage.getItem('maintenance-original-url');
    if (storedUrl) {
      localStorage.removeItem('maintenance-original-url');
      return storedUrl;
    }

    // Default to root
    return '/';
  }

  /**
   * Get retry count for a specific URL
   * @param {string} url - The URL to check
   * @returns {number} Number of retry attempts
   */
  getRetryCount(url) {
    const retry = this.retrySchedule.find(r => r.url === url);
    return retry ? retry.attempts : 0;
  }

  /**
   * Log offline request for analytics
   * @param {Request} request - The failed request
   */
  logOfflineRequest(request) {
    const logEntry = {
      timestamp: Date.now(),
      url: request.url,
      method: request.method,
      userAgent: navigator.userAgent,
      online: navigator.onLine
    };

    // Store in localStorage for later transmission
    const offlineLogs = JSON.parse(localStorage.getItem('offline-logs') || '[]');
    offlineLogs.push(logEntry);
    
    // Keep only last 100 entries
    if (offlineLogs.length > 100) {
      offlineLogs.splice(0, offlineLogs.length - 100);
    }
    
    localStorage.setItem('offline-logs', JSON.stringify(offlineLogs));
    
    console.log('[OfflineHandler] Logged offline request:', logEntry);
  }

  /**
   * Generate maintenance page HTML
   * @param {Object} options - Options for generating the page
   * @returns {string} HTML content for maintenance page
   */
  generateMaintenanceHTML(options) {
    const {
      originalUrl,
      estimatedRecovery,
      serverStatus,
      retryCount,
      maxRetries
    } = options;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>MWL PACS UI - Server Maintenance</title>
          <meta name="description" content="MWL PACS UI is temporarily unavailable for maintenance">
          <link rel="icon" href="/favicon.ico" type="image/x-icon">
          <style>
              ${this.getMaintenancePageCSS()}
          </style>
      </head>
      <body>
          <div class="maintenance-container" data-maintenance-page="true">
              <div class="maintenance-content">
                  <div class="logo-container">
                      <div class="logo">
                          <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <rect width="60" height="60" rx="12" fill="#3b82f6"/>
                              <path d="M20 30h20M30 20v20" stroke="white" stroke-width="3" stroke-linecap="round"/>
                              <circle cx="30" cy="30" r="15" stroke="white" stroke-width="2" fill="none"/>
                          </svg>
                      </div>
                      <h1>MWL PACS UI</h1>
                  </div>
                  
                  <div class="status-section">
                      <h2>Server Temporarily Unavailable</h2>
                      <p class="status-message">
                          The server is currently ${serverStatus === 'offline' ? 'offline' : 'experiencing issues'}. 
                          We're working to restore service as quickly as possible.
                      </p>
                      
                      ${estimatedRecovery ? `
                          <div class="recovery-estimate">
                              <strong>Estimated Recovery:</strong> ${estimatedRecovery}
                          </div>
                      ` : ''}
                  </div>
                  
                  <div class="actions-section">
                      <button id="retry-button" class="retry-button" onclick="checkServerStatus()">
                          <span class="button-text">Check Server Status</span>
                          <span class="button-spinner" style="display: none;">
                              <svg class="spinner" width="20" height="20" viewBox="0 0 20 20">
                                  <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="50.27" stroke-dashoffset="50.27">
                                      <animateTransform attributeName="transform" type="rotate" values="0 10 10;360 10 10" dur="1s" repeatCount="indefinite"/>
                                  </circle>
                              </svg>
                          </span>
                      </button>
                      
                      <button class="secondary-button" onclick="goToHomepage()">
                          Go to Homepage
                      </button>
                  </div>
                  
                  <div id="status-indicator" class="status-indicator" style="display: none;">
                      <div class="status-content"></div>
                  </div>
                  
                  <div class="info-section">
                      <div class="retry-info">
                          ${retryCount > 0 ? `
                              <p>Retry attempts: ${retryCount}/${maxRetries}</p>
                          ` : ''}
                      </div>
                      
                      <div class="original-url">
                          <small>Attempted to access: <code>${originalUrl}</code></small>
                      </div>
                      
                      <div class="help-links">
                          <a href="mailto:support@example.com">Contact Support</a>
                          <span class="separator">•</span>
                          <a href="/status" target="_blank">System Status</a>
                      </div>
                  </div>
              </div>
          </div>
          
          <script>
              ${this.getMaintenancePageJS(originalUrl, retryCount, maxRetries)}
          </script>
      </body>
      </html>
    `;
  }

  /**
   * Get CSS styles for maintenance page
   * @returns {string} CSS content
   */
  getMaintenancePageCSS() {
    return `
      * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
      }
      
      body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          color: #1e293b;
          line-height: 1.6;
      }
      
      .maintenance-container {
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          padding: 48px;
          text-align: center;
          max-width: 600px;
          width: 100%;
          border: 1px solid #e2e8f0;
      }
      
      .logo-container {
          margin-bottom: 32px;
      }
      
      .logo {
          margin: 0 auto 16px;
          display: inline-block;
      }
      
      .logo-container h1 {
          color: #1e293b;
          font-size: 28px;
          font-weight: 700;
          margin: 0;
      }
      
      .status-section {
          margin-bottom: 32px;
      }
      
      .status-section h2 {
          color: #dc2626;
          font-size: 24px;
          font-weight: 600;
          margin-bottom: 16px;
      }
      
      .status-message {
          color: #64748b;
          font-size: 16px;
          margin-bottom: 16px;
      }
      
      .recovery-estimate {
          background: #fef3c7;
          color: #92400e;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          border: 1px solid #fcd34d;
      }
      
      .actions-section {
          margin-bottom: 32px;
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
      }
      
      .retry-button {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 180px;
          justify-content: center;
      }
      
      .retry-button:hover:not(:disabled) {
          background: #2563eb;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      }
      
      .retry-button:disabled {
          background: #94a3b8;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
      }
      
      .secondary-button {
          background: transparent;
          color: #64748b;
          border: 2px solid #e2e8f0;
          padding: 12px 24px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
      }
      
      .secondary-button:hover {
          border-color: #cbd5e1;
          color: #475569;
          transform: translateY(-1px);
      }
      
      .spinner {
          animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
      }
      
      .status-indicator {
          margin-bottom: 24px;
          padding: 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
      }
      
      .status-indicator.checking {
          background: #dbeafe;
          color: #1d4ed8;
          border: 1px solid #93c5fd;
      }
      
      .status-indicator.success {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #86efac;
      }
      
      .status-indicator.error {
          background: #fee2e2;
          color: #dc2626;
          border: 1px solid #fca5a5;
      }
      
      .info-section {
          border-top: 1px solid #e2e8f0;
          padding-top: 24px;
          color: #64748b;
          font-size: 14px;
      }
      
      .retry-info {
          margin-bottom: 12px;
      }
      
      .original-url {
          margin-bottom: 16px;
      }
      
      .original-url code {
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 12px;
          word-break: break-all;
      }
      
      .help-links {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
      }
      
      .help-links a {
          color: #3b82f6;
          text-decoration: none;
          font-weight: 500;
      }
      
      .help-links a:hover {
          text-decoration: underline;
      }
      
      .separator {
          color: #cbd5e1;
      }
      
      @media (max-width: 640px) {
          .maintenance-container {
              padding: 32px 24px;
              margin: 16px;
          }
          
          .logo-container h1 {
              font-size: 24px;
          }
          
          .status-section h2 {
              font-size: 20px;
          }
          
          .actions-section {
              flex-direction: column;
              align-items: center;
          }
          
          .retry-button,
          .secondary-button {
              width: 100%;
              max-width: 280px;
          }
          
          .help-links {
              flex-direction: column;
              gap: 4px;
          }
          
          .separator {
              display: none;
          }
      }
    `;
  }

  /**
   * Get JavaScript for maintenance page
   * @param {string} originalUrl - Original URL to redirect to
   * @param {number} retryCount - Current retry count
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {string} JavaScript content
   */
  getMaintenancePageJS(originalUrl, retryCount, maxRetries) {
    return `
      let currentRetryCount = ${retryCount};
      const maxRetryCount = ${maxRetries};
      const originalUrl = '${originalUrl}';
      let autoRetryTimer = null;
      
      // Store original URL for recovery
      localStorage.setItem('maintenance-original-url', originalUrl);
      
      function showStatus(message, type) {
          const indicator = document.getElementById('status-indicator');
          const content = indicator.querySelector('.status-content');
          
          content.textContent = message;
          indicator.className = 'status-indicator ' + type;
          indicator.style.display = 'block';
      }
      
      function hideStatus() {
          const indicator = document.getElementById('status-indicator');
          indicator.style.display = 'none';
      }
      
      function setButtonState(checking) {
          const button = document.getElementById('retry-button');
          const buttonText = button.querySelector('.button-text');
          const buttonSpinner = button.querySelector('.button-spinner');
          
          button.disabled = checking;
          buttonText.style.display = checking ? 'none' : 'inline';
          buttonSpinner.style.display = checking ? 'inline-flex' : 'none';
      }
      
      async function checkServerStatus() {
          setButtonState(true);
          showStatus('Checking server status...', 'checking');
          
          try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000);
              
              const response = await fetch(originalUrl, {
                  method: 'HEAD',
                  cache: 'no-cache',
                  signal: controller.signal
              });
              
              clearTimeout(timeoutId);
              
              if (response.ok) {
                  showStatus('Server is back online! Redirecting...', 'success');
                  setTimeout(() => {
                      window.location.href = originalUrl;
                  }, 1500);
                  return;
              }
          } catch (error) {
              console.log('Server check failed:', error.message);
          }
          
          currentRetryCount++;
          updateRetryInfo();
          
          if (currentRetryCount >= maxRetryCount) {
              showStatus('Server is still unavailable. Please try again later or contact support.', 'error');
              setButtonState(false);
              scheduleAutoRetry(60000); // Retry in 1 minute
          } else {
              showStatus(\`Server still unavailable. Retrying automatically in 10 seconds... (\${currentRetryCount}/\${maxRetryCount})\`, 'error');
              scheduleAutoRetry(10000); // Retry in 10 seconds
          }
      }
      
      function updateRetryInfo() {
          const retryInfo = document.querySelector('.retry-info');
          if (retryInfo && currentRetryCount > 0) {
              retryInfo.innerHTML = \`<p>Retry attempts: \${currentRetryCount}/\${maxRetryCount}</p>\`;
          }
      }
      
      function scheduleAutoRetry(delay) {
          if (autoRetryTimer) {
              clearTimeout(autoRetryTimer);
          }
          
          autoRetryTimer = setTimeout(() => {
              hideStatus();
              setButtonState(false);
              if (currentRetryCount < maxRetryCount) {
                  checkServerStatus();
              }
          }, delay);
      }
      
      function goToHomepage() {
          window.location.href = '/';
      }
      
      // Listen for server recovery notifications
      if ('BroadcastChannel' in window) {
          const channel = new BroadcastChannel('maintenance-updates');
          channel.addEventListener('message', (event) => {
              if (event.data.type === 'SERVER_RECOVERY') {
                  showStatus('Server recovery detected! Redirecting...', 'success');
                  setTimeout(() => {
                      window.location.href = originalUrl;
                  }, 1000);
              }
          });
      }
      
      // Auto-retry every 2 minutes if not at max retries
      if (currentRetryCount < maxRetryCount) {
          scheduleAutoRetry(120000); // 2 minutes
      }
      
      // Page visibility change handler - check server when page becomes visible
      document.addEventListener('visibilitychange', () => {
          if (!document.hidden && currentRetryCount < maxRetryCount) {
              setTimeout(checkServerStatus, 1000);
          }
      });
    `;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopHealthChecks();
    
    // Remove event listeners
    window.removeEventListener('online', this.handleNetworkRecovery);
    window.removeEventListener('offline', this.handleNetworkLoss);
    
    // Clear retry schedule
    this.retrySchedule = [];
  }
}

// Export for use in service worker and main application
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OfflineHandler;
} else if (typeof self !== 'undefined') {
  // In service worker context
  self.OfflineHandler = OfflineHandler;
} else {
  // In browser context
  window.OfflineHandler = OfflineHandler;
}