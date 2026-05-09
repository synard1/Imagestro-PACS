# Analisis UI Changes - Unified SIMRS Integration

## 📋 Ringkasan Eksekutif

Project **Unified SIMRS Integration** mengkonsolidasikan semua fitur integrasi SIMRS yang tersebar menjadi satu sistem terpusat. Berikut adalah daftar lengkap UI yang berubah, fitur baru, dan cara mengaksesnya.

## 🚀 Status Implementasi (Updated: 2024-12-05)

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Mock Data Infrastructure | ✅ COMPLETE | 100% |
| Phase 2: Frontend UI Components | ✅ COMPLETE | 100% |
| Phase 3: Backend Database & API | ⏳ PENDING | 0% |
| Phase 4: Real Services & Adapters | ⏳ PENDING | 0% |
| Phase 5: Cleanup and Migration | ⏳ PENDING | 0% |

## 📂 Dokumentasi Tambahan

- `development/UNIFIED_SIMRS_UI_VISUAL_GUIDE.md` - Quick navigation guide
- `development/UNIFIED_SIMRS_UI_WIREFRAMES.md` - ASCII wireframes for all UI
- `development/UNIFIED_SIMRS_UI_TESTING_GUIDE.md` - Step-by-step testing guide

---

## 🎯 Perubahan UI Utama

### 1. **Halaman External Systems (Unified)**
**URL:** `/external-systems`

#### Fitur Baru:
- ✅ Unified list semua external systems (SIMRS, HIS, RIS, PACS, LIS, EMR)
- ✅ Filter by type, status, dan search real-time
- ✅ Connection health indicator (green/red/gray)
- ✅ Quick "Test Connection" action button
- ✅ Facility filter untuk multi-tenant support

#### Cara Akses:
```
Menu Navigasi → External Systems
atau
URL: http://localhost:5173/external-systems
```

#### Komponen:
- `ExternalSystemsList.jsx` - List view dengan filter
- `ExternalSystemsDetail.jsx` - Detail view dengan tabs

---

### 2. **Connection Settings Tab**
**Lokasi:** `/external-systems/:id` → Tab "Connection"

#### Fitur:
- ✅ Base URL input dengan validation
- ✅ Auth type dropdown (None, API Key, Basic, Bearer, JWT)
- ✅ Dynamic credential fields berdasarkan auth type
- ✅ Timeout configuration (ms)
- ✅ Health check path input
- ✅ "Test Connection" button dengan loading state
- ✅ Connection result display (success/error dengan details)

#### Cara Akses:
```
1. Buka External Systems page
2. Klik pada external system yang ingin dikonfigurasi
3. Pilih tab "Connection"
4. Isi form dan klik "Test Connection"
```

#### Contoh Konfigurasi:
```
Base URL: http://khanza.hospital.local:8000
Auth Type: API Key
API Key: your-api-key-here
Timeout: 30000 ms
Health Path: /api/health
```

---

### 3. **Unified Mappings Tab**
**Lokasi:** `/external-systems/:id` → Tab "Mappings"

#### Sub-Tabs:

##### 3.1 **Procedure Mappings**
**Fitur:**
- ✅ Table dengan columns: External Code, External Name, PACS Code, PACS Name, Modality
- ✅ Inline add/edit form
- ✅ Delete dengan confirmation
- ✅ Search filter
- ✅ Modality filter
- ✅ Pagination untuk large lists
- ✅ PACS procedure details tooltip
- ✅ Import from JSON button
- ✅ Export to JSON button

**Cara Akses:**
```
1. Buka External Systems page
2. Klik external system
3. Tab "Mappings" → Sub-tab "Procedures"
4. Klik "Add Mapping" untuk tambah baru
5. Isi form dan klik "Save"
```

**Contoh Data:**
```
External Code: 01.01.01
External Name: Foto Thorax PA
PACS Code: CR.CHEST.PA
PACS Name: Chest X-Ray PA
Modality: CR
```

##### 3.2 **Doctor Mappings**
**Fitur:**
- ✅ Table dengan columns: External Code, External Name, PACS Doctor, Auto-Created
- ✅ Inline add/edit form dengan PACS doctor dropdown
- ✅ Delete dengan confirmation
- ✅ Auto-created indicator badge
- ✅ PACS doctor details tooltip

**Cara Akses:**
```
1. Buka External Systems page
2. Klik external system
3. Tab "Mappings" → Sub-tab "Doctors"
4. Klik "Add Mapping" untuk tambah baru
5. Pilih PACS Doctor dari dropdown
6. Klik "Save"
```

**Contoh Data:**
```
External Code: DR001
External Name: Dr. Budi Santoso
PACS Doctor: [Dropdown - select from master data]
Auto-Created: No
```

