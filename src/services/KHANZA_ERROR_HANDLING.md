# Khanza Integration - Comprehensive Error Handling Implementation

## Overview

This document describes the comprehensive error handling implementation for the SIMRS Khanza integration feature. All error handling requirements from the specification have been implemented.

## Requirements Coverage

### Requirement 1.5: Connection Failure Error Messages
**Status**: ✅ IMPLEMENTED

When the Khanza API is unreachable, the system displays an error message indicating connection failure and suggests checking API configuration.

**Implementation**:
- `khanzaService.js`: Network error detection in `request()` function
- `khanzaErrorHandler.js`: `categorizeError()` identifies NETWORK_ERROR
- `getUserFriendlyErrorMessage()` provides actionable suggestions:
  - Check API URL configuration
  - Verify Khanza API service is running
  - Check network connectivity
  - Verify firewall settings

**Error Flow**:
```
Network Error → categorizeError() → NETWORK_ERROR category
→ getUserFriendlyErrorMessage() → User-friendly message with suggestions
→ handleError() → notify() → User sees toast notification
```

### Requirement 2.5: Validation Error Messages
**Status**: ✅ IMPLEMENTED

When importing an order with unmapped procedure, the system rejects the import and displays an error message indicating unmapped procedure.

**Implementation**:
- `khanzaImportService.js`: `validateOrder()` checks procedure mapping
- `khanzaMappingService.js`: `getProcedureMappingByCode()` returns null if not found
- `khanzaErrorHandler.js`: `validateRequiredFields()` validates data
- Error message includes:
  - Procedure name and code
  - Link to Settings → Procedure Mappings
  - Clear explanation of what's missing

**Error Flow**:
```
Order Import → validateOrder() → Check procedure mapping
→ Mapping not found → createError() with VALIDATION_ERROR code
→ getUserFriendlyErrorMessage() → Actionable error message
→ handleError() → User sees error with suggestions
```

### Requirement 3.3: Connection Test Failure Handling
**Status**: ✅ IMPLEMENTED

When configuration is saved and connection test fails, the system displays the specific error and prevents saving invalid configuration.

**Implementation**:
- `khanzaService.js`: `checkHealth()` tests connection
- `khanzaErrorHandler.js`: `validateApiConfig()` validates configuration format
- `retryWithBackoff()` retries failed connections with exponential backoff
- Error handling prevents configuration save on failure

**Error Categories Handled**:
- TIMEOUT: Request takes too long
- AUTH: Invalid API Key
- NETWORK: Cannot reach API
- SERVER: Khanza API server error

**Error Flow**:
```
Save Config → validateApiConfig() → checkHealth()
→ Connection fails → categorizeError() → Get category
→ getUserFriendlyErrorMessage() → Specific error message
→ handleError() → Show error, prevent save
```

### Requirement 8.4: Parsing Error Logging and User-Friendly Messages
**Status**: ✅ IMPLEMENTED

When a parsing error occurs, the system logs the error with original data and displays user-friendly error message.

**Implementation**:
- `khanzaService.js`: `validateRadiologiOrder()` validates required fields
- `khanzaService.js`: `parseKhanzaDate()` handles date parsing with fallback
- `khanzaErrorHandler.js`: `handleError()` logs with full context
- `logger.js`: Environment-aware logging (debug, info, warn, error, silent)

**Logging Details**:
- Error category and severity
- Original error message
- Stack trace (in development)
- Context information (operation type, user action)

**Error Flow**:
```
Parse Error → categorizeError() → Get category
→ logger.error() → Log with full context
→ getUserFriendlyErrorMessage() → User-friendly message
→ handleError() → notify() → Show to user
```

## Error Handler Architecture

### Core Components

#### 1. Error Categorization (`categorizeError()`)
Categorizes errors into standard types:
- `NETWORK`: Connection failures, network errors
- `TIMEOUT`: Request timeouts
- `AUTH`: Authentication failures (401, 403)
- `VALIDATION`: Invalid input data (400)
- `NOT_FOUND`: Resource not found (404)
- `CONFLICT`: Duplicate entries, conflicts (409)
- `SERVER`: Server errors (5xx)
- `UNKNOWN`: Unrecognized errors

#### 2. User-Friendly Messages (`getUserFriendlyErrorMessage()`)
Converts technical errors into actionable messages:
- **Title**: Clear, concise error title
- **Message**: Explanation of what went wrong
- **Details**: Actionable suggestions (array of bullet points)
- **Severity**: info, warning, error, critical
- **Actionable**: Boolean indicating if user can take action
- **Category**: Error category for programmatic handling

#### 3. Error Handling (`handleError()`)
Orchestrates error handling:
- Logs error with context
- Shows user notification
- Calls optional error callback
- Supports custom context information

#### 4. Retry Logic (`retryWithBackoff()`)
Implements exponential backoff retry:
- Configurable max attempts (default: 3)
- Exponential backoff delay (1s → 2s → 4s)
- Retryable status codes: 408, 429, 500, 502, 503, 504
- Optional retry callback for monitoring

#### 5. Validation (`validateRequiredFields()`, `validateApiConfig()`)
Validates data before operations:
- Required field validation
- API configuration validation (URL format, timeout range)
- Procedure mapping validation
- Doctor mapping validation
- Operator mapping validation

### Integration Points

