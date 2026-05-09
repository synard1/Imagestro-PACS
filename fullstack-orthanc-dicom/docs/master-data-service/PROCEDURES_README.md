# Procedures Master Data Module

## Overview

Module ini menyediakan master data management untuk prosedur medis/radiologi dengan dukungan penuh untuk:
- LOINC codes (Logical Observation Identifiers Names and Codes)
- ICD-10 codes untuk diagnosis
- CPT codes untuk billing
- SATUSEHAT integration codes
- Comprehensive procedure metadata

## Database Schema

### Main Tables

#### 1. `procedures` (Main Table)
Tabel utama untuk menyimpan prosedur medis/radiologi.

**Fields:**
- `id` (UUID): Primary key
- `code` (VARCHAR): Unique procedure code
- `name` (VARCHAR): Procedure name
- `display_name` (VARCHAR): Display name for UI
- `category` (VARCHAR): Category (e.g., Radiology, Laboratory)
- `modality` (VARCHAR): Primary modality (CR, CT, MR, US, etc.)
- `body_part` (VARCHAR): Body part being examined
- `description` (TEXT): Detailed description
- `loinc_code` (VARCHAR): LOINC code for standardization
- `loinc_display` (VARCHAR): LOINC display name
- `icd10_code` (VARCHAR): ICD-10 diagnosis code
- `icd10_display` (VARCHAR): ICD-10 description
- `icd9_cm_code` (VARCHAR): Legacy ICD-9-CM code
- `cpt_code` (VARCHAR): CPT code for billing
- `satusehat_code` (VARCHAR): SATUSEHAT coding
- `satusehat_system` (VARCHAR): SATUSEHAT system URI
- `duration_minutes` (INTEGER): Estimated duration
- `prep_instructions` (TEXT): Patient preparation instructions
- `contrast_required` (BOOLEAN): Requires contrast media
- `sedation_required` (BOOLEAN): Requires sedation
- `radiation_dose_range` (VARCHAR): Estimated radiation dose
- `cost_estimate` (NUMERIC): Cost estimate in IDR
- `active` (BOOLEAN): Active status
- `sort_order` (INTEGER): Display order
- `created_at`, `updated_at`, `deleted_at` (TIMESTAMP)

#### 2. `procedure_modalities`
Multiple modality mapping per procedure.

**Fields:**
- `procedure_id` (UUID): FK to procedures
- `modality_code` (VARCHAR): DICOM modality code
- `modality_name` (VARCHAR): Modality display name
- `is_primary` (BOOLEAN): Primary modality flag
- `notes` (TEXT): Additional notes

#### 3. `procedure_contraindications`
Contraindications for procedures.

**Fields:**
- `procedure_id` (UUID): FK to procedures
- `contraindication` (TEXT): Contraindication description
- `severity` (ENUM): absolute, relative, caution
- `notes` (TEXT): Additional notes

#### 4. `procedure_equipment`
Required equipment for procedures.

**Fields:**
- `procedure_id` (UUID): FK to procedures
- `equipment_name` (VARCHAR): Equipment name
- `equipment_type` (VARCHAR): Equipment type
- `is_required` (BOOLEAN): Required or optional
- `quantity` (INTEGER): Required quantity

#### 5. `procedure_protocols`
Imaging protocols for procedures.

**Fields:**
- `procedure_id` (UUID): FK to procedures
- `protocol_name` (VARCHAR): Protocol name
- `protocol_description` (TEXT): Description
- `imaging_parameters` (JSONB): Parameters in JSON format
- `sequence_order` (INTEGER): Execution order
- `active` (BOOLEAN): Active status

#### 6. `procedure_audit_log`
Audit trail untuk perubahan procedures.

#### 7. `loinc_codes`
Reference table untuk LOINC codes dengan metadata lengkap.

## API Endpoints

### Base URL
Via API Gateway: `https://your-domain/procedures`

### Endpoints

#### 1. List Procedures (Paginated)
```http
GET /procedures
```

**Query Parameters:**
- `code`: Filter by code (partial match)
- `name`: Filter by name (partial match)
- `category`: Filter by category
- `modality`: Filter by modality
- `body_part`: Filter by body part
- `loinc_code`: Filter by LOINC code
- `active`: true/false/all (default: true)
- `page`: Page number (default: 1)
- `page_size`: Items per page (default: 25, max: 100)

**Response:**
```json
{
  "status": "success",
  "procedures": [...],
  "count": 25,
  "page": 1,
  "page_size": 25,
  "total": 150
}
```

**Required Permission:** `procedure:read`, `procedure:search`, or `*`

#### 2. Search Procedures (Simple)
```http
GET /procedures/search?q=chest&modality=CR
```

**Query Parameters:**
- `q`: Search query (matches code, name, or LOINC)
- `category`: Filter by category
- `modality`: Filter by modality

