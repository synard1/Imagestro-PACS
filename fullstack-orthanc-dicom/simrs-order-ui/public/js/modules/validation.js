/**
 * Validation Module
 * 
 * This module provides comprehensive validation functionality for forms,
 * data validation, and business rules. It includes built-in validators
 * for common use cases and allows custom validation rules with proper
 * error handling and user feedback.
 * 
 * @version 1.0.0
 * @author SIMRS Order UI Team
 */

import { APP_CONFIG } from '../config/constants.js';
import { parseDate, isValidDate, isPastDate, isFutureDate } from '../utils/date.js';

/**
 * Base Validator class
 */
class BaseValidator {
  constructor(message = '') {
    this.message = message;
  }

  /**
   * Validate value
   * @param {any} value - Value to validate
   * @param {Object} context - Validation context
   * @returns {boolean} - Validation result
   */
  validate(value, context = {}) {
    throw new Error('validate method must be implemented');
  }

  /**
   * Get error message
   * @param {string} fieldName - Field name
   * @param {any} value - Field value
   * @returns {string} - Error message
   */
  getMessage(fieldName = 'Field', value = '') {
    return this.message || `${fieldName} tidak valid`;
  }
}

/**
 * Required field validator
 */
class RequiredValidator extends BaseValidator {
  constructor(message = '') {
    super(message);
  }

  validate(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  getMessage(fieldName) {
    return this.message || `${fieldName} wajib diisi`;
  }
}

/**
 * String length validator
 */
class LengthValidator extends BaseValidator {
  constructor(min = 0, max = Infinity, message = '') {
    super(message);
    this.min = min;
    this.max = max;
  }

  validate(value) {
    if (!value) return true; // Let required validator handle empty values
    const length = String(value).length;
    return length >= this.min && length <= this.max;
  }

  getMessage(fieldName) {
    if (this.message) return this.message;
    
    if (this.min > 0 && this.max < Infinity) {
      return `${fieldName} harus antara ${this.min} dan ${this.max} karakter`;
    } else if (this.min > 0) {
      return `${fieldName} minimal ${this.min} karakter`;
    } else {
      return `${fieldName} maksimal ${this.max} karakter`;
    }
  }
}

/**
 * Email validator
 */
class EmailValidator extends BaseValidator {
  constructor(message = '') {
    super(message);
    this.emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  }

  validate(value) {
    if (!value) return true; // Let required validator handle empty values
    return this.emailRegex.test(String(value));
  }

  getMessage(fieldName) {
    return this.message || `${fieldName} harus berupa email yang valid`;
  }
}

/**
 * Phone number validator
 */
class PhoneValidator extends BaseValidator {
  constructor(message = '') {
    super(message);
    this.phoneRegex = /^(\+62|62|0)[0-9]{8,13}$/;
  }

  validate(value) {
    if (!value) return true; // Let required validator handle empty values
    const cleanValue = String(value).replace(/[\s\-\(\)]/g, '');
    return this.phoneRegex.test(cleanValue);
  }

  getMessage(fieldName) {
    return this.message || `${fieldName} harus berupa nomor telepon yang valid`;
  }
}

/**
 * Numeric validator
 */
class NumericValidator extends BaseValidator {
  constructor(min = -Infinity, max = Infinity, message = '') {
    super(message);
    this.min = min;
    this.max = max;
  }

  validate(value) {
    if (!value && value !== 0) return true; // Let required validator handle empty values
    const numValue = Number(value);
    if (isNaN(numValue)) return false;
    return numValue >= this.min && numValue <= this.max;
  }