##### 3.3 **Operator Mappings**
**Fitur:**
- ✅ Table dengan columns: PACS User, External Code, External Name, Status
- ✅ Inline add/edit form dengan PACS user dropdown
- ✅ Delete dengan confirmation
- ✅ Status indicator (Active/Inactive)

**Cara Akses:**
```
1. Buka External Systems page
2. Klik external system
3. Tab "Mappings" → Sub-tab "Operators"
4. Klik "Add Mapping" untuk tambah baru
5. Pilih PACS User dari dropdown
6. Isi external operator code dan name
7. Klik "Save"
```

**Contoh Data:**
```
PACS User: radiologist_01
External Code: OP001
External Name: Radiologist Andi
Status: Active
```

---

### 4. **Order Browser Tab**
**Lokasi:** `/external-systems/:id` → Tab "Order Browser"

#### Fitur:
- ✅ Date range picker (default: today)
- ✅ Search input (order number, patient name, MRN)
- ✅ Order list dengan cards/table view toggle
- ✅ Multi-select checkboxes
- ✅ "Import Selected" button dengan loading state
- ✅ Connection error state handling
- ✅ Import status indicator (Not Imported, Already Imported, Failed)

#### Cara Akses:
```
1. Buka External Systems page
2. Klik external system (SIMRS)
3. Tab "Order Browser"
4. Set date range dan search criteria
5. Klik "Search" untuk fetch orders
6. Select orders yang ingin diimport
7. Klik "Import Selected"
```

#### Order Display:
```
Order Number: ORD-2024-001
Patient Name: Budi Santoso
Patient MRN: 123456
Procedure: Foto Thorax PA
Referring Doctor: Dr. Andi
Request Date/Time: 2024-12-05 10:30
Import Status: Not Imported / Already Imported / Failed
```

---

### 5. **Import History Tab**
**Lokasi:** `/external-systems/:id` → Tab "Import History"

#### Fitur:
- ✅ Date range filter
- ✅ Status filter (All, Success, Failed, Partial)
- ✅ Search (order number, patient name)
- ✅ Table: Timestamp, Order No, Patient, Procedure, Status, Operator, Actions
- ✅ Error message display untuk failed imports (expandable row)
- ✅ "Retry" button untuk failed imports
- ✅ "View Details" modal

#### Cara Akses:
```
1. Buka External Systems page
2. Klik external system
3. Tab "Import History"
4. Filter by date range, status, atau search
5. Klik "View Details" untuk melihat detail import
6. Klik "Retry" untuk re-import failed orders
```

#### Import History Record:
```
Timestamp: 2024-12-05 10:35:22
Order No: ORD-2024-001
Patient: Budi Santoso
Procedure: Foto Thorax PA
Status: Success / Failed / Partial
Operator: radiologist_01
Error: (jika failed)
```

---

### 6. **Audit Log Tab**
**Lokasi:** `/external-systems/:id` → Tab "Audit Log"

#### Fitur:
- ✅ Date range filter
- ✅ User filter dropdown
- ✅ Action type filter (Create, Update, Delete, Import, Sync)
- ✅ Table: Timestamp, User, Action, Entity, Changes
- ✅ Before/after values dalam expandable row

#### Cara Akses:
```
1. Buka External Systems page
2. Klik external system
3. Tab "Audit Log"
4. Filter by date, user, atau action type
5. Klik row untuk expand dan lihat before/after values
```

#### Audit Log Record:
```
Timestamp: 2024-12-05 10:30:00
User: admin_user
Action: Create
Entity: Procedure Mapping
Changes: 
  - External Code: 01.01.01
  - PACS Code: CR.CHEST.PA
```

---

### 7. **Backup & Restore**
**Lokasi:** `/external-systems` → Header buttons

#### Fitur:
- ✅ "Export All" button untuk export semua konfigurasi
- ✅ "Import Config" button untuk import backup file
- ✅ File upload dengan preview
- ✅ Conflict resolution options (Skip, Overwrite, Merge)
- ✅ Import preview dengan changes summary

#### Cara Akses:
```
1. Buka External Systems page
2. Klik "Export All" untuk download backup JSON
3. Klik "Import Config" untuk upload backup
4. Review preview dan pilih conflict resolution
5. Klik "Import" untuk apply changes
```

#### Export File Format:
```json
{
  "externalSystems": [...],
  "procedureMappings": [...],
  "doctorMappings": [...],
  "operatorMappings": [...],
  "exportedAt": "2024-12-05T10:30:00Z",
  "version": "1.0"
}
```

---

## 🗑️ UI yang Dihapus/Dikonsolidasikan

