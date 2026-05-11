import DOMPurify from 'dompurify'

/**
 * Simple Connection Monitor
 * Detects when development server goes offline and shows immediate notification
 */

class ConnectionMonitor {
  constructor() {
    this.isOnline = true;
    this.checkInterval = null;
    this.notificationElement = null;
    this.isDev = this.isDevelopmentMode();
    
    if (this.isDev) {
      this.init();
    }
  }

  isDevelopmentMode() {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' || 
           window.location.port === '5173';
  }

  init() {
    console.log('[ConnectionMonitor] Initializing connection monitor');
    
    // Start monitoring immediately
    this.startMonitoring();
    
    // Listen for page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkConnection();
      }
    });

    // Listen for network events
    window.addEventListener('online', () => {
      console.log('[ConnectionMonitor] Network online event');
      this.checkConnection();
    });

    window.addEventListener('offline', () => {
      console.log('[ConnectionMonitor] Network offline event');
      this.handleOffline('network_offline');
    });
  }

  startMonitoring() {
    // Initial check
    this.checkConnection();
    
    // Check every 2 seconds
    this.checkInterval = setInterval(() => {
      this.checkConnection();
    }, 2000);
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async checkConnection() {
    try {
      // Try to fetch a simple endpoint with short timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const response = await fetch('/', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.handleOnline();
      } else {
        this.handleOffline('server_error');
      }
    } catch (error) {
      console.log('[ConnectionMonitor] Connection check failed:', error.message);
      this.handleOffline('connection_failed');
    }
  }

  handleOnline() {
    if (!this.isOnline) {
      console.log('[ConnectionMonitor] Connection restored');
      this.isOnline = true;
      this.hideNotification();
      this.showToast('Server connection restored!', 'success');
    }
  }

  handleOffline(reason) {
    if (this.isOnline) {
      console.log('[ConnectionMonitor] Connection lost:', reason);
      this.isOnline = false;
      this.showNotification();
      this.showToast('Development server offline!', 'error');
    }
  }

  showNotification() {
    if (this.notificationElement) {
      return; // Already showing
    }

    // Create notification overlay
    this.notificationElement = document.createElement('div');
    this.notificationElement.id = 'connection-lost-notification';
    this.notificationElement.innerHTML = DOMPurify.sanitize(`
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        font-family: system-ui, -apple-system, sans-serif;
      ">
        <div style="
          background: white;
          border-radius: 12px;
          padding: 32px;
          max-width: 400px;
          width: 90%;
          text-align: center;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
        ">
          <div style="
            width: 64px;
            height: 64px;
            background: #fee2e2;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
          ">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#dc2626">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          
          <h2 style="
            margin: 0 0 12px;
            font-size: 20px;
            font-weight: 600;
            color: #1f2937;
          ">Development Server Offline</h2>
          
          <p style="
            margin: 0 0 24px;
            color: #6b7280;
            line-height: 1.5;
          ">
            The development server has stopped running. Please restart it to continue.
          </p>
          
          <div style="
            background: #f3f4f6;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            text-align: left;
          ">
            <div style="font-weight: 600; margin-bottom: 8px; color: #374151;">To restart:</div>
            <div style="font-family: monospace; background: #1f2937; color: #f9fafb; padding: 8px; border-radius: 4px; font-size: 14px;">
              npm run dev
            </div>
          </div>
          
          <div style="display: flex; gap: 12px;">
            <button id="connection-check-btn" style="
              flex: 1;
              background: #3b82f6;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-weight: 500;
              cursor: pointer;
              font-size: 14px;
            ">
              Check Again
            </button>
            <button id="connection-dismiss-btn" style="
              background: #f3f4f6;
              color: #6b7280;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-weight: 500;
              cursor: pointer;
              font-size: 14px;
            ">
              Dismiss
            </button>
          </div>
          
          <div style="
            margin-top: 16px;
            font-size: 12px;
            color: #9ca3af;
          ">
            Checking connection every 2 seconds...
          </div>
        </div>
      </div>
    `);
    this.notificationElement.querySelector('#connection-check-btn')
      .addEventListener('click', () => this.checkConnection());
    this.notificationElement.querySelector('#connection-dismiss-btn')
      .addEventListener('click', () => this.hideNotification());

    document.body.appendChild(this.notificationElement);
  }

  hideNotification() {
    if (this.notificationElement) {
      this.notificationElement.remove();
      this.notificationElement = null;
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      z-index: 1000000;
      animation: slideInRight 0.3s ease-out;
    `;

    toast.textContent = message;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 3000);
  }

  destroy() {
    this.stopMonitoring();
    this.hideNotification();
  }
}

// Create global instance
const connectionMonitor = new ConnectionMonitor();

// Make it globally accessible for the notification buttons
window.connectionMonitor = connectionMonitor;

export default connectionMonitor;