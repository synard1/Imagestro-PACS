# External Systems Consolidation

This directory contains the unified External Systems management page that consolidates three previously separate locations:
- Settings.jsx → Integration tab → SIMRS Integration
- ExternalSystemsDocs.jsx → `/external-systems-docs`
- KhanzaIntegration/ → `/khanza-integration`

## Directory Structure

```
ExternalSystems/
├── index.jsx                          # Main page component
├── ExternalSystemsList.jsx            # List view with filters
├── ExternalSystemsDetail.jsx          # Detail/edit view
├── ConnectionSettings.jsx             # Connection config section (TODO)
├── types.js                           # TypeScript-like interface definitions
├── KhanzaSpecific/                    # Khanza-specific features (TODO)
│   ├── OrderBrowser.jsx              # Order browser tab
│   ├── ImportHistory.jsx             # Import history tab
│   └── Mappings/
│       ├── ProcedureMappings.jsx     # Procedure mapping CRUD
│       ├── DoctorMappings.jsx        # Doctor mapping CRUD
│       └── OperatorMappings.jsx      # Operator mapping CRUD
└── README.md                          # This file
```

## Services

### externalSystemsService.js
Handles all API operations for external systems:
- `listExternalSystems(params)` - List systems with filtering and pagination
- `getExternalSystem(id)` - Get system details
- `createExternalSystem(data)` - Create new system
- `updateExternalSystem(id, data)` - Update system
- `deleteExternalSystem(id)` - Delete system

### connectionTestService.js
Handles connection testing to external systems:
- `testConnection(systemId, connectionSettings)` - Test connection
- `testConnectionWithRetry(systemId, connectionSettings, maxRetries)` - Test with retry
- `validateConnectionSettings(connectionSettings)` - Validate settings
- Error categorization and user-friendly messages

## Hooks

### useExternalSystems
Custom hook for managing external systems list:
```javascript
const { systems, loading, error, pagination, goToPage, changePageSize, refresh } = useExternalSystems(refreshTrigger, filters);
```

### useConnectionTest
Custom hook for testing connections:
```javascript
const { testing, result, error, test, reset } = useConnectionTest();
```

### useKhanzaIntegration
Custom hook for Khanza-specific features:
```javascript
const { activeTab, switchTab, loading, error, clearError, systemId } = useKhanzaIntegration(systemId);
```

## Type Definitions

See `types.js` for comprehensive type definitions including:
- `ExternalSystem` - Main system object
- `ConnectionSettings` - Connection configuration
- `TestConnectionResult` - Connection test result
- `ProcedureMapping` - Procedure mapping
- `DoctorMapping` - Doctor mapping
- `OperatorMapping` - Operator mapping
- `KhanzaOrder` - Khanza order
- `ImportHistory` - Import history record

## Requirements Coverage

### Task 1: Set up project structure and core interfaces
- ✅ Directory structure created
- ✅ TypeScript-like interfaces defined in types.js
- ✅ API service layer (externalSystemsService.js)
- ✅ Connection test service (connectionTestService.js)
- ✅ Custom hooks (useExternalSystems, useConnectionTest, useKhanzaIntegration)
- ✅ Main page component (index.jsx)
- ✅ List view component (ExternalSystemsList.jsx)
- ✅ Detail view component (ExternalSystemsDetail.jsx)

## Next Steps

1. Implement ExternalSystemsList with full filtering and pagination
2. Implement ExternalSystemsDetail with CRUD operations
3. Implement ConnectionSettings component
4. Implement Khanza-specific tabs and components
5. Integrate with existing navigation
6. Create database migrations
7. Implement API endpoints
8. Add comprehensive testing

## Notes

- All services use the existing `apiClient` from `http.js`
- All components use Tailwind CSS for styling
- Logging is handled through the `logger` utility
- Error handling follows the existing patterns in the codebase
