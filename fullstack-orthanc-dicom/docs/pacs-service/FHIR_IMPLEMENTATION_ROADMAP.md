# FHIR R4 Implementation Roadmap

## 📅 Status
**Library Installed**: ✅ `fhir.resources==7.1.0`
**Current Status**: Ready to implement
**Integration**: Will integrate with existing HL7 v2.x implementation

---

## 🎯 IMPLEMENTATION GOALS

### Primary Objectives
1. **Modern Interoperability** - FHIR R4 compliance for modern HIS/EMR integration
2. **Bi-directional Conversion** - HL7 v2.x ↔ FHIR R4 seamless conversion
3. **Resource Management** - Full CRUD operations for FHIR resources
4. **Standards Compliance** - Follow FHIR R4 specifications
5. **Database Storage** - Persist FHIR resources with full history

### Supported FHIR Resources (Phase 1)
- ✅ **Patient** - Demographics, identifiers
- ✅ **ServiceRequest** - Radiology orders
- ✅ **DiagnosticReport** - Imaging reports
- ✅ **Observation** - Report findings
- ✅ **ImagingStudy** - DICOM study metadata
- ✅ **Encounter** - Patient encounters

---

## 📋 IMPLEMENTATION PHASES

### **Phase F1: FHIR Infrastructure** (Priority: HIGH)

#### Database Migration
```sql
-- 017_create_fhir_tables.sql
CREATE TABLE fhir_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    version_id INT DEFAULT 1,
    resource_json JSONB NOT NULL,
    last_updated TIMESTAMP DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE,

    -- Indexes
    UNIQUE(resource_type, resource_id, version_id),
    INDEX idx_fhir_resource_type ON fhir_resources(resource_type),
    INDEX idx_fhir_resource_id ON fhir_resources(resource_id),
    INDEX idx_fhir_last_updated ON fhir_resources(last_updated)
);

-- Search parameters table (for advanced FHIR search)
CREATE TABLE fhir_search_params (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_fhir_id UUID REFERENCES fhir_resources(id),
    param_name VARCHAR(100),
    param_value TEXT,
    param_type VARCHAR(20), -- string, token, reference, date, etc.
    INDEX idx_search_param ON fhir_search_params(param_name, param_value)
);
```

#### Services to Create
1. **`fhir_base_service.py`** - Base FHIR operations (CRUD)
2. **`fhir_patient_service.py`** - Patient resource handler
3. **`fhir_service_request_service.py`** - ServiceRequest handler
4. **`fhir_diagnostic_report_service.py`** - DiagnosticReport handler
5. **`fhir_observation_service.py`** - Observation handler
6. **`fhir_imaging_study_service.py`** - ImagingStudy handler
7. **`fhir_search_service.py`** - FHIR search implementation

---

### **Phase F2: HL7-FHIR Converters** (Priority: HIGH)

#### Converters to Create
1. **`hl7_to_fhir_converter.py`** - Main converter
   - ADT → Patient
   - ORM → ServiceRequest
   - ORU → DiagnosticReport + Observation

2. **`fhir_to_hl7_converter.py`** - Reverse converter (if needed)
   - Patient → ADT
   - ServiceRequest → ORM
   - DiagnosticReport → ORU

#### Conversion Mappings

**ADT A01 → FHIR Patient**
```python
HL7 PID-3 (Patient ID) → Patient.identifier
HL7 PID-5 (Patient Name) → Patient.name
HL7 PID-7 (Birth Date) → Patient.birthDate
HL7 PID-8 (Gender) → Patient.gender
HL7 PID-11 (Address) → Patient.address
HL7 PID-13 (Phone) → Patient.telecom
```

**ORM O01 → FHIR ServiceRequest**
```python
HL7 ORC-2 (Placer Order Number) → ServiceRequest.identifier
HL7 ORC-1 (Order Control) → ServiceRequest.status
HL7 OBR-4 (Universal Service ID) → ServiceRequest.code
HL7 OBR-6 (Requested Date/Time) → ServiceRequest.occurrenceDateTime
HL7 OBR-16 (Ordering Provider) → ServiceRequest.requester
```

**ORU R01 → FHIR DiagnosticReport + Observation**
```python
HL7 OBR → DiagnosticReport
HL7 OBR-25 (Result Status) → DiagnosticReport.status
HL7 OBX → Observation (multiple)
HL7 OBX-3 (Observation ID) → Observation.code
HL7 OBX-5 (Observation Value) → Observation.valueString
```