  getMessage(fieldName) {
    if (this.message) return this.message;
    
    if (this.min > -Infinity && this.max < Infinity) {
      return `${fieldName} harus berupa angka antara ${this.min} dan ${this.max}`;
    } else if (this.min > -Infinity) {
      return `${fieldName} harus berupa angka minimal ${this.min}`;
    } else if (this.max < Infinity) {
      return `${fieldName} harus berupa angka maksimal ${this.max}`;
    } else {
      return `${fieldName} harus berupa angka`;
    }
  }
}

/**
 * Date validator
 */
class DateValidator extends BaseValidator {
  constructor(options = {}) {
    super(options.message || '');
    this.allowPast = options.allowPast !== false;
    this.allowFuture = options.allowFuture !== false;
    this.minDate = options.minDate;
    this.maxDate = options.maxDate;
  }

  validate(value) {
    if (!value) return true; // Let required validator handle empty values
    
    const date = parseDate(value);
    if (!isValidDate(date)) return false;

    if (!this.allowPast && isPastDate(date)) return false;
    if (!this.allowFuture && isFutureDate(date)) return false;

    if (this.minDate && date < parseDate(this.minDate)) return false;
    if (this.maxDate && date > parseDate(this.maxDate)) return false;

    return true;
  }

  getMessage(fieldName) {
    if (this.message) return this.message;
    
    if (!this.allowPast) {
      return `${fieldName} tidak boleh tanggal masa lalu`;
    } else if (!this.allowFuture) {
      return `${fieldName} tidak boleh tanggal masa depan`;
    } else {
      return `${fieldName} harus berupa tanggal yang valid`;
    }
  }
}

/**
 * Pattern validator (regex)
 */
class PatternValidator extends BaseValidator {
  constructor(pattern, message = '') {
    super(message);
    this.pattern = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  }

  validate(value) {
    if (!value) return true; // Let required validator handle empty values
    return this.pattern.test(String(value));
  }

  getMessage(fieldName) {
    return this.message || `${fieldName} format tidak valid`;
  }
}

/**
 * Custom validator
 */
class CustomValidator extends BaseValidator {
  constructor(validatorFunction, message = '') {
    super(message);
    this.validatorFunction = validatorFunction;
  }

  validate(value, context) {
    return this.validatorFunction(value, context);
  }

  getMessage(fieldName) {
    return this.message || `${fieldName} tidak valid`;
  }
}

/**
 * Validation Schema class
 */
class ValidationSchema {
  constructor() {
    this.rules = new Map();
  }

  /**
   * Add validation rule for a field
   * @param {string} fieldName - Field name
   * @param {Array|BaseValidator} validators - Validators
   * @returns {ValidationSchema} - Schema instance for chaining
   */
  field(fieldName, validators) {
    if (!Array.isArray(validators)) {
      validators = [validators];
    }
    this.rules.set(fieldName, validators);
    return this;
  }

  /**
   * Add required validation
   * @param {string} fieldName - Field name
   * @param {string} message - Custom message
   * @returns {ValidationSchema} - Schema instance for chaining
   */
  required(fieldName, message = '') {
    const existing = this.rules.get(fieldName) || [];
    existing.unshift(new RequiredValidator(message));
    this.rules.set(fieldName, existing);
    return this;
  }

  /**
   * Add length validation
   * @param {string} fieldName - Field name
   * @param {number} min - Minimum length
   * @param {number} max - Maximum length
   * @param {string} message - Custom message
   * @returns {ValidationSchema} - Schema instance for chaining
   */
  length(fieldName, min, max = Infinity, message = '') {
    const existing = this.rules.get(fieldName) || [];
    existing.push(new LengthValidator(min, max, message));
    this.rules.set(fieldName, existing);
    return this;
  }

  /**
   * Add email validation
   * @param {string} fieldName - Field name
   * @param {string} message - Custom message
   * @returns {ValidationSchema} - Schema instance for chaining
   */
  email(fieldName, message = '') {
    const existing = this.rules.get(fieldName) || [];
    existing.push(new EmailValidator(message));
    this.rules.set(fieldName, existing);
    return this;
  }

  /**
   * Add phone validation
   * @param {string} fieldName - Field name
   * @param {string} message - Custom message
   * @returns {ValidationSchema} - Schema instance for chaining
   */
  phone(fieldName, message = '') {
    const existing = this.rules.get(fieldName) || [];
    existing.push(new PhoneValidator(message));
    this.rules.set(fieldName, existing);
    return this;
  }