**Response:**
```json
{
  "status": "success",
  "procedures": [...],
  "count": 10
}
```

**Required Permission:** `procedure:search`, `procedure:read`, or `*`

#### 3. Get Procedure by ID/Code
```http
GET /procedures/{id_or_code}
```

**Response:**
```json
{
  "status": "success",
  "procedure": {
    "id": "uuid",
    "code": "CR-CHEST-2V",
    "name": "Chest X-Ray 2 Views",
    "loinc_code": "36643-5",
    "modalities": [...],
    "contraindications": [...],
    "equipment": [...],
    "protocols": [...]
  }
}
```

**Required Permission:** `procedure:read` or `*`

#### 4. Create Procedure
```http
POST /procedures
Content-Type: application/json

{
  "code": "CR-CHEST-2V",
  "name": "Chest X-Ray 2 Views",
  "display_name": "Chest X-Ray 2 Views",
  "category": "Radiology",
  "modality": "CR",
  "body_part": "Chest",
  "loinc_code": "36643-5",
  "loinc_display": "X-ray Chest 2 Views",
  "duration_minutes": 15,
  "active": true
}
```

**Required Permission:** `procedure:create` or `*`

#### 5. Update Procedure
```http
PUT /procedures/{id}
Content-Type: application/json

{
  "name": "Updated Name",
  "duration_minutes": 20
}
```

**Required Permission:** `procedure:update` or `*`

#### 6. Delete Procedure (Soft Delete)
```http
DELETE /procedures/{id}
```

**Required Permission:** `procedure:delete` or `*`

#### 7. Get Procedure Modalities
```http
GET /procedures/{id}/modalities
```

**Required Permission:** `procedure:read` or `*`

#### 8. Add Modality to Procedure
```http
POST /procedures/{id}/modalities
Content-Type: application/json

{
  "modality_code": "CT",
  "modality_name": "Computed Tomography",
  "is_primary": false
}
```

**Required Permission:** `procedure:update` or `*`

## LOINC Code Integration

### Supported LOINC Classes
- **RAD** - Radiology studies
- **IMG** - Imaging procedures
- **US** - Ultrasound
- **CT** - Computed Tomography
- **MR** - Magnetic Resonance
- **NM** - Nuclear Medicine

### Example LOINC Codes in Seed Data
- `36643-5` - X-ray Chest 2 Views
- `36554-4` - X-ray Chest 1 View
- `79096-1` - CT Head WO contrast
- `79095-3` - CT Head W contrast IV
- `79101-9` - CT Abdomen and Pelvis W contrast IV
- `79124-1` - MR Brain WO contrast
- `58750-3` - US Abdomen
- `37768-7` - Mammogram Bilateral

### LOINC System URI
```
http://loinc.org
```

## SATUSEHAT Integration

Semua prosedur dilengkapi dengan:
- `satusehat_code`: LOINC code (standar untuk Indonesia)
- `satusehat_system`: "http://loinc.org"

SATUSEHAT menggunakan LOINC sebagai standar kode untuk prosedur diagnostik dan imaging.

### Mapping ke FHIR ServiceRequest
```json
{
  "resourceType": "ServiceRequest",
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "36643-5",
        "display": "X-ray Chest 2 Views"
      }
    ]
  }
}
```

## Seeding Data

### Menggunakan Seed Script

1. Pastikan database sudah berjalan dan ter-migrate
2. Run seed script:
```bash
cd master-data-service
python seed_procedures.py
```

### Seed Data Content
File `procedures_seed.json` berisi 15 prosedur radiologi umum:
- Chest X-Ray (1 & 2 views)
- CT Head (with/without contrast)
- CT Chest with contrast
- CT Abdomen-Pelvis with contrast
- MRI Brain (with/without contrast)
- MRI Lumbar Spine
- Ultrasound Abdomen
- Ultrasound Obstetric
- Ultrasound Thyroid
- X-Ray Lumbar Spine
- X-Ray Skull
- Mammography Bilateral

Semua prosedur dilengkapi dengan:
- LOINC codes yang valid
- ICD-10 codes
- CPT codes untuk billing
- Estimasi durasi dan biaya
- Instruksi persiapan pasien
- Informasi radiasi (untuk modalitas yang menggunakan radiasi)

## Permission Model

### Required Permissions
- `procedure:read` - Read procedure data
- `procedure:search` - Search procedures
- `procedure:create` - Create new procedures
- `procedure:update` - Update existing procedures
- `procedure:delete` - Delete procedures (soft delete)
- `*` - Admin wildcard (all permissions)

### Wildcard Support
- `procedure:*` - All procedure permissions
- `*` - Global admin permission

## Usage Examples

