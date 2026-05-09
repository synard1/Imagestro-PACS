# Procedure Mapping Guide

## Overview

Fitur **Procedure Mapping** memungkinkan integrasi antara sistem SIMRS/HIS eksternal dengan PACS melalui pemetaan kode prosedur. Ketika SIMRS/HIS mengirim order pemeriksaan radiologi dengan kode prosedur mereka sendiri, sistem dapat secara otomatis memetakannya ke prosedur PACS yang sesuai.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│  SIMRS/HIS      │         │  API Gateway     │         │ Master Data │
│  External       │────────>│  + Auth          │────────>│  Service    │
│  System         │         │                  │         │             │
└─────────────────┘         └──────────────────┘         └─────────────┘
                                                                 │
                                                                 v
                            ┌────────────────────────────────────────────┐
                            │         PostgreSQL Database                │
                            ├────────────────────────────────────────────┤
                            │  • external_systems                        │
                            │  • procedure_mappings                      │
                            │  • procedure_mapping_audit_log             │
                            │  • procedure_mapping_usage                 │
                            └────────────────────────────────────────────┘
```

## Database Schema

### 1. External Systems Table

Menyimpan informasi sistem eksternal (SIMRS/HIS/RIS):

```sql
CREATE TABLE external_systems (
    id UUID PRIMARY KEY,
    system_code VARCHAR(50) UNIQUE NOT NULL,      -- e.g., "SIMRS_RSUD"
    system_name VARCHAR(200) NOT NULL,            -- e.g., "SIMRS RSUD Provinsi"
    system_type VARCHAR(50) NOT NULL,             -- SIMRS, HIS, RIS
    system_version VARCHAR(50),
    vendor VARCHAR(200),
    base_url VARCHAR(500),
    api_endpoint VARCHAR(500),
    auth_type VARCHAR(50),                        -- bearer_token, api_key, basic_auth
    auth_config JSONB,                            -- Authentication configuration
    contact_person VARCHAR(200),
    contact_email VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. Procedure Mappings Table

Menyimpan pemetaan prosedur eksternal ke PACS:

```sql
CREATE TABLE procedure_mappings (
    id UUID PRIMARY KEY,
    external_system_id UUID REFERENCES external_systems(id) ON DELETE CASCADE,
    external_code VARCHAR(100) NOT NULL,          -- Kode prosedur di sistem eksternal
    external_name VARCHAR(255),                   -- Nama prosedur di sistem eksternal
    external_description TEXT,
    pacs_procedure_id UUID REFERENCES procedures(id) ON DELETE CASCADE,
    mapping_type VARCHAR(50) DEFAULT 'exact',     -- exact, approximate, partial
    confidence_level INTEGER DEFAULT 100,         -- 0-100%
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    mapped_by VARCHAR(100),                       -- Username yang membuat mapping
    verified_by VARCHAR(100),                     -- Username yang memverifikasi
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(external_system_id, external_code)
);
```

### 3. Mapping Audit Log

Audit trail untuk perubahan mapping:

```sql
CREATE TABLE procedure_mapping_audit_log (
    id UUID PRIMARY KEY,
    mapping_id UUID,
    action VARCHAR(50),                           -- CREATE, UPDATE, DELETE
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    user_id VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4. Mapping Usage Statistics

Tracking penggunaan mapping untuk analisis:

```sql
CREATE TABLE procedure_mapping_usage (
    id UUID PRIMARY KEY,
    mapping_id UUID REFERENCES procedure_mappings(id) ON DELETE CASCADE,
    external_system_id UUID REFERENCES external_systems(id) ON DELETE CASCADE,
    used_by VARCHAR(100),
    context_data JSONB,
    last_used_at TIMESTAMPTZ DEFAULT now()
);
```

## API Endpoints

### External Systems Management

#### 1. List External Systems

```bash
GET /external-systems
```

**Query Parameters:**
- None

**Response:**
```json
{
  "status": "success",
  "systems": [
    {
      "id": "uuid",
      "system_code": "SIMRS_RSUD",
      "system_name": "SIMRS RSUD Provinsi",
      "system_type": "SIMRS",
      "is_active": true,
      "created_at": "2025-11-14T10:00:00Z"
    }
  ],
  "count": 1
}
```

**Required Permission:** `mapping:read`, `procedure:read`, or `*`

#### 2. Create External System

```bash
POST /external-systems
Content-Type: application/json
```

**Request Body:**
```json
{
  "system_code": "SIMRS_RSUD",
  "system_name": "SIMRS RSUD Provinsi",
  "system_type": "SIMRS",
  "system_version": "3.2.1",
  "vendor": "PT Solusi Kesehatan",
  "base_url": "http://simrs.rsud.local",
  "api_endpoint": "http://simrs.rsud.local/api/v1",
  "auth_type": "bearer_token",
  "contact_person": "Ahmad IT",
  "contact_email": "it@rsud.go.id",
  "is_active": true,
  "notes": "SIMRS utama rumah sakit"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "External system created successfully",
  "system_id": "uuid",
  "system_code": "SIMRS_RSUD"
}
```

**Required Permission:** `mapping:create`, `procedure:create`, or `*`

#### 3. Get External System

```bash
GET /external-systems/{system_id}
```

**Parameters:**
- `system_id`: UUID or system_code

**Response:**
```json
{
  "status": "success",
  "system": {
    "id": "uuid",
    "system_code": "SIMRS_RSUD",
    "system_name": "SIMRS RSUD Provinsi",
    "system_type": "SIMRS",
    "mapping_count": 15,
    ...
  }
}
```

**Required Permission:** `mapping:read`, `procedure:read`, or `*`

#### 4. Update External System

```bash
PUT /external-systems/{system_id}
Content-Type: application/json
```

**Request Body:**
```json
{
  "system_name": "SIMRS RSUD Provinsi (Updated)",
  "is_active": false,
  "notes": "Sistem dalam maintenance"
}
```

**Required Permission:** `mapping:update`, `procedure:update`, or `*`

#### 5. Delete External System

```bash
DELETE /external-systems/{system_id}
```

**Note:** Akan cascade delete semua mappings yang terkait!

**Required Permission:** `mapping:delete`, `procedure:delete`, or `*`

### Procedure Mappings Management

#### 1. List Procedure Mappings

```bash
GET /procedure-mappings
```

**Query Parameters:**
- `external_system_id` (optional): Filter by external system
- `external_code` (optional): Search by external code
- `pacs_procedure_id` (optional): Filter by PACS procedure
- `mapping_type` (optional): Filter by mapping type
- `is_active` (optional): Filter active/inactive (default: true)
- `page` (optional): Page number (default: 1)
- `page_size` (optional): Page size (default: 50, max: 100)

**Response:**
```json
{
  "status": "success",
  "mappings": [
    {
      "id": "uuid",
      "external_code": "RAD-001",
      "external_name": "Foto Thorax 2 Posisi",
      "pacs_code": "CR-CHEST-2V",
      "pacs_name": "Chest X-Ray 2 Views",
      "mapping_type": "exact",
      "confidence_level": 100,
      "system_code": "SIMRS_RSUD",
      "is_active": true
    }
  ],
  "count": 1,
  "page": 1,
  "page_size": 50,
  "total": 1
}
```

**Required Permission:** `mapping:read`, `procedure:read`, or `*`

#### 2. Create Procedure Mapping

```bash
POST /procedure-mappings
Content-Type: application/json
```

**Request Body:**
```json
{
  "external_system_id": "uuid",
  "external_code": "RAD-001",
  "external_name": "Foto Thorax 2 Posisi",
  "external_description": "Pemeriksaan radiologi thorax 2 posisi",
  "pacs_procedure_id": "uuid",
  "mapping_type": "exact",
  "confidence_level": 100,
  "notes": "Mapping 1:1 langsung"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Procedure mapping created successfully",
  "mapping_id": "uuid"
}
```

**Required Permission:** `mapping:create`, `procedure:create`, or `*`

#### 3. Bulk Import Mappings

```bash
POST /procedure-mappings/bulk
Content-Type: application/json
```

**Request Body:**
```json
{
  "mappings": [
    {
      "external_system_id": "uuid",
      "external_code": "RAD-001",
      "external_name": "Foto Thorax 2 Posisi",
      "pacs_procedure_id": "uuid",
      "mapping_type": "exact",
      "confidence_level": 100
    },
    {
      "external_system_id": "uuid",
      "external_code": "RAD-002",
      "external_name": "CT Scan Kepala",
      "pacs_procedure_id": "uuid",
      "mapping_type": "exact",
      "confidence_level": 100
    }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Bulk import completed",
  "inserted": 2,
  "skipped": 0,
  "total": 2,
  "errors": null
}
```

**Required Permission:** `mapping:create`, `procedure:create`, or `*`

#### 4. Lookup/Resolve Mapping

**IMPORTANT:** Endpoint ini digunakan untuk me-resolve kode prosedur eksternal ke prosedur PACS.

```bash
POST /procedure-mappings/lookup
Content-Type: application/json
```

**Request Body:**
```json
{
  "external_system_id": "uuid",
  "external_code": "RAD-001",
  "context": {
    "order_id": "ORD-12345",
    "patient_id": "PAT-67890"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "mapping": {
    "mapping_id": "uuid",
    "external_code": "RAD-001",
    "external_name": "Foto Thorax 2 Posisi",
    "mapping_type": "exact",
    "confidence_level": 100,
    "procedure_id": "uuid",
    "code": "CR-CHEST-2V",
    "name": "Chest X-Ray 2 Views (PA & Lateral)",
    "modality": "CR",
    "loinc_code": "36643-5",
    "duration_minutes": 15,
    "contrast_required": false
  }
}
```

**Error Response (Not Found):**
```json
{
  "status": "not_found",
  "message": "No active mapping found for external code 'RAD-999'"
}
```

**Required Permission:** `mapping:read`, `procedure:read`, or `*`

#### 5. Get Mapping Statistics

```bash
GET /procedure-mappings/stats?external_system_id={uuid}
```

**Response:**
```json
{
  "status": "success",
  "statistics": {
    "total_mappings": 20,
    "active_mappings": 18,
    "verified_mappings": 15,
    "system_count": 3,
    "by_mapping_type": [
      {"mapping_type": "exact", "count": 18},
      {"mapping_type": "approximate", "count": 2}
    ],
    "by_system": [
      {"system_code": "SIMRS_RSUD", "system_name": "...", "mapping_count": 10},
      {"system_code": "HIS_SILOAM", "system_name": "...", "mapping_count": 7}
    ],
    "usage": {
      "total_lookups": 1250,
      "unique_mappings_used": 18,
      "unique_users": 5
    },
    "most_used": [
      {
        "external_code": "RAD-001",
        "external_name": "Foto Thorax 2 Posisi",
        "pacs_code": "CR-CHEST-2V",
        "usage_count": 450
      }
    ]
  }
}
```

**Required Permission:** `mapping:read`, `procedure:read`, or `*`

#### 6. Update Mapping

```bash
PUT /procedure-mappings/{mapping_id}
Content-Type: application/json
```

**Request Body:**
```json
{
  "external_name": "Updated name",
  "confidence_level": 95,
  "notes": "Updated notes",
  "verified": true
}
```

**Required Permission:** `mapping:update`, `procedure:update`, or `*`

#### 7. Delete Mapping

```bash
DELETE /procedure-mappings/{mapping_id}
```

**Required Permission:** `mapping:delete`, `procedure:delete`, or `*`

## Setup & Installation

### 1. Database Initialization

Database tables akan otomatis dibuat saat service startup melalui `entrypoint.sh` dan `init_db.py`.

Verify tables created:
```bash
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
  SELECT tablename FROM pg_tables
  WHERE schemaname='public' AND tablename LIKE '%mapping%'
  ORDER BY tablename;
"
```

Expected output:
- `procedure_mapping_audit_log`
- `procedure_mapping_usage`
- `procedure_mappings`
- `external_systems`

### 2. Seed Sample Data

Seed external systems dan mapping examples:

```bash
cd /home/apps/fullstack-orthanc-dicom/master-data-service
python3 seed_mappings.py
```

Expected output:
```
================================================================================
Procedure Mapping Seeding Script
================================================================================

🔌 Connecting to database...
✓ Database connection successful

================================================================================
Seeding External Systems
================================================================================
✓ Inserted: SIMRS_RSUD - SIMRS RSUD Provinsi
✓ Inserted: HIS_SILOAM - HIS Siloam Hospital
✓ Inserted: RIS_MEDIS - RIS Medis Indonesia

Seeding completed:
  - Inserted: 3 systems
  - Skipped: 0 systems (already exist)
  - Total: 3 systems in seed file

================================================================================
Seeding Procedure Mappings
================================================================================
✓ Mapped: SIMRS_RSUD:RAD-001 → CR-CHEST-2V
✓ Mapped: SIMRS_RSUD:RAD-002 → CT-HEAD-WO
...

Seeding completed:
  - Inserted: 20 mappings
  - Skipped: 0 mappings
  - Total: 20 mappings in seed file

================================================================================
✅ Seeding completed successfully!
================================================================================
```

### 3. Rebuild Service

Jika ada perubahan code, rebuild service:

```bash
cd /home/apps/fullstack-orthanc-dicom
docker compose stop master-data-service
docker compose rm -f master-data-service
docker compose build master-data-service
docker compose up -d master-data-service
```

## Usage Examples

### Scenario 1: SIMRS Integration

**Step 1:** Register SIMRS as external system

```bash
curl -X POST "http://localhost:8080/external-systems" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "system_code": "SIMRS_HOSPITAL_A",
    "system_name": "SIMRS Hospital A",
    "system_type": "SIMRS",
    "vendor": "Vendor X",
    "is_active": true
  }'
```

**Step 2:** Create procedure mappings

```bash
curl -X POST "http://localhost:8080/procedure-mappings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "external_system_id": "uuid-from-step1",
    "external_code": "RAD-THORAX",
    "external_name": "Rontgen Thorax",
    "pacs_procedure_id": "uuid-of-CR-CHEST-2V",
    "mapping_type": "exact",
    "confidence_level": 100
  }'
```

**Step 3:** Resolve mapping when order comes from SIMRS

```bash
curl -X POST "http://localhost:8080/procedure-mappings/lookup" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "external_system_id": "uuid-from-step1",
    "external_code": "RAD-THORAX",
    "context": {
      "order_id": "SIMRS-ORD-12345"
    }
  }'
