# Order Form Refactoring Documentation

## Overview

This document describes the refactoring of the OrderForm component to align with the backend API specification for order updates as defined in [ORDER_UPDATE_API.md](./ORDER_UPDATE_API.md).

## Key Changes

### 1. Field Mappings

Implemented proper field mappings between frontend and backend:

- `requested_procedure` → `procedure_name`
- `station_ae_title` → `ordering_station_aet`
- `scheduled_start_at` → `scheduled_at`

### 2. Protected Fields

Added validation to prevent updates to protected fields:

- `id`
- `order_number`
- `accession_number`
- `created_at`
- `updated_at`
- `satusehat_service_request_id`

### 3. Validation Logic

Enhanced validation to ensure only valid fields are sent to the backend:

- Check for protected fields
- Validate against allowed updatable fields
- Support for field aliases
- Proper error handling for invalid fields

### 4. Error Handling

Improved error handling to provide better feedback:

- Parse backend validation errors
- Display meaningful error messages to users
- Handle API-specific error responses

## Implementation Details

### Constants

```javascript
// Map frontend field names to backend canonical names
const FIELD_MAPPINGS = {
  requested_procedure: 'procedure_name',
  station_ae_title: 'ordering_station_aet',
  scheduled_start_at: 'scheduled_at'
}

// Protected fields that cannot be updated
const PROTECTED_FIELDS = [
  'id',
  'order_number',
  'accession_number',
  'created_at',
  'updated_at',
  'satusehat_service_request_id'
]

// All valid updatable fields according to API spec
const VALID_FIELDS = [
  'modality',
  'procedure_code',
  'procedure_name',
  'procedure_description',
  'referring_doctor',
  'ordering_physician_name',
  'performing_physician_name',
  'ordering_station_aet',
  'scheduled_at',
  'patient_national_id',
  'patient_name',
  'gender',
  'birth_date',
  'patient_phone',
  'patient_address',
  'medical_record_number',
  'satusehat_ihs_number',
  'registration_number',
  'status',
  'order_status',
  'worklist_status',
  'imaging_status',
  'clinical_indication',
  'clinical_notes',
  'satusehat_encounter_id',
  'satusehat_synced',
  'satusehat_sync_date',
  'org_id',
  'patient_id',
  'details',
  'metadata'
]
```

### Key Functions

#### `prepareOrderData(formData)`

Maps frontend form data to backend API format:

- Converts field names using FIELD_MAPPINGS
- Handles metadata fields properly
- Formats datetime values correctly

#### `validateFields(orderData)`

Validates order data against API specification:

- Checks for protected fields
- Validates against allowed fields
- Supports field aliases

#### `submit()`

Handles order submission with proper validation:

- Validates fields before submission
- Handles API validation errors
- Provides user feedback

## Testing

Added unit tests for order service:

- Field normalization
- Update order functionality
- Error handling

## Benefits

1. **API Compliance**: Ensures all updates follow the backend API specification
2. **Data Integrity**: Prevents accidental updates to protected fields
3. **User Experience**: Provides clear error messages for invalid operations
4. **Maintainability**: Centralized field mapping and validation logic
5. **Error Handling**: Proper handling of API validation responses

## Usage

The refactored OrderForm component automatically handles:

- Field mapping between frontend and backend
- Validation of updatable fields
- Error handling for invalid operations
- Proper datetime formatting
- Metadata handling

## Future Improvements

1. Add more comprehensive unit tests
2. Implement client-side validation for field types
3. Add support for partial updates
4. Enhance error messages with field-specific guidance