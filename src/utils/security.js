/**
 * Security Utilities for Input Sanitization
 * Protects against XSS, SQL Injection, and other security vulnerabilities
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize text input to prevent XSS attacks
 * @param {string} value - Raw input value
 * @returns {string} Sanitized value
 */
export const sanitizeText = (value) => {
  if (!value) return '';
  if (typeof value !== 'string') return String(value);
  
  // Use DOMPurify to remove any malicious HTML/scripts
  const sanitized = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [], // No HTML tags allowed in text fields
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true // Keep text content, remove tags
  });
  
  return sanitized.trim();
};

/**
 * Sanitize and validate MRN (Medical Record Number)
 * @param {string} value - Raw MRN value
 * @returns {string} Sanitized and validated MRN
 */
export const sanitizeMRN = (value) => {
  if (!value) return '';
  
  // Remove any non-alphanumeric characters except hyphens
  const cleaned = String(value).replace(/[^a-zA-Z0-9-]/g, '');
  
  // Convert to uppercase for consistency
  return cleaned.toUpperCase();
};

/**
 * Sanitize numeric input
 * @param {string} value - Raw numeric value
 * @returns {string} Sanitized numeric value
 */
export const sanitizeNumeric = (value) => {
  if (!value) return '';
  
  // Keep only digits
  return String(value).replace(/[^0-9]/g, '');
};

/**
 * Sanitize alphanumeric input
 * @param {string} value - Raw alphanumeric value
 * @returns {string} Sanitized alphanumeric value
 */
export const sanitizeAlphanumeric = (value) => {
  if (!value) return '';
  
  // Keep only letters, numbers, and spaces
  return String(value).replace(/[^a-zA-Z0-9\s]/g, '');
};

/**
 * Sanitize email input
 * @param {string} value - Raw email value
 * @returns {string} Sanitized email value
 */
export const sanitizeEmail = (value) => {
  if (!value) return '';
  
  // Basic email sanitization - remove dangerous characters
  const cleaned = String(value).replace(/[<>'"]/g, '');
  
  return cleaned.trim().toLowerCase();
};

/**
 * Sanitize phone number
 * @param {string} value - Raw phone number
 * @returns {string} Sanitized phone number
 */
export const sanitizePhone = (value) => {
  if (!value) return '';
  
  // Keep only digits, plus, hyphens, and parentheses
  return String(value).replace(/[^0-9+\-()]/g, '');
};

/**
 * Sanitize reason/notes text with strict validation
 * Only allows alphanumeric and safe punctuation
 * Safe punctuation: . , - : ; ! ? ( ) ' " space newline
 * @param {string} value - Raw reason text
 * @returns {string} Sanitized reason text
 */
export const sanitizeReason = (value) => {
  if (!value) return '';
  if (typeof value !== 'string') return String(value);
  
  // First pass: Remove any HTML/scripts using DOMPurify
  let sanitized = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  });
  
  // Second pass: Only allow safe characters
  // Allowed: a-z A-Z 0-9 space newline and safe punctuation: . , - : ; ! ? ( ) ' "
  sanitized = sanitized.replace(/[^a-zA-Z0-9\s\n.,\-:;!?()'"\u00C0-\u017F]/g, '');
  
  // Remove multiple consecutive spaces/newlines
  sanitized = sanitized.replace(/\s+/g, ' ');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
};

/**
 * Sanitize general input based on type
 * @param {any} value - Raw input value
 * @param {string} type - Input type (text, mrn, numeric, alphanumeric, email, phone, reason)
 * @returns {string} Sanitized value
 */
export const sanitizeInput = (value, type = 'text') => {
  if (value === null || value === undefined) return '';
  
  switch (type) {
    case 'mrn':
      return sanitizeMRN(value);
    case 'numeric':
      return sanitizeNumeric(value);
    case 'alphanumeric':
      return sanitizeAlphanumeric(value);
    case 'email':
      return sanitizeEmail(value);
    case 'phone':
      return sanitizePhone(value);
    case 'reason':
      return sanitizeReason(value);
    case 'text':
    default:
      return sanitizeText(value);
  }
};

/**
 * Sanitize object data (for localStorage, API payloads, etc.)
 * @param {Object} data - Raw object data
 * @param {Object} fieldTypes - Map of field names to their types
 * @returns {Object} Sanitized object
 */
export const sanitizeObject = (data, fieldTypes = {}) => {
  if (!data || typeof data !== 'object') return data;
  
  const sanitized = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Skip null/undefined
    if (value === null || value === undefined) {
      sanitized[key] = value;
      continue;
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'object' ? sanitizeObject(item, fieldTypes) : sanitizeText(item)
      );
      continue;
    }
    
    // Handle nested objects
    if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, fieldTypes);
      continue;
    }
    
    // Sanitize based on field type
    const fieldType = fieldTypes[key] || 'text';
    sanitized[key] = sanitizeInput(value, fieldType);
  }
  
  return sanitized;
};

/**
 * Redact sensitive information for logging
 * @param {Object} data - Data to redact
 * @param {Array<string>} sensitiveFields - List of sensitive field names
 * @returns {Object} Redacted data
 */
export const redactSensitiveData = (data, sensitiveFields = [
  'patient_name',
  'patient_id',
  'mrn',
  'medical_record_number',
  'patient_national_id',
  'satusehat_ihs_number',
  'phone',
  'email',
  'address',
  'birth_date',
  'gender'
]) => {
  if (!data || typeof data !== 'object') return data;
  
  const redacted = { ...data };
  
  for (const field of sensitiveFields) {
    if (field in redacted && redacted[field]) {
      redacted[field] = '***REDACTED***';
    }
  }
  
  return redacted;
};

/**
 * Secure logging function that redacts PHI/PII
 * @param {string} message - Log message
 * @param {any} data - Data to log
 * @param {string} level - Log level (log, warn, error)
 */
export const secureLog = (message, data = null, level = 'log') => {
  // Only log in development mode
  const isDevelopment = import.meta.env.MODE === 'development';
  
  if (!isDevelopment) return;
  
  // Redact sensitive data
  const safeData = data && typeof data === 'object' 
    ? redactSensitiveData(data)
    : data;
  
  // Log based on level
  switch (level) {
    case 'warn':
      console.warn(message, safeData);
      break;
    case 'error':
      console.error(message, safeData);
      break;
    default:
      console.log(message, safeData);
  }
};

/**
 * Field type definitions for order data
 */
export const ORDER_FIELD_TYPES = {
  patient_name: 'text',
  patient_id: 'mrn',
  mrn: 'mrn',
  medical_record_number: 'mrn',
  registration_number: 'alphanumeric',
  procedure_code: 'alphanumeric',
  procedure_name: 'text',
  reason: 'text',
  referring_name: 'text',
  nurse_name: 'text',
  phone: 'phone',
  email: 'email',
  address: 'text',
  tags: 'text',
  icd10: 'alphanumeric',
  icd10_label: 'text'
};
