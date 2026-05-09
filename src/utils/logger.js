/**
 * Environment-aware Logger Utility
 *
 * Log Levels:
 * - debug: Verbose logging for development (all messages)
 * - info: Informational messages (default for development)
 * - warn: Warning messages
 * - error: Error messages only
 * - silent: No logging (production default)
 *
 * Usage:
 * import { logger } from '../utils/logger'
 * logger.debug('[AUTH]', 'Debug message')
 * logger.info('[AUTH]', 'Info message')
 * logger.warn('[AUTH]', 'Warning message')
 * logger.error('[AUTH]', 'Error message')
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
}

class Logger {
  constructor() {
    // Get log level from environment, default to 'info' for dev, 'error' for production
    const envLogLevel = import.meta.env.VITE_LOG_LEVEL ||
                       (import.meta.env.PROD ? 'error' : 'info')

    this.level = LOG_LEVELS[envLogLevel] || LOG_LEVELS.info
    this.isDevelopment = !import.meta.env.PROD
  }

  /**
   * Check if log level is enabled
   */
  shouldLog(level) {
    return LOG_LEVELS[level] >= this.level
  }

  /**
   * Format log message with timestamp
   */
  formatMessage(prefix, ...args) {
    if (this.isDevelopment) {
      // In development, show timestamp
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
      return [`[${timestamp}]`, prefix, ...args]
    }
    return [prefix, ...args]
  }

  /**
   * Debug level - verbose logging for development
   * Hidden in production unless explicitly enabled
   */
  debug(prefix, ...args) {
    if (this.shouldLog('debug')) {
      console.log(...this.formatMessage(prefix, ...args))
    }
  }

  /**
   * Info level - general informational messages
   * Shown in development, hidden in production by default
   */
  info(prefix, ...args) {
    if (this.shouldLog('info')) {
      console.log(...this.formatMessage(prefix, ...args))
    }
  }

  /**
   * Warning level - important warnings
   * Shown in both dev and production
   */
  warn(prefix, ...args) {
    if (this.shouldLog('warn')) {
      console.warn(...this.formatMessage(prefix, ...args))
    }
  }

  /**
   * Error level - critical errors only
   * ALWAYS shown (unless silent mode)
   */
  error(prefix, ...args) {
    if (this.shouldLog('error')) {
      console.error(...this.formatMessage(prefix, ...args))
    }
  }

  /**
   * Group logging for development
   */
  group(label, collapsed = true) {
    if (this.isDevelopment && this.shouldLog('debug')) {
      if (collapsed) {
        console.groupCollapsed(label)
      } else {
        console.group(label)
      }
    }
  }

  groupEnd() {
    if (this.isDevelopment && this.shouldLog('debug')) {
      console.groupEnd()
    }
  }

  /**
   * Table logging for development
   */
  table(data) {
    if (this.isDevelopment && this.shouldLog('debug')) {
      console.table(data)
    }
  }
}

// Export singleton instance
export const logger = new Logger()

// Export log levels for external use
export { LOG_LEVELS }

/**
 * Example usage:
 *
 * Development (.env):
 * VITE_LOG_LEVEL=debug
 * → Shows ALL logs (debug, info, warn, error)
 *
 * Development (.env):
 * VITE_LOG_LEVEL=info
 * → Shows info, warn, error (DEFAULT for dev)
 *
 * Production:
 * VITE_LOG_LEVEL=error
 * → Shows ONLY errors (DEFAULT for production)
 *
 * Production:
 * VITE_LOG_LEVEL=silent
 * → Shows NOTHING (complete silence)
 */