```

Response will include complete PACS procedure details with LOINC codes.

### Scenario 2: Bulk Import from CSV/Excel

**Step 1:** Prepare mapping data

```json
{
  "mappings": [
    {
      "external_system_id": "uuid",
      "external_code": "RAD-001",
      "external_name": "Foto Thorax 2 Posisi",
      "pacs_procedure_id": "uuid-of-CR-CHEST-2V",
      "mapping_type": "exact",
      "confidence_level": 100
    },
    ...
  ]
}
```

**Step 2:** Bulk import

```bash
curl -X POST "http://localhost:8080/procedure-mappings/bulk" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @mappings.json
```

### Scenario 3: View Statistics

```bash
# Overall statistics
curl -X GET "http://localhost:8080/procedure-mappings/stats" \
  -H "Authorization: Bearer $TOKEN" | jq

# Statistics for specific system
curl -X GET "http://localhost:8080/procedure-mappings/stats?external_system_id=uuid" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Permissions

Configure user permissions untuk mengakses mapping features:

| Action | Required Permission |
|--------|-------------------|
| View mappings | `mapping:read`, `procedure:read`, or `*` |
| Create mappings | `mapping:create`, `procedure:create`, or `*` |
| Update mappings | `mapping:update`, `procedure:update`, or `*` |
| Delete mappings | `mapping:delete`, `procedure:delete`, or `*` |
| View statistics | `mapping:read`, `procedure:read`, or `*` |
| Lookup/resolve | `mapping:read`, `procedure:read`, or `*` |