### Search Chest X-Ray Procedures
```bash
curl -X GET "https://api.example.com/procedures/search?q=chest&modality=CR" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Procedure by Code
```bash
curl -X GET "https://api.example.com/procedures/CR-CHEST-2V" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Create New Procedure
```bash
curl -X POST "https://api.example.com/procedures" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "US-BREAST-BILATERAL",
    "name": "Ultrasound Breast Bilateral",
    "category": "Radiology",
    "modality": "US",
    "body_part": "Breast",
    "loinc_code": "26349-3",
    "loinc_display": "US Breast Bilateral",
    "duration_minutes": 30
  }'
```

## Integration with Order Management

Prosedur dapat diintegrasikan dengan Order Management Service untuk:
1. Validasi kode prosedur saat membuat order
2. Auto-populate informasi prosedur (durasi, persiapan, dll)
3. Cost estimation
4. Modality routing
5. LOINC code untuk ServiceRequest SATUSEHAT

## Best Practices

1. **Always use LOINC codes** untuk standardisasi dengan sistem kesehatan nasional dan internasional
2. **Keep procedures up-to-date** dengan guideline terbaru
3. **Include prep instructions** yang jelas untuk patient safety
4. **Accurate cost estimates** untuk transparency dan billing
5. **Proper modality codes** untuk DICOM routing yang benar
6. **Regular audit** menggunakan audit logs

## Troubleshooting

### Issue: Duplicate code error
**Solution:** Check if procedure code already exists. Use unique codes for each procedure.

### Issue: LOINC code not found
**Solution:** Verify LOINC code dari official LOINC database (https://loinc.org)

### Issue: Permission denied
**Solution:** Ensure user has appropriate procedure permissions (`procedure:read`, `procedure:create`, etc.)

## Procedure Mapping Integration

### Overview

Procedure Mapping memungkinkan integrasi dengan sistem eksternal (SIMRS/HIS/RIS) dengan memetakan kode prosedur mereka ke prosedur PACS.

### Key Features

- **External Systems Management**: Register dan manage sistem eksternal (SIMRS/HIS)
- **Procedure Mapping**: Map kode prosedur eksternal ke PACS procedures
- **Bulk Import**: Import mappings dalam jumlah banyak sekaligus
- **Lookup/Resolution**: Resolve external codes ke PACS procedures
- **Usage Tracking**: Monitor mapping usage dan statistics
- **Audit Trail**: Complete audit log untuk semua mapping changes

### Quick Start

#### 1. Register External System

```bash
curl -X POST "http://localhost:8080/external-systems" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "system_code": "SIMRS_HOSPITAL",
    "system_name": "SIMRS Hospital Name",
    "system_type": "SIMRS",
    "is_active": true
  }'
```

#### 2. Create Procedure Mapping

```bash
curl -X POST "http://localhost:8080/procedure-mappings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "external_system_id": "uuid",
    "external_code": "RAD-001",
    "external_name": "Foto Thorax",
    "pacs_procedure_id": "uuid-of-CR-CHEST-2V",
    "mapping_type": "exact",
    "confidence_level": 100
  }'
```

#### 3. Lookup Mapping (Resolve External Code)

```bash
curl -X POST "http://localhost:8080/procedure-mappings/lookup" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "external_system_id": "uuid",
    "external_code": "RAD-001"
  }'
```

Response includes complete PACS procedure details with LOINC codes.

### Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/external-systems` | GET | List external systems |
| `/external-systems` | POST | Create external system |
| `/external-systems/{id}` | GET/PUT/DELETE | Manage external system |
| `/procedure-mappings` | GET | List mappings (with filters) |
| `/procedure-mappings` | POST | Create mapping |
| `/procedure-mappings/bulk` | POST | Bulk import mappings |
| `/procedure-mappings/lookup` | POST | Resolve external code |
| `/procedure-mappings/stats` | GET | Get mapping statistics |
| `/procedure-mappings/{id}` | GET/PUT/DELETE | Manage mapping |

### Seed Sample Data

```bash
cd /home/apps/fullstack-orthanc-dicom/master-data-service
python3 seed_mappings.py
```

This will seed:
- 3 sample external systems (SIMRS_RSUD, HIS_SILOAM, RIS_MEDIS)
- 20 sample procedure mappings

### Documentation

For complete mapping documentation, see [MAPPING_GUIDE.md](MAPPING_GUIDE.md)

## Future Enhancements

- [ ] DICOM Structured Report template mapping
- [ ] Automatic cost calculation based on complexity
- [ ] Multi-language support untuk instructions
- [ ] Integration dengan national radiology guidelines
- [ ] CPT code auto-suggestion
- [ ] Radiation dose tracking dan reporting

## References

- LOINC Official: https://loinc.org
- SATUSEHAT Documentation: https://satusehat.kemkes.go.id
- DICOM Standard: https://www.dicomstandard.org
- ICD-10 Codes: https://www.who.int/classifications/icd