### 1. **SIMRS Integration Tab dari Settings**
**Sebelumnya:** Settings.jsx → Integration → SIMRS Integration
**Sekarang:** Redirect ke `/external-systems`

### 2. **KhanzaIntegration Component**
**Sebelumnya:** Separate component untuk Khanza-specific integration
**Sekarang:** Terintegrasi dalam External Systems dengan provider adapter pattern

### 3. **External Systems Docs Page**
**Sebelumnya:** `/external-systems-docs`
**Sekarang:** Redirect ke `/external-systems`

---

## 📊 Perbandingan Sebelum & Sesudah

| Fitur | Sebelumnya | Sekarang |
|-------|-----------|---------|
| **Lokasi Integrasi SIMRS** | Settings → Integration → SIMRS | `/external-systems` (unified) |
| **Procedure Mapping** | Settings → SIMRS Integration | External Systems → Mappings → Procedures |
| **Doctor Mapping** | Settings → SIMRS Integration | External Systems → Mappings → Doctors |
| **Operator Mapping** | KhanzaIntegration component | External Systems → Mappings → Operators |
| **Order Browser** | KhanzaIntegration component | External Systems → Order Browser |
| **Import History** | KhanzaIntegration component | External Systems → Import History |
| **Audit Trail** | Tidak ada | External Systems → Audit Log |
| **Backup/Restore** | Manual SQL | External Systems → Export/Import |
| **Multi-SIMRS Support** | Khanza only | Khanza, GOS, Generic + extensible |
| **Connection Test** | Basic | Advanced dengan error categorization |

---

## 🔄 Workflow Contoh

### Workflow 1: Setup Integrasi Khanza Baru

```
1. Buka External Systems page (/external-systems)
2. Klik "Add External System"
3. Isi form:
   - Code: KHANZA_MAIN
   - Name: Khanza Main Hospital
   - Type: SIMRS
   - Provider: Khanza
   - Vendor: Khanza
   - Version: 9.0
4. Klik "Save"
5. Klik pada system yang baru dibuat
6. Tab "Connection":
   - Base URL: http://khanza.hospital.local:8000
   - Auth Type: API Key
   - API Key: [masukkan API key]
   - Klik "Test Connection"
7. Tab "Mappings" → "Procedures":
   - Klik "Add Mapping"
   - Isi procedure mapping
   - Klik "Save"
8. Tab "Mappings" → "Doctors":
   - Klik "Add Mapping"
   - Pilih PACS doctor
   - Klik "Save"
9. Tab "Mappings" → "Operators":
   - Klik "Add Mapping"
   - Pilih PACS user
   - Klik "Save"
10. Tab "Order Browser":
    - Set date range
    - Search orders
    - Select dan import
```

### Workflow 2: Import Order dari SIMRS

```
1. Buka External Systems page
2. Klik SIMRS system
3. Tab "Order Browser"
4. Set date range (default: today)
5. Search orders (optional)
6. Klik "Search"
7. Select orders yang ingin diimport
8. Klik "Import Selected"
9. Jika ada patient diff:
   - Review differences
   - Klik "Update PACS Data" atau "Keep PACS Data"
10. Import complete
11. Check Tab "Import History" untuk verify
```

### Workflow 3: Troubleshoot Connection Error

```
1. Buka External Systems page
2. Klik SIMRS system
3. Tab "Connection"
4. Klik "Test Connection"
5. Jika error:
   - Timeout: Check if SIMRS server is running
   - Auth Failed: Verify API Key
   - Server Error: Contact SIMRS administrator
   - Network Error: Check network connectivity
6. Fix issue dan retry
```

---

## 🎨 UI Components Baru

### Frontend Components:
```
src/pages/ExternalSystems/
├── ExternalSystemsList.jsx          # List view dengan filter
├── ExternalSystemsDetail.jsx        # Detail view dengan tabs
├── tabs/
│   ├── ConnectionTab.jsx            # Connection settings
│   ├── MappingsTab.jsx              # Unified mappings
│   ├── OrderBrowserTab.jsx          # Order browser
│   ├── ImportHistoryTab.jsx         # Import history
│   └── AuditLogTab.jsx              # Audit log
├── components/
│   ├── ProcedureMappingTable.jsx    # Procedure mapping CRUD
│   ├── DoctorMappingTable.jsx       # Doctor mapping CRUD
│   ├── OperatorMappingTable.jsx     # Operator mapping CRUD
│   ├── OrderCard.jsx                # Order display
│   ├── PatientDiffDialog.jsx        # Patient data diff
│   └── ImportStatusBadge.jsx        # Import status indicator
└── hooks/
    ├── useExternalSystems.js        # External systems hook
    ├── useConnectionTest.js         # Connection test hook
    ├── useMappings.js               # Mappings hook
    └── useOrderImport.js            # Order import hook
```

