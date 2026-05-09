/**
 * Performance monitoring utility for tracking component and operation performance
 */

class PerformanceMonitor {
  constructor(name) {
    this.name = name;
    this.startTime = null;
    this.endTime = null;
    this.measurements = new Map();
  }

  /**
   * Start performance measurement
   * @param {string} label - Optional label for the measurement
   */
  start(label = "default") {
    const timestamp = performance.now();
    this.measurements.set(label, {
      startTime: timestamp,
      endTime: null,
      duration: null,
    });

    if (label === "default") {
      this.startTime = timestamp;
    }

    if (process.env.NODE_ENV === "development") {
      // console.debug(`Performance: ${this.name}${label !== 'default' ? ` (${label})` : ''} started at ${timestamp.toFixed(2)}ms`)
    }
  }

  /**
   * End performance measurement
   * @param {string} label - Optional label for the measurement
   * @returns {number} Duration in milliseconds
   */
  end(label = "default") {
    const timestamp = performance.now();
    const measurement = this.measurements.get(label);

    if (!measurement || !measurement.startTime) {
      if (process.env.NODE_ENV === "development") {
        // console.warn(
        //   `Performance: No start time found for ${this.name}${
        //     label !== "default" ? ` (${label})` : ""
        //   }`
        // );
      }
      return 0;
    }

    const duration = timestamp - measurement.startTime;
    measurement.endTime = timestamp;
    measurement.duration = duration;

    if (label === "default") {
      this.endTime = timestamp;
    }

    if (process.env.NODE_ENV === "development") {
      console.debug(
        `Performance: ${this.name}${
          label !== "default" ? ` (${label})` : ""
        } completed in ${duration.toFixed(2)}ms`
      );
    }

    return duration;
  }

  /**
   * Get measurement results
   * @param {string} label - Optional label for the measurement
   * @returns {object} Measurement data
   */
  getMeasurement(label = "default") {
    return this.measurements.get(label) || null;
  }

  /**
   * Get all measurements
   * @returns {Map} All measurements
   */
  getAllMeasurements() {
    return this.measurements;
  }

  /**
   * Reset all measurements
   */
  reset() {
    this.measurements.clear();
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Log performance summary
   */
  logSummary() {
    if (process.env.NODE_ENV === "development") {
      console.group(`Performance Summary: ${this.name}`);

      for (const [label, measurement] of this.measurements) {
        if (measurement.duration !== null) {
          console.log(`${label}: ${measurement.duration.toFixed(2)}ms`);
        } else {
          console.log(`${label}: In progress...`);
        }
      }

      console.groupEnd();
    }
  }
}

/**
 * Create a new performance monitor instance
 * @param {string} name - Name of the performance monitor
 * @returns {PerformanceMonitor} New performance monitor instance
 */
export const createPerformanceMonitor = (name) => {
  return new PerformanceMonitor(name);
};

/**
 * Measure the execution time of a function
 * @param {string} name - Name of the operation
 * @param {Function} fn - Function to measure
 * @returns {Promise|any} Result of the function
 */
export const measurePerformance = async (name, fn) => {
  const monitor = new PerformanceMonitor(name);
  monitor.start();

  try {
    const result = await fn();
    monitor.end();
    return result;
  } catch (error) {
    monitor.end();
    if (process.env.NODE_ENV === "development") {
      console.error(
        `Performance: ${name} failed after ${
          monitor.getMeasurement().duration?.toFixed(2) || "unknown"
        }ms`,
        error
      );
    }
    throw error;
  }
};

/**
 * Performance decorator for class methods
 * @param {string} name - Name of the operation
 */
export const performanceDecorator = (name) => {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
      const monitor = new PerformanceMonitor(
        `${target.constructor.name}.${propertyKey}`
      );
      monitor.start();

      try {
        const result = await originalMethod.apply(this, args);
        monitor.end();
        return result;
      } catch (error) {
        monitor.end();
        throw error;
      }
    };

    return descriptor;
  };
};

export { PerformanceMonitor };
export default PerformanceMonitor;