---

### **Phase F3: FHIR RESTful API** (Priority: HIGH)

#### API Endpoints to Implement

**Base FHIR Endpoints**
```
# Read (GET)
GET /api/fhir/{resourceType}/{id}
GET /api/fhir/{resourceType}/{id}/_history/{vid}

# Search (GET)
GET /api/fhir/{resourceType}?{search_params}
GET /api/fhir/Patient?identifier=123456
GET /api/fhir/ServiceRequest?patient=Patient/123
GET /api/fhir/DiagnosticReport?status=final

# Create (POST)
POST /api/fhir/{resourceType}

# Update (PUT)
PUT /api/fhir/{resourceType}/{id}

# Delete (DELETE)
DELETE /api/fhir/{resourceType}/{id}

# Batch/Transaction (POST)
POST /api/fhir/
```

**Custom Operations**
```
# Convert HL7 to FHIR
POST /api/fhir/$convert-hl7-to-fhir

# Sync order with FHIR
POST /api/fhir/ServiceRequest/$sync-order

# Generate report bundle
GET /api/fhir/DiagnosticReport/{id}/$bundle
```

---

### **Phase F4: Integration with Existing System** (Priority: MEDIUM)

#### Integration Points

1. **HL7 Message Processing**
   - When ADT message received → Auto-create FHIR Patient
   - When ORM message received → Auto-create FHIR ServiceRequest
   - When ORU message received → Auto-create FHIR DiagnosticReport

2. **Orders Table**
   - Add column: `fhir_service_request_id`
   - Link orders ↔ FHIR ServiceRequest

3. **Studies/Reports**
   - Add column: `fhir_diagnostic_report_id`
   - Link reports ↔ FHIR DiagnosticReport

4. **Celery Tasks**
   - `convert_hl7_to_fhir_async` - Background conversion
   - `sync_fhir_to_external_async` - Sync to SATUSEHAT/external FHIR servers

---

### **Phase F5: FHIR Search Implementation** (Priority: MEDIUM)

#### Search Parameters

**Patient Search**
```
identifier, name, birthdate, gender, address, phone, email
```

**ServiceRequest Search**
```
patient, identifier, status, code, authored, requester, intent
```

**DiagnosticReport Search**
```
patient, identifier, status, code, issued, result, performer
```

**Observation Search**
```
patient, code, value-string, date, status
```

---

## 📂 FILE STRUCTURE

```
app/
├── services/fhir/
│   ├── __init__.py
│   ├── fhir_base_service.py              # Base CRUD operations
│   ├── fhir_patient_service.py           # Patient resource
│   ├── fhir_service_request_service.py   # ServiceRequest resource
│   ├── fhir_diagnostic_report_service.py # DiagnosticReport resource
│   ├── fhir_observation_service.py       # Observation resource
│   ├── fhir_imaging_study_service.py     # ImagingStudy resource
│   └── fhir_search_service.py            # FHIR search
├── converters/
│   ├── __init__.py
│   ├── hl7_to_fhir_converter.py          # HL7 → FHIR
│   └── fhir_to_hl7_converter.py          # FHIR → HL7 (optional)
├── models/
│   └── fhir_resource.py                  # SQLAlchemy models
├── routers/
│   └── fhir.py                           # FHIR API endpoints
└── tasks/
    └── fhir_tasks.py                     # Celery tasks

migrations/
└── 017_create_fhir_tables.sql            # FHIR database schema

tests/
├── unit/
│   ├── test_fhir_patient_service.py
│   ├── test_fhir_converter.py
│   └── test_fhir_search.py
└── integration/
    └── test_fhir_endpoints.py
```

---

## 🔄 WORKFLOW EXAMPLES

### Example 1: ADT → FHIR Patient
```
1. HIS sends ADT A01
   → POST /api/hl7/adt

2. HL7 ADT Handler processes message
   → Store in hl7_messages table

3. Auto-trigger FHIR conversion
   → hl7_to_fhir_converter.convert_adt_to_patient()

4. Create FHIR Patient resource
   → Store in fhir_resources table

5. Return ACK to HIS
   → ACK AA with Patient ID
```

### Example 2: ORM → FHIR ServiceRequest
```
1. HIS sends ORM O01 (New Order)
   → POST /api/hl7/orm

2. HL7 ORM Handler processes
   → Create order in orders table

3. Auto-convert to FHIR
   → Create ServiceRequest resource

4. Link order ↔ ServiceRequest
   → orders.fhir_service_request_id = ServiceRequest.id

5. Return ACK
```

