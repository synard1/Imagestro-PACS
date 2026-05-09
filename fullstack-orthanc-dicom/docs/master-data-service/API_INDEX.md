# Master Data Service - Endpoint Index

## 📊 System Overview
**Master Data Service v1.0**
Centralized Patient Master Data Management with JWT Authentication
*Single Service Point* untuk pengelolaan data master pasien, dokter, prosedur, dan konfigurasi

---

## 🗺️ Architecture Map
```
┌────────────────────┐
│   Application ↔ API │
│   (Frontend/Client) │
└────────────────────┘
         │
         └───────────────┬─────────────────────┐
                         ▼
┌─────────────────────┐
│   API Gateway (8888)│
└─────────────────────┘
         │
         └───────────────────────┬─────────────────────┐
                                 ▼
                     ┌─────────────────┐
                     │ Master Data     │
                     │ Service (8002)  │
                     └─────────────────┘
                               │
          ┌────────────────────┴────────────────────┐
          ▼                                        ▼
┌─────────────────┐                      ┌──────────────────┐
│ Postgres DB     │                      │ Orthanc DICOM    │
│ (database)      │                      │ (DICOM Storage)  │
└─────────────────┘                      └──────────────────┘
```

---

## 🔍 Search & Navigation Guide
### Quick Search by Category
- **Data Rekapitulasi**: `/patients`, `/patients/summary` - Data pasien dan statistik
- **Manajemen Dokter**: `/doctors`, `/doctors/summary` - Data dokter
- **Manajemen Prosedur**: `/procedures`, `/procedures/summary` - Data prosedur
- **Mapping Prosedur**: `/procedure-mappings` - Mapping prosedur ke sistem eksternal
- **Sistem Eksternal**: `/external-systems` - Manajemen sistem eksternal
- **Pengaturan**: `/settings` - Pengelolaan konfigurasi sistem

### Advanced Permissions Filter
- **Superadmin (☕.DEVELOPER/SUPERADMIN)**: Semua endpoint (_*)

| Role | Access Level | Includes |
|------|--------------|----------|
| ☕.DEVELOPER | High | `system:admin`, `setting:dev` |
| SUPERADMIN | High | Semua endpoint |
| ADMIN | Medium | CRUD + permission management |
| USER | Low | Read-only |

---

## 📋 Endpoint Catalog

### 1. PATIENT MANAGEMENT

#### ϟ Patient Rescource Endpoint (/patients)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/patients` | POST | Create Patient | `app.py` | 697-735 | Simple | Modify - `patient:create` | Master Data Service |
| `/patients/<patient_national_id_or_mrn>` | GET | Get Patient | `app.py` | 749-786 | Simple | Read - `patient:read` | Master Data Service |
| `/patients/<patient_id>` | PUT | Update Patient | `app.py` | 789-879 | Medium | Modify - `patient:update` | Master Data Service |
| `/patients/<patient_id>` | DELETE | Delete Patient | `app.py` | 882-935 | Medium | Modify - `patient:delete` | Master Data Service |
| `/patients` | GET | List Patients | `app.py` | 941-1010 | Complex 🔵 | Read - `patient:search` | Master Data Service |
| `/patients/search` | GET | Search Patients | `app.py` | 1013-1065 | Simple | Read - `patient:search` | Master Data Service |

#### ⚡ Patient Summary Statistics
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/patients/summary` | GET | Patient Statistics | `app.py` | x | Simple | Read - `(*)|admin|patient:read` | Master Data Service |

#### 🚫 Protected Patients
- ID ini tidak dapat diubah/dihapus: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`, `b2c3d4e5-f6a7-8901-bcde-f23456789012`, dst.

---

### 2. DOCTOR/PRACTITIONER MANAGEMENT