  /**
   * Add numeric validation
   * @param {string} fieldName - Field name
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {string} message - Custom message
   * @returns {ValidationSchema} - Schema instance for chaining
   */
  numeric(fieldName, min = -Infinity, max = Infinity, message = '') {
    const existing = this.rules.get(fieldName) || [];
    existing.push(new NumericValidator(min, max, message));
    this.rules.set(fieldName, existing);
    return this;
  }

  /**
   * Add date validation
   * @param {string} fieldName - Field name
   * @param {Object} options - Date validation options
   * @returns {ValidationSchema} - Schema instance for chaining
   */
  date(fieldName, options = {}) {
    const existing = this.rules.get(fieldName) || [];
    existing.push(new DateValidator(options));
    this.rules.set(fieldName, existing);
    return this;
  }

  /**
   * Add pattern validation
   * @param {string} fieldName - Field name
   * @param {RegExp|string} pattern - Regex pattern
   * @param {string} message - Custom message
   * @returns {ValidationSchema} - Schema instance for chaining
   */
  pattern(fieldName, pattern, message = '') {
    const existing = this.rules.get(fieldName) || [];
    existing.push(new PatternValidator(pattern, message));
    this.rules.set(fieldName, existing);
    return this;
  }

  /**
   * Add custom validation
   * @param {string} fieldName - Field name
   * @param {Function} validatorFunction - Custom validator function
   * @param {string} message - Custom message
   * @returns {ValidationSchema} - Schema instance for chaining
   */
  custom(fieldName, validatorFunction, message = '') {
    const existing = this.rules.get(fieldName) || [];
    existing.push(new CustomValidator(validatorFunction, message));
    this.rules.set(fieldName, existing);
    return this;
  }