### Example 3: Query FHIR Resources
```
1. External system queries
   → GET /api/fhir/Patient?identifier=123456

2. FHIR Search Service
   → Query fhir_resources table

3. Return FHIR Bundle
   → Bundle of matching Patient resources
```

---

## 🎯 PRIORITY IMPLEMENTATION ORDER

### Week 1: Foundation
1. ✅ Install fhir.resources library
2. ⏳ Create database migration (017_create_fhir_tables.sql)
3. ⏳ Create fhir_base_service.py
4. ⏳ Create fhir_patient_service.py
5. ⏳ Create basic FHIR endpoints

### Week 2: Core Resources
6. ⏳ Create fhir_service_request_service.py
7. ⏳ Create fhir_diagnostic_report_service.py
8. ⏳ Create fhir_observation_service.py
9. ⏳ Create FHIR router with CRUD endpoints

### Week 3: Converters & Integration
10. ⏳ Create hl7_to_fhir_converter.py
11. ⏳ Integrate with existing HL7 handlers
12. ⏳ Auto-convert ADT → Patient
13. ⏳ Auto-convert ORM → ServiceRequest
14. ⏳ Auto-convert ORU → DiagnosticReport

### Week 4: Search & Testing
15. ⏳ Implement FHIR search service
16. ⏳ Create unit tests
17. ⏳ Create integration tests
18. ⏳ Documentation

---

## 📊 EXPECTED OUTCOMES

### After Full Implementation

**New Capabilities:**
- ✅ Full FHIR R4 server functionality
- ✅ Seamless HL7 ↔ FHIR conversion
- ✅ Modern REST API for EMR integration
- ✅ Standards-compliant resource storage
- ✅ Advanced FHIR search
- ✅ Resource versioning & history

**API Endpoints:**
- 12 HL7 endpoints (existing)
- 30+ FHIR endpoints (new)
- Total: 42+ interoperability endpoints

**Resource Support:**
- HL7 v2.x: ADT, ORM, ORU (8+6+6 = 20 message types)
- FHIR R4: Patient, ServiceRequest, DiagnosticReport, Observation, ImagingStudy, Encounter (6 resources)

**Use Cases:**
1. Legacy HIS → HL7 v2.x → PACS
2. Modern EMR → FHIR R4 → PACS
3. PACS → FHIR R4 → National Health System (SATUSEHAT)
4. Query patient data via FHIR API
5. Create orders via FHIR API
6. Retrieve reports via FHIR API

---

## 🔐 SECURITY CONSIDERATIONS

1. **Authentication** - OAuth 2.0 / JWT for FHIR endpoints
2. **Authorization** - SMART on FHIR scopes
3. **Audit Trail** - Log all FHIR operations
4. **Data Validation** - FHIR profile validation
5. **Rate Limiting** - Protect against abuse

---

## 📚 REFERENCES

- **FHIR R4 Spec**: https://hl7.org/fhir/R4/
- **fhir.resources**: https://pypi.org/project/fhir.resources/
- **HL7 to FHIR**: https://www.hl7.org/fhir/mapping-language.html
- **SATUSEHAT FHIR**: https://satusehat.kemkes.go.id/platform/docs/id/interoperability/fhir

---

## ✅ PREREQUISITES (COMPLETED)

- ✅ HL7 v2.x implementation (ADT, ORM, ORU)
- ✅ Database with orders, patients data
- ✅ Celery for async processing
- ✅ FastAPI framework
- ✅ fhir.resources library installed

---

## 🚀 NEXT STEPS

**Option 1: Continue FHIR Implementation Now**
- Start with Phase F1 (Infrastructure)
- Create database migration
- Create base services
- Estimated time: 2-3 hours for foundation

**Option 2: Test HL7 First**
- Run comprehensive HL7 tests
- Deploy HL7 to production
- Then return to FHIR later

**Option 3: Hybrid Approach**
- Deploy HL7 now (production-ready)
- Implement FHIR in parallel/next sprint
- Full interoperability in 1-2 weeks

**Recommendation**: Given HL7 is complete and production-ready, I recommend **Option 3** - deploy HL7 now and implement FHIR as Phase 2 for future-proofing.

---

**Document Version**: 1.0
**Last Updated**: November 26, 2025
**Status**: Ready for Implementation
