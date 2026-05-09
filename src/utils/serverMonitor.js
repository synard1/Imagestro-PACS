/**
 * Client-side Server Monitoring Utilities
 * Works with ServerStatusMonitor component to provide real-time server status
 */

class ServerMonitor {
  constructor() {
    this.isMonitoring = false;
    this.listeners = new Set();
    this.lastStatus = 'unknown';
    this.checkInterval = null;
    this.isDevelopment = this.isDevelopmentMode();
    
    // Only enable in development
    if (!this.isDevelopment) {
      return;
    }

    this.init();
  }

  isDevelopmentMode() {
    return location.hostname === 'localhost' || 
           location.hostname === '127.0.0.1' || 
           location.port === '5173' ||
           (typeof window !== 'undefined' && window.location.port === '5173');
  }

  init() {
    // Listen for service worker messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event);
      });
    }

    // Listen for network status changes
    window.addEventListener('online', () => {
      console.log('[ServerMonitor] Network came online');
      this.checkServerStatus();
    });

    window.addEventListener('offline', () => {
      console.log('[ServerMonitor] Network went offline');
      this.notifyListeners('offline', { reason: 'network_offline' });
    });

    // Listen for page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isMonitoring) {
        console.log('[ServerMonitor] Page became visible, checking server');
        this.checkServerStatus();
      }
    });
  }

  handleServiceWorkerMessage(event) {
    const { data } = event;
    
    if (data.type === 'SERVER_STATUS_CHANGE') {
      console.log('[ServerMonitor] Service worker reported status change:', data.status);
      this.notifyListeners(data.status, data.details || {});
    }
  }

  startMonitoring() {
    if (this.isMonitoring || !this.isDevelopment) {
      return;
    }

    console.log('[ServerMonitor] Starting client-side monitoring');
    this.isMonitoring = true;

    // Initial check
    this.checkServerStatus();

    // Set up periodic checks (every 3 seconds in development)
    this.checkInterval = setInterval(() => {
      this.checkServerStatus();
    }, 3000);
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    console.log('[ServerMonitor] Stopping client-side monitoring');
    this.isMonitoring = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async checkServerStatus() {
    if (!this.isDevelopment) {
      return 'online'; // Assume online in production
    }

    try {
      // Check multiple endpoints to be sure
      const endpoints = [
        { url: '/', timeout: 2000 },
        { url: '/manifest.json', timeout: 2000 },
        { url: '/@vite/client', timeout: 1500 } // Vite-specific endpoint
      ];

      const results = await Promise.allSettled(
        endpoints.map(({ url, timeout }) =>
          this.fetchWithTimeout(url, timeout)
        )
      );

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
      const newStatus = successCount > 0 ? 'online' : 'offline';

      // Only notify if status changed
      if (newStatus !== this.lastStatus) {
        console.log('[ServerMonitor] Status changed:', this.lastStatus, '->', newStatus);
        this.lastStatus = newStatus;
        this.notifyListeners(newStatus, {
          successCount,
          totalChecks: endpoints.length,
          timestamp: Date.now()
        });
      }

      return newStatus;
    } catch (error) {
      console.log('[ServerMonitor] Check failed:', error.message);
      
      if (this.lastStatus !== 'offline') {
        this.lastStatus = 'offline';
        this.notifyListeners('offline', {
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      return 'offline';
    }
  }

  async fetchWithTimeout(url, timeout = 2000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  onStatusChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
    }
  }

  offStatusChange(callback) {
    this.listeners.delete(callback);
  }

  notifyListeners(status, details = {}) {
    this.listeners.forEach(callback => {
      try {
        callback(status, details);
      } catch (error) {
        console.error('[ServerMonitor] Listener error:', error);
      }
    });
  }

  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      lastStatus: this.lastStatus,
      isDevelopment: this.isDevelopment,
      listenerCount: this.listeners.size
    };
  }

  // Force immediate check
  async forceCheck() {
    console.log('[ServerMonitor] Force checking server status');
    return await this.checkServerStatus();
  }
}

// Create singleton instance
const serverMonitor = new ServerMonitor();

// Auto-start monitoring in development
if (serverMonitor.isDevelopment) {
  // Start monitoring after a short delay to let the app initialize
  setTimeout(() => {
    serverMonitor.startMonitoring();
  }, 2000);
}

export default serverMonitor;
export { ServerMonitor };