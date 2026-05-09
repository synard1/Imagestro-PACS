// src/services/error-parser.js

/**
 * Parse error response from backend and return user-friendly message
 * Handles various error response formats from different backends
 *
 * @param {Error} error - The error object
 * @param {number} status - HTTP status code (optional)
 * @returns {string} User-friendly error message
 */
export function parseErrorMessage(error, status = null) {
  // Default messages based on HTTP status codes
  const statusMessages = {
    400: 'Bad request. Please check your input.',
    401: 'Invalid credentials. Please try again.',
    403: 'Access forbidden. You don\'t have permission.',
    404: 'Resource not found.',
    408: 'Request timeout. Please try again.',
    409: 'Conflict. The resource already exists.',
    422: 'Validation failed. Please check your input.',
    429: 'Too many requests. Please try again later.',
    500: 'Server error. Please try again later.',
    502: 'Bad gateway. Backend service unavailable.',
    503: 'Service unavailable. Please try again later.',
    504: 'Gateway timeout. Backend service is not responding.'
  }

  // Handle network errors
  if (error.code === 'ENETWORK' || error.message?.includes('Network error')) {
    return 'Network error: Unable to reach the server. Please check your connection.'
  }

  // Handle timeout errors
  if (error.code === 'ETIMEOUT' || error.name === 'AbortError' || error.message?.includes('timeout')) {
    return 'Request timeout. The server is taking too long to respond.'
  }

  // Extract status code from error message if not provided
  if (!status && error.message) {
    const statusMatch = error.message.match(/HTTP (\d{3})/)
    if (statusMatch) {
      status = parseInt(statusMatch[1], 10)
    }
  }

  // Try to parse JSON error response from backend
  if (error.message && error.message.includes('{')) {
    try {
      // Extract JSON part from error message
      const jsonStart = error.message.indexOf('{')
      const jsonPart = error.message.substring(jsonStart)
      const errorData = JSON.parse(jsonPart)

      // Try different common error message fields
      const message =
        errorData.message ||
        errorData.error ||
        errorData.error_description ||
        errorData.detail ||
        errorData.msg ||
        null

      if (message) {
        // Return the backend's message
        return String(message)
      }

      // If no message field, check for errors array
      if (errorData.errors && Array.isArray(errorData.errors)) {
        const messages = errorData.errors
          .map(e => e.message || e.msg || e.error || String(e))
          .filter(Boolean)

        if (messages.length > 0) {
          return messages.join(', ')
        }
      }
    } catch (parseError) {
      // JSON parsing failed, continue to default handling
    }
  }

  // Use status-based message if available
  if (status && statusMessages[status]) {
    return statusMessages[status]
  }

  // Fallback: clean up the raw error message
  let message = error.message || 'An unexpected error occurred'

  // Remove "HTTP XXX: " prefix if present
  message = message.replace(/^HTTP \d{3}:\s*/, '')

  // Remove JSON part if it's still there (cleanup for display)
  if (message.includes('{')) {
    const jsonStart = message.indexOf('{')
    const beforeJson = message.substring(0, jsonStart).trim()
    if (beforeJson) {
      message = beforeJson
    }
  }

  // If message is too technical or empty, use generic message
  if (!message || message.length < 3 || message.includes('undefined')) {
    return 'An error occurred while processing your request.'
  }

  return message
}

/**
 * Create a standardized error object with user-friendly message
 *
 * @param {Error} error - The original error
 * @param {number} status - HTTP status code (optional)
 * @returns {Error} Error with clean message
 */
export function createCleanError(error, status = null) {
  const cleanMessage = parseErrorMessage(error, status)
  const cleanError = new Error(cleanMessage)

  // Preserve original error properties
  cleanError.originalError = error
  cleanError.status = status || error.status
  cleanError.code = error.code

  return cleanError
}

/**
 * Parse and extract error details for logging purposes
 *
 * @param {Error} error - The error object
 * @returns {object} Error details
 */
export function getErrorDetails(error) {
  const details = {
    message: error.message,
    status: error.status || null,
    code: error.code || null,
    stack: error.stack || null
  }

  // Try to extract JSON error data
  if (error.message && error.message.includes('{')) {
    try {
      const jsonStart = error.message.indexOf('{')
      const jsonPart = error.message.substring(jsonStart)
      details.data = JSON.parse(jsonPart)
    } catch (e) {
      // Ignore parse errors
    }
  }

  return details
}