---

## 🔐 Permissions & Access Control

### Admin Only:
- ✅ Create/Update/Delete external systems
- ✅ Configure connection settings
- ✅ Manage procedure mappings
- ✅ Manage doctor mappings
- ✅ Manage operator mappings
- ✅ View audit logs
- ✅ Export/Import configurations

### Operator:
- ✅ View external systems list
- ✅ Browse orders (Order Browser)
- ✅ Import orders
- ✅ View import history

---

## 📱 Responsive Design

Semua UI components dirancang responsive untuk:
- ✅ Desktop (1920px+)
- ✅ Tablet (768px - 1024px)
- ✅ Mobile (< 768px)

---

## 🧪 Testing & Mock Mode

### Development Mode:
```
VITE_USE_MOCK_SERVICES=true
```
- Menggunakan mock data untuk development
- Tidak perlu backend SIMRS
- Consistent test data

### Production Mode:
```
VITE_USE_MOCK_SERVICES=false
```
- Menggunakan real backend API
- Fallback ke mock jika backend down

---

## 📝 Summary

| Aspek | Detail |
|-------|--------|
| **Main Page** | `/external-systems` |
| **Tabs** | Connection, Mappings, Order Browser, Import History, Audit Log |
| **Sub-Tabs** | Procedures, Doctors, Operators (dalam Mappings) |
| **Key Features** | Filter, Search, CRUD, Import/Export, Audit Trail |
| **Supported SIMRS** | Khanza, GOS, Generic (extensible) |
| **Multi-Tenant** | Yes (facility-based) |
| **Backup/Restore** | Yes (JSON export/import) |
| **Error Handling** | Advanced dengan categorization |
| **Audit Trail** | Complete dengan before/after values |

---

## 🚀 Next Steps

1. **Phase 1-2**: Mock data infrastructure & UI components (✅ Completed)
2. **Phase 3-4**: Backend services & provider adapters (⏳ Pending)
3. **Phase 5**: Cleanup & migration (⏳ Pending)

## 📝 Cara Melihat Perubahan UI

### Quick Start
```bash
# 1. Install dependencies (jika belum)
npm install

# 2. Start development server
npm run dev

# 3. Buka browser
http://localhost:5173/external-systems
```

### Navigasi UI
1. **External Systems List**: `/external-systems`
   - Lihat semua external systems
   - Filter by type, status, facility
   - Search by code/name
   - Test connection
   - Export/Import configuration

2. **External System Detail**: Klik pada system di list
   - **Connection Tab**: Basic info, facility, connection settings
   - **Mappings Tab**: Procedures, Doctors, Operators
   - **Order Browser Tab**: Browse dan import orders
   - **Import History Tab**: Riwayat import
   - **Audit Log Tab**: Audit trail

### Mock Mode
- UI menggunakan mock data untuk development
- Tidak perlu backend SIMRS
- Data konsisten untuk testing
- Toggle: `VITE_USE_MOCK_SERVICES=true/false`

## 📊 Komponen UI yang Sudah Dibuat

### Pages
- `src/pages/ExternalSystems/index.jsx`
- `src/pages/ExternalSystems/ExternalSystemsList.jsx`
- `src/pages/ExternalSystems/ExternalSystemsDetail.jsx`

### Tabs
- `src/pages/ExternalSystems/tabs/ConnectionTab.jsx`
- `src/pages/ExternalSystems/tabs/MappingsTab.jsx`
- `src/pages/ExternalSystems/tabs/OrderBrowserTab.jsx`
- `src/pages/ExternalSystems/tabs/ImportHistoryTab.jsx`
- `src/pages/ExternalSystems/tabs/AuditLogTab.jsx`

### Components
- `src/pages/ExternalSystems/components/ProcedureMappingTable.jsx`
- `src/pages/ExternalSystems/components/DoctorMappingTable.jsx`
- `src/pages/ExternalSystems/components/OperatorMappingTable.jsx`
- `src/pages/ExternalSystems/components/OrderCard.jsx`
- `src/pages/ExternalSystems/components/ImportStatusBadge.jsx`
- `src/pages/ExternalSystems/components/PatientDiffDialog.jsx`
- `src/pages/ExternalSystems/components/ImportConfigDialog.jsx`

### Mock Services
- `src/services/mock/mockData.js`
- `src/services/mock/mockExternalSystemsService.js`
- `src/services/mock/mockMappingService.js`
- `src/services/mock/mockImportService.js`

### Hooks
- `src/hooks/useServiceMode.jsx`