**Grant permissions via auth-service:**

```bash
# Grant full mapping permissions to user
curl -X POST "http://localhost:8080/auth/users/{user_id}/permissions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": ["mapping:*"]
  }'

# Or grant individual permissions
curl -X POST "http://localhost:8080/auth/users/{user_id}/permissions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": ["mapping:read", "mapping:create"]
  }'
```

## Best Practices

### 1. Mapping Types

- **exact**: Mapping 1:1 yang sempurna (confidence: 100%)
- **approximate**: Mapping yang mirip tapi tidak persis sama (confidence: 70-95%)
- **partial**: Mapping sebagian/subset (confidence: 50-70%)

### 2. Confidence Level

- **100%**: Mapping yang sudah diverifikasi dan dipastikan benar
- **80-99%**: Mapping yang kemungkinan besar benar tapi perlu review
- **<80%**: Mapping yang perlu verifikasi manual

### 3. Verification Workflow

1. Create mapping dengan status unverified
2. Test mapping dengan sample data
3. Jika correct, update dengan `verified: true`
4. System akan record `verified_by` dan `verified_at`

### 4. Monitoring

Monitor mapping usage untuk:
- Identify frequently used mappings
- Detect unused mappings
- Track mapping accuracy
- Performance optimization

## Troubleshooting