  /**
   * Validate data against schema
   * @param {Object} data - Data to validate
   * @param {string} fieldName - Specific field to validate (optional)
   * @returns {Object} - Validation result
   */
  validate(data, fieldName = null) {
    const errors = {};
    let isValid = true;

    const fieldsToValidate = fieldName ? [fieldName] : Array.from(this.rules.keys());

    for (const field of fieldsToValidate) {
      const validators = this.rules.get(field) || [];
      const value = data[field];

      for (const validator of validators) {
        try {
          if (!validator.validate(value, data)) {
            errors[field] = validator.getMessage(field, value);
            isValid = false;
            break; // Stop at first error for this field
          }
        } catch (error) {
          console.error(`Validation error for field ${field}:`, error);
          errors[field] = 'Terjadi kesalahan validasi';
          isValid = false;
          break;
        }
      }
    }

    return {
      isValid,
      errors,
    };
  }
}

/**
 * Predefined validation schemas for common forms
 */
export const ValidationSchemas = {
  /**
   * Patient registration form validation
   */
  patientRegistration: new ValidationSchema()
    .required('patient_id', 'ID Pasien wajib diisi')
    .length('patient_id', 3, 20, 'ID Pasien harus 3-20 karakter')
    .required('patient_name', 'Nama Pasien wajib diisi')
    .length('patient_name', 2, 100, 'Nama Pasien harus 2-100 karakter')
    .required('birth_date', 'Tanggal Lahir wajib diisi')
    .date('birth_date', { allowFuture: false, message: 'Tanggal lahir tidak valid' })
    .required('gender', 'Jenis Kelamin wajib dipilih')
    .pattern('gender', /^(male|female)$/, 'Jenis kelamin harus male atau female')
    .phone('phone', 'Nomor telepon tidak valid')
    .email('email', 'Email tidak valid'),

  /**
   * Order form validation
   */
  orderForm: new ValidationSchema()
    .required('patient_id', 'Pasien wajib dipilih')
    .required('practitioner_id', 'Dokter wajib dipilih')
    .required('procedure_code', 'Prosedur wajib dipilih')
    .required('scheduled_date', 'Tanggal jadwal wajib diisi')
    .date('scheduled_date', { allowPast: false, message: 'Tanggal jadwal tidak boleh masa lalu' })
    .required('scheduled_time', 'Waktu jadwal wajib diisi')
    .pattern('scheduled_time', /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format waktu tidak valid (HH:MM)')
    .length('notes', 0, 500, 'Catatan maksimal 500 karakter'),

  /**
   * Login form validation
   */
  loginForm: new ValidationSchema()
    .required('username', 'Username wajib diisi')
    .length('username', 3, 50, 'Username harus 3-50 karakter')
    .required('password', 'Password wajib diisi')
    .length('password', 4, 100, 'Password minimal 4 karakter'),

  /**
   * Service request validation
   */
  serviceRequest: new ValidationSchema()
    .required('patient_id', 'ID Pasien wajib diisi')
    .required('practitioner_id', 'ID Dokter wajib diisi')
    .required('location_id', 'Lokasi wajib dipilih')
    .required('procedure_code', 'Kode prosedur wajib diisi')
    .required('scheduled_date', 'Tanggal jadwal wajib diisi')
    .date('scheduled_date', { allowPast: false })
    .required('scheduled_time', 'Waktu jadwal wajib diisi')
    .pattern('scheduled_time', /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format waktu tidak valid'),
};

/**
 * Business rule validators
 */
export const BusinessRules = {
  /**
   * Validate patient age for specific procedures
   * @param {Object} data - Form data
   * @returns {Object} - Validation result
   */
  validatePatientAge(data) {
    const errors = {};
    let isValid = true;

    if (data.birth_date && data.procedure_code) {
      const birthDate = parseDate(data.birth_date);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();

      // Example business rules
      if (data.procedure_code === 'CT_SCAN' && age < 18) {
        errors.procedure_code = 'CT Scan memerlukan persetujuan khusus untuk pasien di bawah 18 tahun';
        isValid = false;
      }

      if (data.procedure_code === 'MRI' && age < 5) {
        errors.procedure_code = 'MRI tidak direkomendasikan untuk pasien di bawah 5 tahun';
        isValid = false;
      }
    }

    return { isValid, errors };
  },

  /**
   * Validate scheduling conflicts
   * @param {Object} data - Form data
   * @param {Array} existingAppointments - Existing appointments
   * @returns {Object} - Validation result
   */
  validateSchedulingConflicts(data, existingAppointments = []) {
    const errors = {};
    let isValid = true;

    if (data.scheduled_date && data.scheduled_time && data.practitioner_id) {
      const scheduledDateTime = `${data.scheduled_date} ${data.scheduled_time}`;
      
      const conflict = existingAppointments.find(appointment => 
        appointment.practitioner_id === data.practitioner_id &&
        appointment.scheduled_date === data.scheduled_date &&
        appointment.scheduled_time === data.scheduled_time
      );

      if (conflict) {
        errors.scheduled_time = 'Dokter sudah memiliki jadwal pada waktu tersebut';
        isValid = false;
      }
    }

    return { isValid, errors };
  },

  /**
   * Validate working hours
   * @param {Object} data - Form data
   * @returns {Object} - Validation result
   */
  validateWorkingHours(data) {
    const errors = {};
    let isValid = true;

    if (data.scheduled_time) {
      const [hours, minutes] = data.scheduled_time.split(':').map(Number);
      const timeInMinutes = hours * 60 + minutes;

      // Working hours: 08:00 - 17:00
      const startTime = 8 * 60; // 08:00
      const endTime = 17 * 60;  // 17:00

      if (timeInMinutes < startTime || timeInMinutes > endTime) {
        errors.scheduled_time = 'Jadwal harus dalam jam kerja (08:00 - 17:00)';
        isValid = false;
      }
    }

    return { isValid, errors };
  },

  /**
   * Validate weekend scheduling
   * @param {Object} data - Form data
   * @returns {Object} - Validation result
   */
  validateWeekendScheduling(data) {
    const errors = {};
    let isValid = true;

    if (data.scheduled_date) {
      const date = parseDate(data.scheduled_date);
      const dayOfWeek = date.getDay();

      // 0 = Sunday, 6 = Saturday
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        errors.scheduled_date = 'Jadwal tidak dapat dibuat pada hari weekend';
        isValid = false;
      }
    }

    return { isValid, errors };
  },
};

/**
 * Validation utilities
 */
export const ValidationUtils = {
  /**
   * Create validation schema
   * @returns {ValidationSchema} - New validation schema
   */
  createSchema() {
    return new ValidationSchema();
  },

  /**
   * Validate single value
   * @param {any} value - Value to validate
   * @param {Array|BaseValidator} validators - Validators
   * @param {string} fieldName - Field name
   * @returns {Object} - Validation result
   */
  validateValue(value, validators, fieldName = 'Field') {
    if (!Array.isArray(validators)) {
      validators = [validators];
    }

    for (const validator of validators) {
      if (!validator.validate(value)) {
        return {
          isValid: false,
          error: validator.getMessage(fieldName, value),
        };
      }
    }

    return { isValid: true, error: null };
  },

  /**
   * Combine multiple validation results
   * @param {Array} results - Array of validation results
   * @returns {Object} - Combined validation result
   */
  combineResults(results) {
    const combinedErrors = {};
    let isValid = true;

    results.forEach(result => {
      if (!result.isValid) {
        isValid = false;
        Object.assign(combinedErrors, result.errors);
      }
    });

    return {
      isValid,
      errors: combinedErrors,
    };
  },

  /**
   * Create custom validator
   * @param {Function} validatorFunction - Validator function
   * @param {string} message - Error message
   * @returns {CustomValidator} - Custom validator instance
   */
  custom(validatorFunction, message = '') {
    return new CustomValidator(validatorFunction, message);
  },

  /**
   * Create required validator
   * @param {string} message - Error message
   * @returns {RequiredValidator} - Required validator instance
   */
  required(message = '') {
    return new RequiredValidator(message);
  },

  /**
   * Create length validator
   * @param {number} min - Minimum length
   * @param {number} max - Maximum length
   * @param {string} message - Error message
   * @returns {LengthValidator} - Length validator instance
   */
  length(min, max = Infinity, message = '') {
    return new LengthValidator(min, max, message);
  },

  /**
   * Create email validator
   * @param {string} message - Error message
   * @returns {EmailValidator} - Email validator instance
   */
  email(message = '') {
    return new EmailValidator(message);
  },

  /**
   * Create phone validator
   * @param {string} message - Error message
   * @returns {PhoneValidator} - Phone validator instance
   */
  phone(message = '') {
    return new PhoneValidator(message);
  },

  /**
   * Create numeric validator
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {string} message - Error message
   * @returns {NumericValidator} - Numeric validator instance
   */
  numeric(min = -Infinity, max = Infinity, message = '') {
    return new NumericValidator(min, max, message);
  },

  /**
   * Create date validator
   * @param {Object} options - Date validation options
   * @returns {DateValidator} - Date validator instance
   */
  date(options = {}) {
    return new DateValidator(options);
  },

  /**
   * Create pattern validator
   * @param {RegExp|string} pattern - Regex pattern
   * @param {string} message - Error message
   * @returns {PatternValidator} - Pattern validator instance
   */
  pattern(pattern, message = '') {
    return new PatternValidator(pattern, message);
  },
};

// Export main validation interface
export const Validation = {
  Schema: ValidationSchema,
  Schemas: ValidationSchemas,
  Rules: BusinessRules,
  Utils: ValidationUtils,
  
  // Validator classes
  Validators: {
    Required: RequiredValidator,
    Length: LengthValidator,
    Email: EmailValidator,
    Phone: PhoneValidator,
    Numeric: NumericValidator,
    Date: DateValidator,
    Pattern: PatternValidator,
    Custom: CustomValidator,
  },
};

export default Validation;