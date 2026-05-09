/**
 * Date Utilities Module
 * 
 * This module provides utility functions for date and time operations,
 * including formatting, timezone handling, and date calculations.
 * All functions handle edge cases and provide consistent behavior.
 * 
 * @version 1.0.0
 * @author SIMRS Order UI Team
 */

import { APP_CONFIG } from '../config/constants.js';

/**
 * Date utility class for date and time operations
 */
class DateUtil {
  /**
   * Check if a date is valid
   * @param {Date|string} date - Date to validate
   * @returns {boolean} - Whether date is valid
   */
  static isValidDate(date) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      return !isNaN(d.getTime());
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert local datetime string to ISO format
   * @param {string} localDatetimeStr - Local datetime string (YYYY-MM-DDTHH:mm)
   * @returns {string|null} - ISO string or null if invalid
   */
  static isoFromLocalDatetime(localDatetimeStr) {
    if (!localDatetimeStr || typeof localDatetimeStr !== 'string') {
      return null;
    }

    try {
      const date = new Date(localDatetimeStr);
      if (!this.isValidDate(date)) {
        return null;
      }

      // Adjust for timezone offset to get local time in ISO format
      const adjustedDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return adjustedDate.toISOString();
    } catch (error) {
      console.warn('Failed to convert local datetime to ISO:', error);
      return null;
    }
  }

  /**
   * Format date to YYYY-MM-DD format
   * @param {Date|string} date - Date to format
   * @returns {string} - Formatted date string or empty string if invalid
   */
  static formatDateLocal(date) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (!this.isValidDate(d)) {
        return '';
      }

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.warn('Failed to format date:', error);
      return '';
    }
  }

  /**
   * Format date to YYYY-MM-DDTHH:mm format
   * @param {Date|string} date - Date to format
   * @returns {string} - Formatted datetime string or empty string if invalid
   */
  static formatDatetimeLocal(date) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (!this.isValidDate(d)) {
        return '';
      }

      const datePart = this.formatDateLocal(d);
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      
      return `${datePart}T${hours}:${minutes}`;
    } catch (error) {
      console.warn('Failed to format datetime:', error);
      return '';
    }
  }

  /**
   * Calculate date that is N days before today
   * @param {number} days - Number of days to subtract
   * @returns {string} - Date string in YYYY-MM-DD format
   */
  static getDateMinusDays(days = APP_CONFIG.DATE_TIME.H_MINUS_7_DAYS) {
    try {
      const now = new Date();
      const targetDate = new Date(now.getTime());
      targetDate.setDate(now.getDate() - days);
      
      return this.formatDateLocal(targetDate);
    } catch (error) {
      console.warn('Failed to calculate date minus days:', error);
      return '';
    }
  }

  /**
   * Get H-7 date (7 days before today)
   * @returns {string} - Date string in YYYY-MM-DD format
   */
  static getHMinus7Date() {
    return this.getDateMinusDays(APP_CONFIG.DATE_TIME.H_MINUS_7_DAYS);
  }

  /**
   * Add hours to a date
   * @param {Date|string} date - Base date
   * @param {number} hours - Hours to add
   * @returns {Date|null} - New date or null if invalid
   */
  static addHours(date, hours) {
    try {
      const d = date instanceof Date ? new Date(date) : new Date(date);
      if (!this.isValidDate(d)) {
        return null;
      }

      d.setHours(d.getHours() + hours);
      return d;
    } catch (error) {
      console.warn('Failed to add hours to date:', error);
      return null;
    }
  }

  /**
   * Add minutes to a date
   * @param {Date|string} date - Base date
   * @param {number} minutes - Minutes to add
   * @returns {Date|null} - New date or null if invalid
   */
  static addMinutes(date, minutes) {
    try {
      const d = date instanceof Date ? new Date(date) : new Date(date);
      if (!this.isValidDate(d)) {
        return null;
      }

      d.setMinutes(d.getMinutes() + minutes);
      return d;
    } catch (error) {
      console.warn('Failed to add minutes to date:', error);
      return null;
    }
  }

  /**
   * Check if two dates are on the same day
   * @param {Date|string} date1 - First date
   * @param {Date|string} date2 - Second date
   * @returns {boolean} - Whether dates are on same day
   */
  static isSameDay(date1, date2) {
    try {
      const d1 = date1 instanceof Date ? date1 : new Date(date1);
      const d2 = date2 instanceof Date ? date2 : new Date(date2);
      
      if (!this.isValidDate(d1) || !this.isValidDate(d2)) {
        return false;
      }

      return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
      );
    } catch (error) {
      console.warn('Failed to compare dates:', error);
      return false;
    }
  }

  /**
   * Check if a date is in the past
   * @param {Date|string} date - Date to check
   * @returns {boolean} - Whether date is in the past
   */
  static isPastDate(date) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (!this.isValidDate(d)) {
        return false;
      }

      return d < new Date();
    } catch (error) {
      console.warn('Failed to check if date is past:', error);
      return false;
    }
  }

  /**
   * Check if a date is in the future
   * @param {Date|string} date - Date to check
   * @returns {boolean} - Whether date is in the future
   */
  static isFutureDate(date) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (!this.isValidDate(d)) {
        return false;
      }

      return d > new Date();
    } catch (error) {
      console.warn('Failed to check if date is future:', error);
      return false;
    }
  }

  /**
   * Get current timestamp in milliseconds
   * @returns {number} - Current timestamp
   */
  static now() {
    return Date.now();
  }

  /**
   * Get current date in YYYY-MM-DD format
   * @returns {string} - Current date string
   */
  static today() {
    return this.formatDateLocal(new Date());
  }

  /**
   * Get current datetime in YYYY-MM-DDTHH:mm format
   * @returns {string} - Current datetime string
   */
  static nowLocal() {
    return this.formatDatetimeLocal(new Date());
  }

  /**
   * Parse date from various formats
   * @param {string} dateStr - Date string to parse
   * @returns {Date|null} - Parsed date or null if invalid
   */
  static parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
      return null;
    }

    try {
      // Try different date formats
      const formats = [
        dateStr, // Original format
        dateStr.replace(/\//g, '-'), // Replace slashes with dashes
        dateStr.replace(/\./g, '-'), // Replace dots with dashes
      ];

      for (const format of formats) {
        const date = new Date(format);
        if (this.isValidDate(date)) {
          return date;
        }
      }

      return null;
    } catch (error) {
      console.warn('Failed to parse date:', error);
      return null;
    }
  }

  /**
   * Calculate age from birth date
   * @param {Date|string} birthDate - Birth date
   * @returns {number|null} - Age in years or null if invalid
   */
  static calculateAge(birthDate) {
    try {
      const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
      if (!this.isValidDate(birth)) {
        return null;
      }

      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }

      return age >= 0 ? age : null;
    } catch (error) {
      console.warn('Failed to calculate age:', error);
      return null;
    }
  }

  /**
   * Get time difference in human readable format
   * @param {Date|string} date - Date to compare with now
   * @returns {string} - Human readable time difference
   */
  static getTimeAgo(date) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (!this.isValidDate(d)) {
        return 'tidak diketahui';
      }

      const now = new Date();
      const diffMs = now - d;
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        return `${diffDays} hari yang lalu`;
      } else if (diffHours > 0) {
        return `${diffHours} jam yang lalu`;
      } else if (diffMinutes > 0) {
        return `${diffMinutes} menit yang lalu`;
      } else {
        return 'baru saja';
      }
    } catch (error) {
      console.warn('Failed to get time ago:', error);
      return 'tidak diketahui';
    }
  }
}