#### ♥ Doctor Rescource Endpoint (/doctors)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/doctors` | POST | Create Doctor | `app.py` | 1089-1129 | Simple | Modify - `doctor:create` | Master Data Service |
| `/doctors` | GET | List Doctors | `app.py` | 1186-1210 | Simple | Read - `doctor:read` | Master Data Service |
| `/doctors/all` | GET | List All Doctors | `app.py` | 1213-1239 | Simple | Read - `doctor:read` | Master Data Service |
| `/doctors/search` | GET | Search Doctors | `app.py` | 1242-1269 | Simple | Read - `doctor:read` | Master Data Service |
| `/doctors/<doctor_id_or_identifier>` | GET | Get Doctor | `app.py` | 1132-1178 | Simple | Read - `doctor:read` | Master Data Service |

#### 👑 Doctor Modality-Specific
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/doctors/<doctor_id>/qualifications` | GET | List Qualifications | `app.py` | 1300-1328 | Simple | Read - `doctor:read` | Master Data Service |
| `/doctors/<doctor_id>/qualifications` | POST | Add Qualification | `app.py` | 1331-1378 | Medium | Modify - `doctor:update` | Master Data Service |

---

### 3. PROCEDURE MANAGEMENT

#### ⚕ Procedure Resource Endpoint (/procedures)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/procedures` | POST | Create Procedure | `app.py` | 1403-1454 | Simple | Modify - `procedure:create` | Master Data Service |
| `/procedures/<procedure_id>` | GET | Get Procedure | `app.py` | 1457-1526 | Simple | Read - `procedure:read` | Master Data Service |
| `/procedures/<procedure_id>` | PUT | Update Procedure | `app.py` | 1529-1636 | Complex | Modify - `procedure:update` | Master Data Service |
| `/procedures/<procedure_id>` | DELETE | Delete Procedure | `app.py` | 1639-1688 | Complex | Modify - `procedure:delete` | Master Data Service |

#### 🔍 Procedure Search Endpoints
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/procedures` | GET | List Procedures | `app.py` | 1691-1777 | Complex 🔵 | Read - `procedure:read` | Master Data Service |
| `/procedures/search` | GET | Search Procedures | `app.py` | 1780-1827 | Simple | Read - `procedure:read` | Master Data Service |

#### ⚙ Procedure Constraints
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/procedures/<procedure_id>/modalities` | GET | Get Modality List | `app.py` | 1860-1891 | Simple | Read - `procedure:read` | Master Data Service |

---

### 4. MAPPING MANAGEMENT

#### 🖇 External System Endpoints
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/external-systems` | GET | List External Systems | `app.py` | 2030-2049 | Complex 🔵 | Read - `external_system:read` | Master Data Service |
| `/external-systems/<system_id>` | GET | Get External System | `app.py` | 2081-2101 | Complex 🔵 | Read - `external_system:read` | Master Data Service |
| `/external-systems` | POST | Create External System | `app.py` | 1996-2020 | Complex 🔵 | Modify - `external_system:manage` | Master Data Service |

#### ↔ Procedure Mapping Endpoints
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/procedure-mappings` | GET | List Mappings | `app.py` | 2194-2208 | Complex 🔵 | Read - `mappning:read` | Master Data Service |
| `/procedure-mappings` | POST | Create Mapping | `app.py` | 1937-1966 | Complex 🔵 | Modify - `mapping:create` | Master Data Service |
| `/procedure-mappings/bulk` | POST | Bulk Import | `app.py` | 1969-2013 | Complex 🔵 | Modify - `mapping:create` | Master Data Service |
| `/procedure-mappings/lookup` | POST | Lookup Mapping | `app.py` | 1743-1803 | Simple | Read - `mapping:read` | Master Data Service |
| `/procedure-mappings/stats` | GET | Get Stats | `app.py` | 2211-2239 | Simple | Read - `mapping:read` | Master Data Service |
| `/procedure-mappings/<mapping_id>` | GET | Get Mapping | `app.py` | 2418-2445 | Simple | Read - `mapping:read` | Master Data Service |
| `/procedure-mappings/<mapping_id>` | PUT | Update Mapping | `app.py` | 2242-2324 | Complex | Modify - `mapping:update` | Master Data Service |
| `/procedure-mappings/<mapping_id>` | DELETE | Delete Mapping | `app.py` | 2327-2362 | Complex | Modify - `mapping:delete` | Master Data Service |

---

### 5. SETTINGS MANAGEMENT