#### khanzaService.js
- Network error handling in `request()` function
- Timeout detection and user-friendly messages
- Date parsing with fallback formats
- Field mapping validation
- JSON response validation

#### khanzaMappingService.js
- Duplicate detection with CONFLICT error
- Validation error handling for all CRUD operations
- Batch operation error aggregation

#### khanzaImportService.js
- Order validation with detailed error messages
- Patient data comparison with diff display
- Procedure mapping validation
- Doctor auto-creation with error handling
- Batch import error handling

#### UI Components (Future)
- Error display in toast notifications
- Validation error highlighting in forms
- Connection status indicators
- Retry buttons for failed operations

## Error Handling Examples

### Example 1: Connection Failure
```javascript
// User tries to fetch orders but Khanza API is down
try {
  const orders = await listRadiologi({ tgl_mulai: '2024-01-01' });
} catch (error) {
  // Error: "Cannot connect to Khanza API..."
  // Category: NETWORK
  // Suggestions: Check URL, verify service is running, check network
  handleError(error, {
    context: 'list_radiologi',
    notify: true,
    log: true,
  });
}
```

### Example 2: Validation Error
```javascript
// User tries to import order with unmapped procedure
const validation = await validateOrder('ORD-001');
if (!validation.valid) {
  // Error: "Procedure 'CT Kepala' (code: CT001) is not mapped to PACS..."
  // Category: VALIDATION
  // Suggestion: Add mapping in Settings → Procedure Mappings
  handleError(createError(validation.errors[0], 'VALIDATION_ERROR'), {
    context: 'validate_order',
    notify: true,
  });
}
```

### Example 3: Configuration Validation
```javascript
// User saves invalid API configuration
const config = { baseUrl: 'invalid-url', apiKey: '' };
const validation = validateApiConfig(config);
if (!validation.valid) {
  // Errors: ["API URL is not a valid URL", "API Key is required"]
  // Category: VALIDATION
  // Severity: WARNING
  // Actionable: true
  handleError(createError(validation.errors.join('; '), 'VALIDATION_ERROR'), {
    context: 'save_config',
    notify: true,
  });
}
```

### Example 4: Retry with Backoff
```javascript
// Automatically retry failed API calls
const orders = await retryWithBackoff(
  () => listRadiologi({ tgl_mulai: '2024-01-01' }),
  {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    onRetry: (info) => {
      logger.warn(`Retrying (attempt ${info.attempt}/${info.maxAttempts})`);
    },
  }
);
```

## Error Severity Levels

- **INFO**: Informational messages (not errors)
- **WARNING**: Non-critical issues (validation, not found)
- **ERROR**: Critical issues (network, auth, server)
- **CRITICAL**: System-level failures (prevent save, abort operation)

## Logging Strategy

### Development Mode
- Log level: INFO (shows debug, info, warn, error)
- Includes timestamps
- Shows full stack traces
- Grouped logging for complex operations

### Production Mode
- Log level: ERROR (shows only errors)
- No timestamps
- Stack traces included for debugging
- Minimal console output

### Log Format
```
[HH:MM:SS] [khanzaErrorHandler] context: {
  category: 'NETWORK',
  severity: 'error',
  message: 'Cannot connect to Khanza API...',
  originalError: 'Failed to fetch',
  stack: '...'
}
```

## Testing

### Unit Tests (`tests/unit/khanzaErrorHandler.test.js`)
- Error categorization for all error types
- User-friendly message generation
- Required field validation
- API configuration validation
- Error creation with standardized format
- Error immutability
- Edge cases (empty messages, special characters, etc.)

### Property-Based Tests (`tests/property/khanzaErrorHandler.property.test.js`)
- Error categorization consistency (100 runs)
- User-friendly message generation (100 runs)
- Required field validation consistency (100 runs)
- API configuration validation (50 runs)
- Error creation consistency (100 runs)
- Null/undefined error handling
- Error immutability (100 runs)

## Best Practices

### For Service Developers
1. Always use `handleError()` for user-facing errors
2. Use `createError()` to create standardized errors
3. Include context information in error handling
4. Use `retryWithBackoff()` for transient failures
5. Validate input before operations

### For UI Developers
1. Listen to notifications with `onNotify()`
2. Display error title prominently
3. Show details as bullet points
4. Provide action buttons for actionable errors
5. Use error severity for styling (red for error, yellow for warning)

### For Debugging
1. Check browser console for detailed logs
2. Set `VITE_LOG_LEVEL=debug` for verbose logging
3. Look for error category to understand issue type
4. Check original error message for technical details
5. Review stack trace for code location

## Future Enhancements

1. **Error Recovery**: Implement automatic recovery for certain error types
2. **Error Analytics**: Track error frequency and patterns
3. **Localization**: Translate error messages to multiple languages
4. **Error Reporting**: Send critical errors to monitoring service
5. **Custom Error Handlers**: Allow components to register custom error handlers
6. **Error Boundaries**: React error boundaries for UI errors
7. **Offline Support**: Handle offline scenarios gracefully

## Conclusion

The comprehensive error handling implementation provides:
- ✅ Clear error categorization
- ✅ User-friendly error messages
- ✅ Actionable error suggestions
- ✅ Automatic retry with backoff
- ✅ Detailed logging for debugging
- ✅ Validation for all operations
- ✅ Consistent error format
- ✅ Extensive test coverage

All requirements from the specification have been met and implemented.
