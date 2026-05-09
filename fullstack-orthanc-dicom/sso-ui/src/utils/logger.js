/**
 * Centralized Logging Utility for SSO UI Application
 *
 * Provides standardized logging with consistent format:
 * [<timestamp>] [<component_name>] <status_message>
 *
 * Features:
 * - Standardized log format with ISO 8601 timestamps
 * - Component lifecycle tracking
 * - Performance monitoring with duration tracking
 * - Error handling with stack traces
 * - Different log levels (info, warn, error, debug)
 * - Context information for debugging
 */

import React from "react";

// Log levels configuration
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Current log level (can be configured via environment)
const CURRENT_LOG_LEVEL =
  process.env.NODE_ENV === "development" ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

// Color codes for different log types
const LOG_COLORS = {
  DEBUG: "#6B7280", // Gray
  INFO: "#3B82F6", // Blue
  WARN: "#F59E0B", // Amber
  ERROR: "#EF4444", // Red
  SUCCESS: "#10B981", // Green
};

/**
 * Format timestamp to ISO 8601 format
 */
const formatTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Create standardized log message
 */
const createLogMessage = (componentName, message, level = "INFO") => {
  const timestamp = formatTimestamp();
  return `[${timestamp}] [${componentName}] ${message}`;
};

/**
 * Base logging function
 */
const log = (level, componentName, message, data = null, error = null) => {
  if (LOG_LEVELS[level] < CURRENT_LOG_LEVEL) {
    return;
  }

  // Only log in development for DEBUG and INFO levels
  if (
    (level === "DEBUG" || level === "INFO") &&
    process.env.NODE_ENV !== "development"
  ) {
    return;
  }

  const logMessage = createLogMessage(componentName, message, level);
  const color = LOG_COLORS[level] || LOG_COLORS.INFO;

  // Choose appropriate console method
  const consoleMethod =
    {
      DEBUG: console.debug,
      INFO: console.info,
      WARN: console.warn,
      ERROR: console.error,
    }[level] || console.log;

  // Log with styling in development
  if (process.env.NODE_ENV === "development") {
    consoleMethod(`%c${logMessage}`, `color: ${color}; font-weight: bold;`);

    if (data && (level === "ERROR" || level === "WARN")) {
      console.log(`%c📊 Data:`, `color: ${color};`, data);
    }

    if (error) {
      console.error(
        `%c❌ Error Details:`,
        `color: ${LOG_COLORS.ERROR};`,
        error
      );
      if (error.stack) {
        console.error(
          `%c📋 Stack Trace:`,
          `color: ${LOG_COLORS.ERROR};`,
          error.stack
        );
      }
    }
  } else {
    // Production logging (only errors and warnings)
    if (level === "ERROR" || level === "WARN") {
      consoleMethod(logMessage);
      if (error) console.error("Error:", error);
    }
  }
};

/**
 * Component Logger Class
 * Provides component-specific logging with lifecycle tracking
 */
class ComponentLogger {
  constructor(componentName) {
    this.componentName = componentName;
    this.startTime = null;
    this.mountTime = null;
  }

  /**
   * Log component mount start
   */
  mountStart() {
    this.startTime = performance.now();
    // this.info('🚀 Component mounting started')
  }

  /**
   * Log component mount completion
   */
  mountComplete(additionalData = {}) {
    this.mountTime = performance.now();
    const duration = this.startTime
      ? (this.mountTime - this.startTime).toFixed(2)
      : "unknown";

    // this.success(`✅ Component mounted successfully (${duration}ms)`, {
    //   mountDuration: duration,
    //   ...additionalData,
    // });
  }

  /**
   * Log data loading start
   */
  dataLoadStart(dataType = "data") {
    this.info(`📡 Loading ${dataType}...`);
  }

  /**
   * Log data loading success
   */
  dataLoadSuccess(dataType = "data", data = null, duration = null) {
    const durationText = duration ? ` (${duration}ms)` : "";
    this.success(`✅ ${dataType} loaded successfully${durationText}`, data);
  }

