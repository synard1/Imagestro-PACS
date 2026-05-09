# SIMRS Order UI - JavaScript Modules

## Quick Start Guide

This directory contains the refactored JavaScript modules for the SIMRS Order UI application.

## Directory Structure

```
js/
├── config/
│   └── constants.js          # Application configuration and constants
├── utils/
│   ├── dom.js               # DOM manipulation utilities
│   ├── date.js              # Date formatting and utilities
│   └── storage.js           # Local storage management
├── services/
│   └── api.js               # API service layer
└── modules/
    ├── auth.js              # Authentication management
    ├── ui.js                # UI component managers
    ├── validation.js        # Validation schemas and business rules
    └── state.js             # Centralized state management
```

## Key Modules

### 🔧 Configuration (`config/constants.js`)
Centralized application settings, API endpoints, and constants.

### 🛠️ Utilities
- **`dom.js`**: DOM manipulation, element selection, event handling
- **`date.js`**: Date formatting, parsing, and calculations
- **`storage.js`**: Local storage, caching, and data persistence

### 🌐 Services (`services/api.js`)
API communication layer with retry logic and error handling.

### 📦 Core Modules
- **`auth.js`**: User authentication and session management
- **`ui.js`**: UI component managers (forms, tables, modals, autocomplete)
- **`validation.js`**: Data validation and business rules
- **`state.js`**: Centralized application state management

## Usage Examples

### Importing Modules
```javascript
// Import specific utilities
import { qs, showToast } from './utils/dom.js';
import { formatDateLocal } from './utils/date.js';

// Import services
import { AuthApi, OrdersApi } from './services/api.js';

// Import modules
import { AuthManager } from './modules/auth.js';
import { UI } from './modules/ui.js';
```

### Using DOM Utilities
```javascript
import { qs, setValue, showToast } from './utils/dom.js';

// Select elements
const loginForm = qs('#loginForm');
const usernameInput = qs('#username');

// Set values
setValue('#username', 'john.doe');

// Show notifications
showToast('Login successful!', 'success');
```

### Using API Services
```javascript
import { AuthApi, OrdersApi } from './services/api.js';

// Authentication
const loginResult = await AuthApi.login(username, password);

// Create order
const order = await OrdersApi.createOrder(orderData);
```

### Using State Management
```javascript
import { AppState } from './modules/state.js';

// Subscribe to state changes
AppState.subscribe('auth', (authState) => {
    console.log('Auth state changed:', authState);
});

// Update state
AppState.setAuth({ isAuthenticated: true, user: userData });
```

### Using Validation
```javascript
import { ValidationSchemas, ValidationUtils } from './modules/validation.js';

// Validate form data
const result = ValidationUtils.validateSchema(
    formData, 
    ValidationSchemas.patientRegistration
);

if (!result.isValid) {
    console.log('Validation errors:', result.errors);
}
```

## Development Guidelines

### 1. Adding New Features
- Identify the appropriate module
- Follow existing patterns and conventions
- Add proper error handling
- Include validation where needed
- Update documentation

### 2. Code Standards
- Use ES6+ syntax
- Add JSDoc comments for public methods
- Follow consistent naming conventions
- Keep modules focused and cohesive
- Always include error handling

### 3. Testing
- Test individual modules
- Test module interactions
- Test complete user workflows
- Monitor performance

## Debugging

### Available Debug Objects
In development mode, these objects are available in the browser console:
- `window.SimrsApp`: Main application instance
- `window.State`: Application state manager
- `window.UI`: UI component managers

### Common Debug Commands
```javascript
// Check current state
console.log(window.State.getState());

// Check authentication status
console.log(window.State.getAuth());

// Trigger state change
window.State.setAuth({ isAuthenticated: false });
```

## Migration from Legacy Code

### Before (Legacy)
```javascript
// Global functions scattered throughout app.js
function login(username, password) { /* ... */ }
function showToast(message) { /* ... */ }
var state = { /* global state */ };
```

### After (Modular)
```javascript
// Organized in appropriate modules
import { AuthManager } from './modules/auth.js';
import { showToast } from './utils/dom.js';
import { AppState } from './modules/state.js';

const auth = new AuthManager();
await auth.login(username, password);
```

## Performance Tips

1. **Lazy Loading**: Modules are loaded on demand
2. **Caching**: Use storage utilities for data caching
3. **Event Delegation**: Use UI managers for efficient event handling
4. **State Subscriptions**: Subscribe only to needed state changes

## Common Issues

### Module Import Errors
- Check file paths in import statements
- Ensure all dependencies are properly imported
- Verify module exports

### State Not Updating
- Check if state subscriptions are properly set up
- Verify state update methods are called correctly
- Use browser dev tools to monitor state changes

### Validation Errors
- Check validation schema definitions
- Verify input data format
- Review business rule implementations

## Support

For detailed documentation, see `../REFACTORING_DOCUMENTATION.md`

For questions or issues, contact the development team.

---

**Last Updated**: 2024-12-19