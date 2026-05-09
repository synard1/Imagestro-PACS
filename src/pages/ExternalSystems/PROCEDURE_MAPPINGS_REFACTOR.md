# Procedure Mappings Refactor - External Systems

## Overview

Refactored the procedure mappings system for external systems to provide a comprehensive, backend-integrated solution similar to the `/mappings` page. The new implementation includes:

- Standalone procedure mappings page at `/external-systems/procedure-mappings`
- Enhanced ProcedureMappingTable component with PACS procedure dropdown
- New ProcedureMappingsTab for use in external systems detail view
- Full backend integration with real service
- Search, filter, and pagination support
- Import/Export functionality

## Architecture

### Components

#### 1. **ProcedureMappingsPage** (`ProcedureMappingsPage.jsx`)
- Standalone page for managing procedure mappings
- System selector dropdown
- Displays selected system information
- Integrates ProcedureMappingsTab

**Features:**
- Load all external systems
- Auto-select first system
- System information display
- Error handling

#### 2. **ProcedureMappingsTab** (`tabs/ProcedureMappingsTab.jsx`)
- Comprehensive procedure mapping management
- Search and filter by modality
- Inline add/edit/delete operations
- PACS procedure dropdown with auto-fill
- Pagination support
- Delete confirmation modal

**Features:**
- List procedure mappings with pagination
- Search by code or name
- Filter by modality
- Create new mappings
- Edit existing mappings
- Delete mappings with confirmation
- Form validation
- Error handling

#### 3. **ProcedureMappingTable** (Enhanced)
- Updated to use real service (unifiedMappingService)
- PACS procedures dropdown
- Auto-fill PACS name and modality when procedure selected
- Inline form editing
- Pagination

**Key Changes:**
- Replaced mock service with real service
- Added PACS procedures loading
- Enhanced form with dropdown selection
- Better error handling

### Services

#### unifiedMappingService
Provides unified API for procedure mappings:

```javascript
// List procedure mappings
listProcedureMappings(externalSystemId, params)

// Get single mapping
getProcedureMapping(externalSystemId, mappingId)

// Get by code
getProcedureMappingByCode(externalSystemId, externalCode)

// Create mapping
createProcedureMapping(externalSystemId, mapping)

// Update mapping
updateProcedureMapping(externalSystemId, mappingId, mapping)

// Delete mapping
deleteProcedureMapping(externalSystemId, mappingId)

// Bulk import
bulkImportProcedureMappings(externalSystemId, mappings)

// Export
exportProcedureMappings(externalSystemId)
```

## Data Model

### Procedure Mapping
```javascript
{
  id: string,
  external_system_id: string,
  external_code: string,
  external_name: string,
  pacs_code: string,
  pacs_name: string,
  modality: string,  // CR, CT, MR, US, etc.
  description: string,
  is_active: boolean,
  created_at: timestamp,
  updated_at: timestamp
}
```

### PACS Procedure
```javascript
{
  id: string,
  code: string,
  name: string,
  modality: string,
  description: string
}
```

## Usage

### Accessing Procedure Mappings

1. **From External Systems List:**
   - Navigate to External Systems
   - Click on a system
   - Go to Mappings tab → Procedures sub-tab

2. **Standalone Page:**
   - Navigate to `/external-systems/procedure-mappings`
   - Select system from dropdown
   - Manage mappings

### Creating a Mapping

1. Click "+ Add Mapping" button
2. Enter external code and name
3. Select PACS procedure from dropdown (auto-fills name and modality)
4. Or manually enter PACS code and name
5. Click "Save"

### Editing a Mapping

1. Click "Edit" button on mapping row
2. Modify fields (external code is read-only)
3. Click "Save"

### Deleting a Mapping

1. Click "Delete" button on mapping row
2. Confirm deletion in modal
3. Mapping is deleted

### Searching and Filtering

- **Search:** Enter code or name in search field
- **Modality Filter:** Select modality from dropdown
- **Pagination:** Use page size selector and navigation buttons

## Backend Integration