/**
 * Registration number formatting utilities
 */
export const RegistrationFormatter = {
  /**
   * Format registration number for a service type
   * @param {string} serviceType - Service type (RJ, RI, IGD)
   * @param {string|Date} date - Date for registration
   * @param {number} sequence - Sequence number
   * @returns {string} - Formatted registration number
   */
  formatRegistration(serviceType, date, sequence) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (!DateUtil.isValidDate(d)) {
        return '';
      }

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const prefix = (serviceType || APP_CONFIG.REGISTRATION.DEFAULT_SERVICE_TYPE).toUpperCase();
      const seqStr = String(sequence || 1).padStart(APP_CONFIG.REGISTRATION.SEQUENCE_PADDING, '0');

      return `${prefix}${year}${day}${month}${seqStr}`;
    } catch (error) {
      console.warn('Failed to format registration:', error);
      return '';
    }
  },

  /**
   * Format RJ (Rawat Jalan) registration number
   * @param {string|Date} date - Date for registration
   * @param {number} sequence - Sequence number
   * @returns {string} - Formatted RJ registration number
   */
  formatRJRegistration(date, sequence) {
    return this.formatRegistration(APP_CONFIG.SERVICE_TYPES.RAWAT_JALAN, date, sequence);
  },

  /**
   * Format RI (Rawat Inap) registration number
   * @param {string|Date} date - Date for registration
   * @param {number} sequence - Sequence number
   * @returns {string} - Formatted RI registration number
   */
  formatRIRegistration(date, sequence) {
    return this.formatRegistration(APP_CONFIG.SERVICE_TYPES.RAWAT_INAP, date, sequence);
  },

  /**
   * Format IGD registration number
   * @param {string|Date} date - Date for registration
   * @param {number} sequence - Sequence number
   * @returns {string} - Formatted IGD registration number
   */
  formatIGDRegistration(date, sequence) {
    return this.formatRegistration(APP_CONFIG.SERVICE_TYPES.IGD, date, sequence);
  },
};

// Export the main DateUtil class and specialized utilities
// Named exports for convenience
export const formatDate = DateUtil.formatDateLocal;
export const formatDateTime = DateUtil.formatDatetimeLocal;
export const formatTime = (date) => {
  try {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (!DateUtil.isValidDate(d)) return '';
    
    return d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (error) {
    console.error('Error formatting time:', error);
    return '';
  }
};
export const parseDate = DateUtil.parseDate;
export const isValidDate = DateUtil.isValidDate;
export const isPastDate = DateUtil.isPastDate;
export const isFutureDate = DateUtil.isFutureDate;

// Additional exports needed by app.js
export const formatDateLocal = DateUtil.formatDateLocal;
export const formatRegistration = RegistrationFormatter.formatRegistration;
export const addHours = DateUtil.addHours;

export { DateUtil };

export default {
  DateUtil,
  RegistrationFormatter,
  formatDate,
  formatDateTime,
  formatTime,
  parseDate,
  isValidDate,
  isPastDate,
  isFutureDate,
};