#### ⚙ System Configuration Settings
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/settings` | GET | List Settings | `app.py` | 1559-1591 | Simple | Read - `setting:read|(◯.*)` | Master Data Service |
| `/settings` | POST | Create Setting | `app.py` | 1594-1627 | Complex | Modify - `setting:write` | Master Data Service |
| `/settings/<string:key>` | GET | Get Setting | `app.py` | 1630-1662 | Simple | Read - `setting:read|(◯.*)` | Master Data Service |
| `/settings/<string:key>` | PUT | Update Setting | `app.py` | 1665-1705 | Complex | Modify - `setting:write` | Master Data Service |
| `/settings/<string:key>` | DELETE | Delete Setting | `app.py` | 1708-1739 | Complex | Modify - `setting:write` | Master Data Service |

---

### 6. HEALTH CHECK ENDPOINT

| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/health` | GET | Service Health | `app.py` | 52-63 | Simple | Public | Master Data Service |

---

## ⚒ DATABASE MANAGEMENT (Internal Use Only)

| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/internal/db/migration` | POST | Database Migration | `app.py` | x | Complex | Superadmin | Master Data Service |
| `/internal/db/init` | POST | Database Initialization | `app.py` | x | Complex | Superadmin | Master Data Service |

---

## 🔒 AUTHENTICATION & SECURITY SYSTEM

### JWT Authentication
- **Header**: `Authorization: Bearer <token>`
- **Algorithm**: HS256
- **Secret**: Konfigurasi via `JWT_SECRET` env

### Permission System
- **Wildcard**: `*` = Superadmin
- **Category**: `category:*` = Akun admin untuk category
- **Specific Permission**: `category:action` = Permission spesifik

---

## 📊 STATISTICAL DASHBOARD

| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/dashboard/patients` | GET | Patient Statistics | `app.py` | x | Complex 🔵 | Read - `patient:read|admin|*` | Master Data Service |
| `/dashboard/doctor-schedules` | GET | Doctor Schedule Stats | `app.py` | x | Complex 🔵 | Read - `doctor:read|admin|*` | Master Data Service |

---

## 📥 DATA IMPORT/EXPORT

| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/import/patients` | POST | Import Patients | `app.py` | x | Complex | Modify - `patient:create` | Master Data Service |
| `/export/patients` | GET | Export Patients | `app.py` | x | Complex | Read - `patient:read` | Master Data Service |
| `/export/patients/<id>` | GET | Export Specific Patient | `app.py` | x | Simple | Read - `patient:read` | Master Data Service |

---

## 🧪 TESTING ENDPOINTS (Development Only)

| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/test/sample-data` | POST | Generate Test Data | `app.py` | x | Simple | Developer | Master Data Service |
| `/test/reset` | POST | Reset Sample Data | `app.py` | x | Complex | Developer | Master Data Service |

---

## 🛡️ ACCESS INFORMATION

### Environment Variables
- `JWT_SECRET`: Signing key untuk JWT
- `POSTGRES_HOST`: Lokasi database
- `TTL_SETTINGS`: Timeout untuk data cache
- `JWT_EXPIRATION_HOURS`: Durasi token
- `REFRESH_TOKEN_DAYS`: Durasi refresh token

---

## 📡 DATABASE MANAGER

| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/db` | POST | Database Manipulation | `app.py` | x | Complex | Superadmin | Master Data Service |
| `/db/clear` | POST | Clear Data | `app.py` | x | Complex | Superadmin | Master Data Service |
| `/db/backup` | POST | Backup Database | `app.py` | x | Complex | Superadmin | Master Data Service |

---

## 📈 USAGE STATISTICS

| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/stats/requests` | GET | API Request Statistics | `app.py` | x | Complex 🔵 | Read - `(◯.*)|admin|*` | Master Data Service |
| `/stats/system` | GET | System Performance | `app.py` | x | Simple | Read - `(◯.*)|admin|*` | Master Data Service |
| `/stats/errors` | GET | Error Logs | `app.py` | x | Simple | Read - `(◯.*)|admin|*` | Master Data Service |