# Implementation Summary: useServiceMode Hook (Task 1.5)

## Task Completion Status: ✅ COMPLETED

### Task Requirements
- [x] Create `src/hooks/useServiceMode.js`
- [x] Implement toggle between mock and real services
- [x] Store preference in localStorage
- [x] Provide context for all components
- [x] Add visual indicator when using mock mode
- [x] Requirements: 11.4

## Implementation Details

### 1. Hook Implementation (`src/hooks/useServiceMode.js`)

The hook provides a complete service mode management system with the following features:

#### Core Exports:
- **`ServiceModeProvider`** - React context provider component
- **`useServiceMode()`** - Hook to access service mode context
- **`ServiceModeIndicator`** - Visual indicator component
- **`withServiceMode()`** - Higher-order component for class components
- **`useService()`** - Hook to get appropriate service based on mode
- **`SERVICE_MODES`** - Constants for mode values

#### Key Features:

1. **Service Mode Toggle**
   - Toggle between `MOCK` and `REAL` modes
   - `toggleMode()` - Switch between modes
   - `setMode(mode)` - Set specific mode
   - Validates mode values before setting

2. **localStorage Persistence**
   - Stores preference in `pacs_service_mode` key
   - Restores on app reload
   - Graceful error handling for storage failures
   - Validates stored values

3. **Backend Availability Checking**
   - Automatic health check via `/api/health` endpoint
   - 5-second timeout for health checks
   - Manual check via `checkBackendAvailability()`
   - Tracks availability status

4. **Auto-Fallback to Mock Mode**
   - When real mode is selected but backend is unavailable
   - Automatically falls back to mock mode
   - Provides `isUsingFallback` flag to indicate fallback state
   - Useful for development and offline scenarios

5. **Environment Variable Support**
   - `VITE_USE_MOCK_SERVICES=true` - Force mock mode
   - Checked on initialization
   - Overrides localStorage preference

6. **Visual Indicator Component**
   - Shows when in mock mode
   - Displays different styling when using fallback (yellow vs blue)
   - Clickable to toggle mode
   - Fixed position in bottom-right corner
   - Animated pulse indicator

7. **Convenience Flags**
   - `isMockMode` - Boolean flag for mock mode
   - `isRealMode` - Boolean flag for real mode
   - `isUsingFallback` - Boolean flag for fallback state
   - `backendAvailable` - Backend availability status

### 2. Integration into App (`src/main.jsx`)

Updated main.jsx to wrap the entire application with `ServiceModeProvider`:

```jsx
<ServiceModeProvider>
  <ToastProvider>
    <BrowserRouter>
      <App />
      <ServiceModeIndicator />
    </BrowserRouter>
  </ToastProvider>
</ServiceModeProvider>
```

This ensures:
- All components have access to service mode context
- Visual indicator is displayed globally
- Service mode persists across page reloads

### 3. Test Suite (`tests/unit/useServiceMode.test.js`)

Comprehensive test suite covering:

#### Test Categories:
1. **ServiceModeProvider Tests**
   - Context provision to children
   - Error handling when used without provider

2. **Service Mode Toggle Tests**
   - Toggle between modes
   - Set specific mode
   - Reject invalid modes
   - Multiple toggles

3. **localStorage Persistence Tests**
   - Persist mode to storage
   - Restore from storage
   - Handle storage errors gracefully
   - Ignore invalid stored values

4. **Backend Availability Tests**
   - Check availability on mode switch
   - Set availability flags correctly
   - Handle network errors
   - Manual availability check

5. **Effective Mode (Auto-Fallback) Tests**
   - Use real mode when backend available
   - Fallback to mock when unavailable
   - Indicate fallback state
   - Prevent fallback when backend available

6. **Convenience Flags Tests**
   - isMockMode flag
   - isRealMode flag
   - Correct flag values

7. **ServiceModeIndicator Component Tests**
   - Render in mock mode
   - Hide in real mode
   - Toggle on click
   - Show fallback styling

8. **withServiceMode HOC Tests**
   - Inject serviceMode prop
   - Wrap components correctly

9. **useService Hook Tests**
   - Return mock service in mock mode
   - Return real service in real mode
   - Switch service on mode change

10. **Environment Variable Tests**
    - Respect VITE_USE_MOCK_SERVICES

11. **Multiple Instances Tests**
    - Share state across instances

#### Test Statistics:
- Total test cases: 50+
- Coverage areas: All major functionality
- Framework: Vitest with React Testing Library

## Usage Examples

### Basic Usage in Components

```jsx
import { useServiceMode } from './hooks/useServiceMode';

function MyComponent() {
  const { isMockMode, toggleMode, mode } = useServiceMode();

  return (
    <div>
      <p>Current mode: {mode}</p>
      <button onClick={toggleMode}>
        Switch to {isMockMode ? 'Real' : 'Mock'} Mode
      </button>
    </div>
  );
}
```

### Using Service Selection Hook

```jsx
import { useService } from './hooks/useServiceMode';
import mockExternalSystemsService from './services/mock/mockExternalSystemsService';
import realExternalSystemsService from './services/externalSystemsService';

function ExternalSystemsList() {
  const service = useService(
    mockExternalSystemsService,
    realExternalSystemsService
  );

  // Use service - automatically switches based on mode
  const systems = await service.listExternalSystems();
}
```

### Using HOC for Class Components

```jsx
import { withServiceMode } from './hooks/useServiceMode';

class MyComponent extends React.Component {
  render() {
    const { serviceMode } = this.props;
    return <div>Mode: {serviceMode.mode}</div>;
  }
}

export default withServiceMode(MyComponent);
```

## Requirements Mapping

### Requirement 11.4: Provider-Specific Adapters
- ✅ Service mode toggle implemented
- ✅ Environment variable support (`VITE_USE_MOCK_SERVICES`)
- ✅ Graceful fallback to mock when backend unavailable
- ✅ Visual indicator for mock mode
- ✅ localStorage persistence for user preference

## Files Modified/Created

1. **Created**: `src/hooks/useServiceMode.js` (Complete implementation)
2. **Modified**: `src/main.jsx` (Added ServiceModeProvider and ServiceModeIndicator)
3. **Created**: `tests/unit/useServiceMode.test.js` (Comprehensive test suite)

## Environment Configuration

To use mock mode by default in development:

```bash
# .env or .env.local
VITE_USE_MOCK_SERVICES=true
```

To force real mode:

```bash
VITE_USE_MOCK_SERVICES=false
```

## Benefits

1. **Development Flexibility**: Develop UI independently of backend
2. **Testing**: Easy to test with consistent mock data
3. **Offline Support**: Graceful fallback when backend unavailable
4. **User Preference**: Remembers user's mode choice
5. **Visual Feedback**: Clear indication when using mock mode
6. **Type Safety**: Proper error handling and validation
7. **Performance**: Minimal overhead, efficient context usage

## Next Steps

The service mode toggle hook is now ready to be used by:
1. Mock External Systems Service (Phase 1)
2. Mock Mapping Service (Phase 1)
3. Mock Import Service (Phase 1)
4. All UI components in Phase 2

Components can use `useService()` hook to automatically switch between mock and real implementations based on the current mode.
