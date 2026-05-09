# Error Handling Documentation

## Overview

The application now has a robust error handling system that provides user-friendly error messages instead of raw HTTP error responses.

## Architecture

### Error Parser (`src/services/error-parser.js`)

The error parser is responsible for:
1. Parsing backend error responses (JSON format)
2. Extracting user-friendly messages
3. Providing fallback messages based on HTTP status codes
4. Handling network and timeout errors

### Error Flow

```
Backend Response
    ↓
HTTP Client (http.js)
    ↓
Error Parser (error-parser.js)
    ↓
Clean Error Object
    ↓
Service Layer (authService.js)
    ↓
UI Component (Login.jsx)
    ↓
User sees friendly message
```

## Supported Error Formats

The error parser supports multiple backend error response formats:

### Format 1: Simple message field
```json
{
  "message": "Invalid credentials",
  "status": "error"
}
```
**Displayed:** "Invalid credentials"

### Format 2: Error field
```json
{
  "error": "User not found"
}
```
**Displayed:** "User not found"

### Format 3: Error description
```json
{
  "error_description": "The access token expired"
}
```
**Displayed:** "The access token expired"

### Format 4: Detail field
```json
{
  "detail": "Authentication failed"
}
```
**Displayed:** "Authentication failed"

### Format 5: Errors array
```json
{
  "errors": [
    {"message": "Username is required"},
    {"message": "Password is required"}
  ]
}
```
**Displayed:** "Username is required, Password is required"

## Default Messages by HTTP Status Code

When backend doesn't provide a clear message, the system uses these defaults:

| Status Code | Message |
|-------------|---------|
| 400 | Bad request. Please check your input. |
| 401 | Invalid credentials. Please try again. |
| 403 | Access forbidden. You don't have permission. |
| 404 | Resource not found. |
| 408 | Request timeout. Please try again. |
| 409 | Conflict. The resource already exists. |
| 422 | Validation failed. Please check your input. |
| 429 | Too many requests. Please try again later. |
| 500 | Server error. Please try again later. |
| 502 | Bad gateway. Backend service unavailable. |
| 503 | Service unavailable. Please try again later. |
| 504 | Gateway timeout. Backend service is not responding. |

## Network and Timeout Errors

### Network Error
**Raw:** `Failed to fetch` or `Network error: backend unreachable`
**Displayed:** "Network error: Unable to reach the server. Please check your connection."

### Timeout Error
**Raw:** `Request timeout` or `AbortError`
**Displayed:** "Request timeout. The server is taking too long to respond."

## Implementation Examples

### HTTP Client (http.js)
```javascript
import { createCleanError } from './error-parser'

// When error occurs
if (!response.ok) {
  const errorText = await response.text();
  const rawErr = new Error(`HTTP ${response.status}: ${errorText}`);
  rawErr.status = response.status;

  // Create clean error for user display
  throw createCleanError(rawErr, response.status);
}
```

### Service Layer (authService.js)
```javascript
try {
  const response = await client.post(loginPath, { username, password });
  return response;
} catch (error) {
  // Error is already cleaned by http.js, just log and re-throw
  console.error('Backend login failed:', error.originalError || error);
  throw error; // User sees clean message
}
```

### UI Component (Login.jsx)
```javascript
try {
  const response = await loginBackend(username, password);
  // Success
} catch (err) {
  // err.message contains user-friendly message
  setError(err.message || 'Login failed');
}
```

## Error Object Structure

Clean errors have the following structure:

```javascript
{
  message: "Invalid credentials. Please try again.", // User-friendly message
  originalError: Error,                              // Original error object
  status: 401,                                        // HTTP status code
  code: "ENETWORK"                                    // Error code (optional)
}
```

## Testing Error Messages

### Test Invalid Credentials (401)
**Backend Response:**
```json
HTTP 401: {"message":"Invalid credentials","status":"error"}
```
**User Sees:** "Invalid credentials"

### Test Network Error
**Backend:** Unreachable
**User Sees:** "Network error: Unable to reach the server. Please check your connection."

### Test Timeout
**Backend:** Takes > 6 seconds
**User Sees:** "Request timeout. The server is taking too long to respond."

## Adding Custom Error Messages

To add support for new error formats, update `error-parser.js`:

```javascript
export function parseErrorMessage(error, status = null) {
  // ... existing code ...

  // Add your custom format
  const message =
    errorData.message ||
    errorData.error ||
    errorData.your_custom_field ||  // Add this
    errorData.detail ||
    null;

  // ... rest of code ...
}
```

## Best Practices

1. **Always use createCleanError** in HTTP clients
2. **Don't wrap errors twice** - check for `error.originalError`
3. **Log original errors** for debugging: `error.originalError || error`
4. **Provide context** in console.error messages
5. **Test all error paths** with various backend responses

## Debugging

To see original error details in console:

```javascript
console.error('Debug error:', {
  message: error.message,
  original: error.originalError?.message,
  status: error.status,
  stack: error.originalError?.stack
});
```

## Migration from Old Error Handling

**Before:**
```javascript
// User sees: "HTTP 401: {"message":"Invalid credentials","status":"error"}"
throw new Error(`HTTP ${response.status}: ${errorText}`);
```

**After:**
```javascript
// User sees: "Invalid credentials"
throw createCleanError(rawErr, response.status);
```

## Future Enhancements

- [ ] Add error codes for programmatic error handling
- [ ] Add i18n support for multilingual error messages
- [ ] Add error tracking/reporting integration
- [ ] Add retry logic for transient errors