### Issue: Mapping not found

**Problem:** Lookup returns 404 not found

**Solutions:**
1. Check if mapping exists dan active
2. Verify external_system_id dan external_code correct
3. Check PACS procedure masih active

```bash
# Check mapping exists
curl -X GET "http://localhost:8080/procedure-mappings?external_code=RAD-001" \
  -H "Authorization: Bearer $TOKEN"
```

### Issue: Multiple mappings for same code

**Problem:** Duplicate mappings created

**Solution:** Database constraint `UNIQUE(external_system_id, external_code)` prevents this. If error occurs, update existing mapping instead.

### Issue: PACS procedure not found

**Problem:** pacs_procedure_id tidak valid saat create mapping

**Solution:**
1. List available PACS procedures first
2. Use correct procedure UUID

```bash
# List PACS procedures
curl -X GET "http://localhost:8080/procedures" \
  -H "Authorization: Bearer $TOKEN"
```

## Integration Guide

### Order Service Integration

When Order Service receives order from SIMRS:

```python
# 1. Receive order from SIMRS
simrs_order = {
    "external_system": "SIMRS_RSUD",
    "procedure_code": "RAD-001",
    "patient_id": "12345"
}

# 2. Lookup mapping
mapping_response = requests.post(
    "http://api-gateway:8080/procedure-mappings/lookup",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "external_system_id": get_system_id("SIMRS_RSUD"),
        "external_code": simrs_order["procedure_code"],
        "context": {
            "order_id": simrs_order["id"]
        }
    }
)

# 3. Use mapped PACS procedure
if mapping_response.status_code == 200:
    mapping = mapping_response.json()["mapping"]
    pacs_procedure_id = mapping["procedure_id"]
    pacs_code = mapping["code"]
    loinc_code = mapping["loinc_code"]

    # Create order with PACS procedure
    create_pacs_order(
        procedure_id=pacs_procedure_id,
        procedure_code=pacs_code,
        loinc_code=loinc_code
    )
else:
    # No mapping found - handle error
    logger.error(f"No mapping found for {simrs_order['procedure_code']}")
```

## References

- [PROCEDURES_README.md](PROCEDURES_README.md) - PACS Procedures API documentation
- [SUCCESS_VERIFICATION.md](SUCCESS_VERIFICATION.md) - Database setup verification
- [DATABASE_INIT_FIX.md](DATABASE_INIT_FIX.md) - Database initialization details

## Support

For issues or questions:
1. Check logs: `docker compose logs master-data-service -f`
2. Verify database: `docker exec dicom-postgres-secured psql -U dicom -d worklist_db`
3. Review audit logs: Query `procedure_mapping_audit_log` table

---

**Version:** 1.0
**Last Updated:** 2025-11-14
**Service:** master-data-service