  /**
   * Log data loading error
   */
  dataLoadError(dataType = "data", error) {
    this.error(`❌ Failed to load ${dataType}`, null, error);
  }

  /**
   * Log API call start
   */
  apiCallStart(endpoint, method = "GET") {
    this.info(`🌐 API call started: ${method} ${endpoint}`);
  }

  /**
   * Log API call success
   */
  apiCallSuccess(endpoint, method = "GET", response = null, duration = null) {
    const durationText = duration ? ` (${duration}ms)` : "";
    this.success(
      `✅ API call successful: ${method} ${endpoint}${durationText}`,
      response
    );
  }

  /**
   * Log API call error
   */
  apiCallError(endpoint, method = "GET", error) {
    this.error(`❌ API call failed: ${method} ${endpoint}`, null, error);
  }

  /**
   * Log user interaction
   */
  userAction(action, data = null) {
    this.info(`👆 User action: ${action}`, data);
  }

  /**
   * Log permission check
   */
  permissionCheck(permission, granted) {
    const status = granted ? "✅ granted" : "❌ denied";
    this.info(`🔐 Permission check: ${permission} - ${status}`);
  }

  /**
   * Log navigation
   */
  navigation(from, to) {
    this.info(`🧭 Navigation: ${from} → ${to}`);
  }

  /**
   * Debug level logging
   */
  debug(message, data = null) {
    log("DEBUG", this.componentName, message, data);
  }

  /**
   * Info level logging
   */
  info(message, data = null) {
    log("INFO", this.componentName, message, data);
  }

  /**
   * Success logging (special case of info)
   */
  success(message, data = null) {
    if (process.env.NODE_ENV === "development") {
      const logMessage = createLogMessage(this.componentName, message);
      console.log(
        `%c${logMessage}`,
        `color: ${LOG_COLORS.SUCCESS}; font-weight: bold;`
      );
      if (data) {
        console.log(`%c📊 Data:`, `color: ${LOG_COLORS.SUCCESS};`, data);
      }
    } else {
      log("INFO", this.componentName, message, data);
    }
  }

  /**
   * Warning level logging
   */
  warn(message, data = null) {
    log("WARN", this.componentName, message, data);
  }

  /**
   * Error level logging
   */
  error(message, data = null, error = null) {
    log("ERROR", this.componentName, message, data, error);
  }

  /**
   * Log component unmount
   */
  unmount() {
    // this.info("🔄 Component unmounting");
  }
}

/**
 * Create a component logger instance
 */
export const createLogger = (componentName) => {
  return new ComponentLogger(componentName);
};

/**
 * Global logger for general use
 */
export const globalLogger = {
  debug: (message, data) => log("DEBUG", "GLOBAL", message, data),
  info: (message, data) => log("INFO", "GLOBAL", message, data),
  warn: (message, data) => log("WARN", "GLOBAL", message, data),
  error: (message, data, error) => log("ERROR", "GLOBAL", message, data, error),
};

/**
 * React Hook for component logging
 */
export const useComponentLogger = (componentName) => {
  const logger = React.useMemo(
    () => createLogger(componentName),
    [componentName]
  );

  // Log mount and unmount
  React.useEffect(() => {
    logger.mountStart();
    logger.mountComplete();

    return () => {
      logger.unmount();
    };
  }, [logger]);

  return logger;
};

/**
 * Higher-order component for automatic logging
 */
export const withLogging = (WrappedComponent, componentName) => {
  const LoggedComponent = (props) => {
    const logger = useComponentLogger(componentName || WrappedComponent.name);

    return React.createElement(WrappedComponent, { ...props, logger });
  };

  LoggedComponent.displayName = `withLogging(${
    componentName || WrappedComponent.name
  })`;
  return LoggedComponent;
};

export default {
  createLogger,
  globalLogger,
  useComponentLogger,
  withLogging,
};
