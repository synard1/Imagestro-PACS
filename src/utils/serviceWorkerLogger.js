/**
 * Service Worker Logger Utility
 * 
 * Provides access to service worker logs and metrics from the main application
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

class ServiceWorkerLoggerClient {
  constructor() {
    this.messageChannel = null;
    this.isSupported = 'serviceWorker' in navigator;
  }

  /**
   * Check if service worker logging is supported
   */
  isLoggerSupported() {
    return this.isSupported && navigator.serviceWorker.controller;
  }

  /**
   * Get logs from service worker
   * @param {number} limit - Maximum number of log entries to retrieve
   * @returns {Promise<Object>} Log data with metrics
   */
  async getLogs(limit = 100) {
    if (!this.isLoggerSupported()) {
      throw new Error('Service worker logging not supported or not active');
    }

    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        if (event.data.type === 'LOGS_EXPORT') {
          resolve(event.data.data);
        } else {
          reject(new Error('Unexpected response type'));
        }
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_LOGS', limit },
        [messageChannel.port2]
      );

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Timeout waiting for logs'));
      }, 5000);
    });
  }

  /**
   * Get metrics from service worker
   * @returns {Promise<Object>} Metrics data
   */
  async getMetrics() {
    if (!this.isLoggerSupported()) {
      throw new Error('Service worker logging not supported or not active');
    }

    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        if (event.data.type === 'METRICS_EXPORT') {
          resolve(event.data.data);
        } else {
          reject(new Error('Unexpected response type'));
        }
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_METRICS' },
        [messageChannel.port2]
      );

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Timeout waiting for metrics'));
      }, 5000);
    });
  }

  /**
   * Get maintenance page events from local storage
   * @returns {Array} Array of maintenance events
   */
  getMaintenanceEvents() {
    try {
      const events = localStorage.getItem('maintenance-events');
      return events ? JSON.parse(events) : [];
    } catch (error) {
      console.error('Failed to get maintenance events:', error);
      return [];
    }
  }

  /**
   * Clear maintenance events from local storage
   */
  clearMaintenanceEvents() {
    try {
      localStorage.removeItem('maintenance-events');
      sessionStorage.removeItem('maintenance-session-id');
    } catch (error) {
      console.error('Failed to clear maintenance events:', error);
    }
  }

  /**
   * Get comprehensive logging report
   * @returns {Promise<Object>} Complete logging report
   */
  async getLoggingReport() {
    try {
      const [logs, metrics] = await Promise.all([
        this.getLogs(50),
        this.getMetrics()
      ]);

      const maintenanceEvents = this.getMaintenanceEvents();

      return {
        serviceWorker: {
          logs: logs?.logs || [],
          metrics: logs?.metrics || {},
          cacheHitRatio: logs?.cacheHitRatio || 0,
          averageResponseTime: logs?.averageResponseTime || 0,
          exportedAt: logs?.exportedAt
        },
        maintenance: {
          events: maintenanceEvents,
          summary: this.summarizeMaintenanceEvents(maintenanceEvents)
        },
        generated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to generate logging report:', error);
      
      // Fallback to maintenance events only
      const maintenanceEvents = this.getMaintenanceEvents();
      return {
        serviceWorker: {
          error: error.message,
          supported: this.isLoggerSupported()
        },
        maintenance: {
          events: maintenanceEvents,
          summary: this.summarizeMaintenanceEvents(maintenanceEvents)
        },
        generated: new Date().toISOString()
      };
    }
  }

  /**
   * Summarize maintenance events for reporting
   * @param {Array} events - Maintenance events
   * @returns {Object} Summary statistics
   */
  summarizeMaintenanceEvents(events) {
    const summary = {
      totalEvents: events.length,
      eventTypes: {},
      sessions: new Set(),
      totalPageViews: 0,
      totalRetryAttempts: 0,
      totalRecoveries: 0,
      averageSessionDuration: 0,
      successfulRecoveries: 0,
      failedRetries: 0
    };

    let totalDuration = 0;
    let durationCount = 0;

    events.forEach(event => {
      const { eventType, data } = event;
      
      // Count event types
      summary.eventTypes[eventType] = (summary.eventTypes[eventType] || 0) + 1;
      
      // Track sessions
      if (data.sessionId) {
        summary.sessions.add(data.sessionId);
      }
      
      // Count specific events
      if (eventType === 'page_view') {
        summary.totalPageViews++;
      } else if (eventType === 'retry_attempt') {
        summary.totalRetryAttempts++;
      } else if (eventType === 'server_recovery') {
        summary.totalRecoveries++;
        if (data.successful) {
          summary.successfulRecoveries++;
        }
      } else if (eventType === 'retry_failure') {
        summary.failedRetries++;
      } else if (eventType === 'page_unload' && data.duration) {
        totalDuration += data.duration;
        durationCount++;
      }
    });

    summary.uniqueSessions = summary.sessions.size;
    summary.averageSessionDuration = durationCount > 0 ? totalDuration / durationCount : 0;
    summary.retrySuccessRate = summary.totalRetryAttempts > 0 
      ? (summary.successfulRecoveries / summary.totalRetryAttempts) * 100 
      : 0;

    return summary;
  }

  /**
   * Export logs as downloadable file
   * @param {string} filename - Filename for the export
   */
  async exportLogsAsFile(filename = 'sw-logs-export.json') {
    try {
      const report = await this.getLoggingReport();
      
      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      return true;
    } catch (error) {
      console.error('Failed to export logs:', error);
      return false;
    }
  }

  /**
   * Get real-time metrics for dashboard display
   * @returns {Promise<Object>} Real-time metrics
   */
  async getRealTimeMetrics() {
    try {
      const metrics = await this.getMetrics();
      const maintenanceEvents = this.getMaintenanceEvents();
      const recentEvents = maintenanceEvents.filter(
        event => Date.now() - event.data.timestamp < 300000 // Last 5 minutes
      );

      return {
        cache: {
          hitRatio: metrics.cacheHitRatio || 0,
          totalRequests: metrics.metrics?.requests?.total || 0,
          cachedRequests: metrics.metrics?.requests?.cached || 0,
          networkRequests: metrics.metrics?.requests?.network || 0,
          failedRequests: metrics.metrics?.requests?.failed || 0
        },
        performance: {
          averageResponseTime: metrics.averageResponseTime || 0
        },
        maintenance: {
          recentEvents: recentEvents.length,
          activeMaintenanceSessions: new Set(
            recentEvents.map(e => e.data.sessionId)
          ).size
        },
        errors: {
          total: metrics.metrics?.errors?.total || 0,
          network: metrics.metrics?.errors?.network || 0,
          cache: metrics.metrics?.errors?.cache || 0
        },
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get real-time metrics:', error);
      return {
        error: error.message,
        lastUpdated: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const serviceWorkerLogger = new ServiceWorkerLoggerClient();

export default serviceWorkerLogger;
export { ServiceWorkerLoggerClient };