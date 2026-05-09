# Master Data Service Migration Guide

This guide explains how to migrate existing services to use the new centralized Master Data Service for patient management.

## Overview

The Master Data Service provides a centralized repository for patient information that was previously duplicated across multiple services. This migration guide will help you update your services to use the new centralized approach.

## Services Affected

The following services currently duplicate patient information and should be migrated:

1. **Order Management Service** - Contains patient data in the `orders` table
2. **Accession API Service** - Contains patient data in the `accessions` table
3. **MWL Writer Service** - Contains patient data in the `worklists` table

## Migration Steps

### 1. Update Service Dependencies

Add the Master Data Service as a dependency in your service's code:

```python
# Example for Order Management Service
MASTER_DATA_SERVICE_URL = os.getenv('MASTER_DATA_SERVICE_URL', 'http://master-data-service:8002')
```

### 2. Replace Direct Database Queries

Replace direct database queries for patient information with API calls to the Master Data Service.

**Before (Direct Database Query):**
```python
# In order_management_service.py
cursor.execute("""
    SELECT patient_national_id, patient_name, gender, birth_date 
    FROM patients 
    WHERE patient_national_id = %s
""", (patient_national_id,))
patient = cursor.fetchone()
```

**After (API Call to Master Data Service):**
```python
# In order_management_service.py
import requests

def get_patient_info(patient_national_id):
    try:
        headers = {
            'Authorization': f'Bearer {get_current_jwt_token()}'
        }
        response = requests.get(
            f"{MASTER_DATA_SERVICE_URL}/patients/{patient_national_id}",
            headers=headers
        )
        if response.status_code == 200:
            return response.json()['patient']
        else:
            logger.error(f"Failed to fetch patient: {response.status_code}")
            return None
    except Exception as e:
        logger.error(f"Error fetching patient: {str(e)}")
        return None
```

### 3. Update Data Models

Remove patient fields from service-specific tables that are now managed by the Master Data Service:

**Order Management Service - Before:**
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    accession_number VARCHAR(50) UNIQUE,
    modality VARCHAR(10),
    procedure_code VARCHAR(50),
    procedure_name VARCHAR(200),
    scheduled_at TIMESTAMPTZ,
    -- Patient fields (to be removed)
    patient_national_id VARCHAR(16),
    patient_name VARCHAR(200),
    gender VARCHAR(10),
    birth_date DATE,
    medical_record_number VARCHAR(50),
    ihs_number VARCHAR(50),
    registration_number VARCHAR(50),
    -- End patient fields
    status VARCHAR(20) DEFAULT 'CREATED',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Order Management Service - After:**
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    accession_number VARCHAR(50) UNIQUE,
    modality VARCHAR(10),
    procedure_code VARCHAR(50),
    procedure_name VARCHAR(200),
    scheduled_at TIMESTAMPTZ,
    -- Keep only reference to patient
    patient_national_id VARCHAR(16) REFERENCES patients(patient_national_id),
    registration_number VARCHAR(50),
    -- End reference
    status VARCHAR(20) DEFAULT 'CREATED',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 4. Update Service Logic

Update your service logic to fetch patient information from the Master Data Service when needed:

```python
# Example in order management service
def create_order(order_data):
    # Validate patient exists in master data service
    patient = get_patient_info(order_data['patient_national_id'])
    if not patient:
        return {"error": "Patient not found in master data service"}, 404
    
    # Create order with patient reference only
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO orders (
                order_number, accession_number, modality, 
                procedure_code, procedure_name, scheduled_at,
                patient_national_id, registration_number
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            order_data['order_number'],
            order_data['accession_number'],
            order_data['modality'],
            order_data['procedure_code'],
            order_data['procedure_name'],
            order_data['scheduled_at'],
            order_data['patient_national_id'],
            order_data['registration_number']
        ))
        # ... rest of order creation logic
```

### 5. Run Data Migration

Use the provided migration script to move existing patient data to the Master Data Service:

```bash
# Run the migration script
python migrate_patients.py
```

### 6. Update API Gateway Routes

The API Gateway has already been updated to route patient requests to the Master Data Service. No additional changes are needed.

## API Endpoints

The Master Data Service provides the following endpoints for patient management:

- `POST /patients` - Create a new patient
- `GET /patients/{patient_id_or_nik}` - Retrieve patient by ID or NIK
- `PUT /patients/{patient_id}` - Update patient information
- `DELETE /patients/{patient_id}` - Soft delete a patient
- `GET /patients/search` - Search patients by various criteria

All endpoints require JWT authentication with appropriate permissions.

## Permissions

The Master Data Service uses the following permissions:

- `patient:create` - Create patients
- `patient:read` - Read patient information
- `patient:update` - Update patient information
- `patient:delete` - Delete patients
- `patient:search` - Search patients

## Testing

After migration, test your services to ensure they properly integrate with the Master Data Service:

1. Verify patient data can be retrieved through the API
2. Confirm that creating new orders/requests still works
3. Check that existing functionality is preserved
4. Test error handling for missing patients

## Rollback Plan

If issues are encountered during migration:

1. Revert code changes to use direct database queries
2. Restore database from backup if needed
3. Contact the development team for assistance

## Support

For questions or issues with the migration, contact the development team.