### API Endpoints

```
GET    /api/external-systems/{systemId}/mappings/procedures
GET    /api/external-systems/{systemId}/mappings/procedures/{id}
GET    /api/external-systems/{systemId}/mappings/procedures/by-code/{code}
POST   /api/external-systems/{systemId}/mappings/procedures
PUT    /api/external-systems/{systemId}/mappings/procedures/{id}
DELETE /api/external-systems/{systemId}/mappings/procedures/{id}
POST   /api/external-systems/{systemId}/mappings/procedures/bulk
GET    /api/pacs/procedures  (for dropdown)
```

### Query Parameters

```
page=1
page_size=20
search=code_or_name
modality=CR
is_active=true
```

## Form Validation

### Required Fields
- External Code
- External Name
- PACS Code
- PACS Name

### Optional Fields
- Modality (auto-filled from PACS procedure)
- Description

### Validation Rules
- External code must be unique per system
- PACS code must be valid
- Modality must be one of: CR, CT, MR, US, MG, RF, DX, NM, PT, XA

## Error Handling

- Network errors: Display error message with retry option
- Validation errors: Display field-level error messages
- Duplicate errors: Show specific duplicate error
- Delete errors: Show error message with option to retry

## State Management

### Component State
- `mappings`: Array of procedure mappings
- `loading`: Loading state
- `error`: Error message
- `pagination`: Page, pageSize, total, totalPages
- `search`: Search query
- `modalityFilter`: Selected modality
- `editingId`: ID of mapping being edited
- `isAdding`: Whether in add mode
- `formData`: Current form data
- `formErrors`: Form validation errors
- `saving`: Saving state
- `pacsProcedures`: Available PACS procedures

## Performance Considerations

1. **Pagination:** Default page size is 20 items
2. **Search Debounce:** 300ms debounce on search input
3. **PACS Procedures:** Loaded once on component mount
4. **Lazy Loading:** Mappings loaded on demand with pagination

## Future Enhancements

1. **Bulk Operations:**
   - Bulk edit modality
   - Bulk delete with confirmation
   - Bulk status change

2. **Advanced Filtering:**
   - Filter by status (active/inactive)
   - Filter by date range
   - Filter by created by

3. **Import/Export:**
   - CSV import/export
   - Template download
   - Validation report

4. **Mapping Suggestions:**
   - AI-powered mapping suggestions
   - Similarity matching
   - Auto-mapping based on patterns

5. **Audit Trail:**
   - Track mapping changes
   - Show who created/modified
   - Revert to previous version

## Testing

### Unit Tests
- Form validation
- Error handling
- State management

### Integration Tests
- API calls
- CRUD operations
- Search and filter

### E2E Tests
- Create mapping workflow
- Edit mapping workflow
- Delete mapping workflow
- Search and filter workflow

## Migration Guide

### From Old System

If migrating from old procedure mappings:

1. Export old mappings as JSON
2. Transform to new format
3. Import via bulk import endpoint
4. Verify mappings in new system

### Data Format

Old format:
```json
{
  "khanza_code": "XR001",
  "khanza_name": "Thorax AP/PA",
  "pacs_code": "CR-CHEST-PA",
  "pacs_name": "Chest X-ray PA View"
}
```

New format:
```json
{
  "external_code": "XR001",
  "external_name": "Thorax AP/PA",
  "pacs_code": "CR-CHEST-PA",
  "pacs_name": "Chest X-ray PA View",
  "modality": "CR"
}
```

## Troubleshooting

### PACS Procedures Not Loading
- Check backend connectivity
- Verify PACS procedures exist in database
- Check browser console for errors

### Mappings Not Saving
- Verify all required fields are filled
- Check for duplicate external codes
- Verify PACS code exists

### Search Not Working
- Check search query syntax
- Verify mappings exist with search term
- Clear filters and try again

## References

- [Mappings Page](/mappings)
- [External Systems](/external-systems)
- [Unified Mapping Service](../../services/unifiedMappingService.js)
- [PACS Integration](../../../pacs-service)
