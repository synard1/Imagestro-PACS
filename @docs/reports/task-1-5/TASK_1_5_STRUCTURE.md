# Task 1.5 - Implementation Structure

## File Structure

```
src/
├── hooks/
│   └── useServiceMode.js ✅ CREATED
│       ├── SERVICE_MODES constant
│       ├── ServiceModeProvider component
│       ├── useServiceMode() hook
│       ├── ServiceModeIndicator component
│       ├── withServiceMode() HOC
│       ├── useService() hook
│       └── Helper functions
│
└── main.jsx ✅ MODIFIED
    └── Integrated ServiceModeProvider & ServiceModeIndicator

tests/
└── unit/
    └── useServiceMode.test.js ✅ CREATED
        └── 50+ test cases
```

---

## Component Hierarchy

```
<ServiceModeProvider>
  ├── Context: ServiceModeContext
  ├── State: mode, backendAvailable
  ├── Functions: setMode, toggleMode, checkBackendAvailability
  │
  └── <ToastProvider>
      └── <BrowserRouter>
          ├── <App />
          └── <ServiceModeIndicator />
              ├── Shows only in mock mode
              ├── Blue: Normal state
              └── Yellow: Fallback state
```

---

## API Reference

### ServiceModeProvider
```javascript
<ServiceModeProvider>
  {children}
</ServiceModeProvider>
```

### useServiceMode Hook
```javascript
const {
  mode,                    // 'mock' | 'real'
  effectiveMode,          // Actual mode (with fallback)
  isMockMode,             // boolean
  isRealMode,             // boolean
  backendAvailable,       // boolean | null
  setMode,                // (mode) => void
  toggleMode,             // () => void
  checkBackendAvailability, // () => Promise<boolean>
  isUsingFallback         // boolean
} = useServiceMode();
```

### useService Hook
```javascript
const service = useService(mockService, realService);
// Returns mockService if in mock mode, realService if in real mode
```

### withServiceMode HOC
```javascript
const WrappedComponent = withServiceMode(MyComponent);
// MyComponent receives serviceMode prop
```

### ServiceModeIndicator Component
```javascript
<ServiceModeIndicator className="custom-class" />
// Shows visual indicator when in mock mode
```

---

## Data Flow

```
User Action (Toggle)
    ↓
toggleMode() called
    ↓
setMode() updates state
    ↓
localStorage.setItem('pacs_service_mode', newMode)
    ↓
Context value updated
    ↓
All components using useServiceMode() re-render
    ↓
ServiceModeIndicator updates visual state
```

---

## Feature Matrix

| Feature | Implementation | Status |
|---------|----------------|--------|
| Toggle Mode | toggleMode() | ✅ |
| Set Mode | setMode(mode) | ✅ |
| localStorage Persist | localStorage.setItem() | ✅ |
| localStorage Restore | localStorage.getItem() | ✅ |
| Context Provider | ServiceModeProvider | ✅ |
| Context Hook | useServiceMode() | ✅ |
| Service Selection | useService() | ✅ |
| HOC | withServiceMode() | ✅ |
| Visual Indicator | ServiceModeIndicator | ✅ |
| Backend Check | checkBackendAvailability() | ✅ |
| Auto-Fallback | effectiveMode logic | ✅ |
| Error Handling | Try-catch blocks | ✅ |
| Validation | Mode validation | ✅ |
| Environment Var | VITE_USE_MOCK_SERVICES | ✅ |

---

## Usage Examples

### Basic Usage
```javascript
import { useServiceMode } from './hooks/useServiceMode';

function MyComponent() {
  const { isMockMode, toggleMode } = useServiceMode();
  
  return (
    <button onClick={toggleMode}>
      {isMockMode ? 'Switch to Real' : 'Switch to Mock'}
    </button>
  );
}
```

### Service Selection
```javascript
import { useService } from './hooks/useServiceMode';
import mockService from './services/mock/mockExternalSystemsService';
import realService from './services/externalSystemsService';

function ExternalSystemsList() {
  const service = useService(mockService, realService);
  
  // Use service - automatically switches based on mode
  const systems = await service.listExternalSystems();
}
```

### Class Component
```javascript
import { withServiceMode } from './hooks/useServiceMode';

class MyComponent extends React.Component {
  render() {
    const { serviceMode } = this.props;
    return <div>Mode: {serviceMode.mode}</div>;
  }
}

export default withServiceMode(MyComponent);
```

---

## Environment Configuration

### Development (Default)
```bash
# .env.local
VITE_USE_MOCK_SERVICES=true
```

### Production
```bash
# .env.production
VITE_USE_MOCK_SERVICES=false
```

---

## Testing Coverage

```
useServiceMode Hook Tests
├── ServiceModeProvider
│   ├── Context provision
│   └── Error handling
├── Toggle Functionality
│   ├── Toggle between modes
│   ├── Set specific mode
│   └── Reject invalid modes
├── localStorage
│   ├── Persist mode
│   ├── Restore mode
│   └── Error handling
├── Backend Availability
│   ├── Health check
│   ├── Fallback logic
│   └── Manual check
├── Components
│   ├── ServiceModeIndicator
│   ├── withServiceMode HOC
│   └── useService hook
└── Integration
    ├── Multiple instances
    └── State sharing
```

---

## Status: ✅ COMPLETE

All components, hooks, and features are implemented and integrated.

**Ready for:** Task 2 - Checkpoint - Mock Infrastructure Ready
