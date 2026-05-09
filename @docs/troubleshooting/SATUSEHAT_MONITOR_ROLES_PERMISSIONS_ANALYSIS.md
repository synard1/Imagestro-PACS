# Analisis Roles & Permissions - SatuSehat Monitor Check
## URL: http://localhost:5173/satusehat-monitorcek

---

## 📋 Ringkasan Fitur

Halaman **SatuSehat Monitor Check** adalah dashboard untuk monitoring integrasi order ke SatuSehat dengan fitur:
- Melihat daftar order dengan status sinkronisasi ke SatuSehat
- Memeriksa kesiapan order untuk dikirim ke SatuSehat
- Mengelola referensi SatuSehat (Encounter ID, ServiceRequest ID)
- Mengirim order ke SatuSehat Router
- Melihat detail respons dan status kesehatan integrasi

---

## 🔐 Permissions yang Diperlukan

### 1. **satusehat.monitor.view** ⭐ (WAJIB)
- **Deskripsi**: Melihat halaman SatuSehat Monitor
- **Kategori**: satusehat
- **Akses**: Membaca daftar order dengan status SatuSehat
- **Fitur yang memerlukan**:
  - Akses ke halaman `/satusehat-monitorcek`
  - Melihat tabel order dengan kolom sync status
  - Melihat health status SatuSehat

### 2. **satusehat.order.readiness** ⭐ (WAJIB)
- **Deskripsi**: Memeriksa kesiapan order untuk SatuSehat
- **Kategori**: satusehat
- **Akses**: Endpoint `/orders/{id}/satusehat-readiness`
- **Fitur yang memerlukan**:
  - Tombol "Check Validation" (RefreshCw icon)
  - Modal untuk melihat detail kesiapan order
  - Validasi field yang diperlukan sebelum sync

### 3. **satusehat.encounter.manage** ⭐ (PENTING)
- **Deskripsi**: Mengelola Encounter ID untuk order
- **Kategori**: satusehat
- **Akses**: 
  - POST `/orders/{id}/simrs-encounter` - Request encounter dari SIMRS
  - PUT `/orders/{id}/satusehat-refs` - Inject manual Encounter ID
- **Fitur yang memerlukan**:
  - Modal "Encounter Management"
  - Tombol untuk request encounter dari SIMRS
  - Input field untuk manual Encounter ID injection
  - Validasi format `Encounter/{id}`

### 4. **satusehat.servicerequest.manage** ⭐ (PENTING)
- **Deskripsi**: Mengelola ServiceRequest ID untuk order
- **Kategori**: satusehat
- **Akses**:
  - POST `/orders/{id}/request-servicerequest-from-simrs` - Request ServiceRequest
  - PUT `/orders/{id}/satusehat-refs` - Inject manual ServiceRequest ID
- **Fitur yang memerlukan**:
  - Modal "ServiceRequest Management"
  - Tombol untuk request ServiceRequest dari SIMRS
  - Input field untuk manual ServiceRequest ID injection
  - Validasi format `ServiceRequest/{id}`

### 5. **satusehat.order.send** ⭐ (KRITIS)
- **Deskripsi**: Mengirim order ke SatuSehat Router
- **Kategori**: satusehat
- **Akses**: Endpoint untuk mengirim order ke router
- **Fitur yang memerlukan**:
  - Tombol "Send to SatuSehat" (Send icon - hijau)
  - Hanya aktif jika order ready_to_sync = true
  - Mengirim payload dengan study_uid, accession_number, patient_id

### 6. **order.view** (EXISTING)
- **Deskripsi**: Melihat detail order
- **Kategori**: order
- **Akses**: Membaca data order
- **Fitur yang memerlukan**:
  - Melihat kolom order (order_number, accession_number, patient_name, modality, status)
  - Melihat imaging_study_id
  - Melihat created_at timestamp

### 7. **satusehat.health.check** (OPSIONAL)
- **Deskripsi**: Memeriksa kesehatan integrasi SatuSehat
- **Kategori**: satusehat
- **Akses**: Endpoint health check
- **Fitur yang memerlukan**:
  - Menampilkan status kesehatan SatuSehat
  - Menampilkan response time
  - Menampilkan error details jika ada

---

## 👥 Roles yang Direkomendasikan

### 1. **SATUSEHAT_ADMIN** (Baru)
**Deskripsi**: Administrator untuk integrasi SatuSehat
**Permissions**:
- ✅ satusehat.monitor.view
- ✅ satusehat.order.readiness
- ✅ satusehat.encounter.manage
- ✅ satusehat.servicerequest.manage
- ✅ satusehat.order.send
- ✅ order.view
- ✅ satusehat.health.check

**Use Case**: 
- Tim IT/Integration yang mengelola sinkronisasi SatuSehat
- Troubleshooting integrasi
- Mengelola referensi order

---

### 2. **SATUSEHAT_OPERATOR** (Baru)
**Deskripsi**: Operator untuk monitoring dan pengiriman order ke SatuSehat
**Permissions**:
- ✅ satusehat.monitor.view
- ✅ satusehat.order.readiness
- ✅ satusehat.encounter.manage
- ✅ satusehat.servicerequest.manage
- ✅ satusehat.order.send
- ✅ order.view
- ❌ satusehat.health.check (tidak perlu)

**Use Case**:
- Operator yang mengirim order ke SatuSehat
- Mengelola referensi encounter dan service request
- Monitoring status sinkronisasi

---

### 3. **SATUSEHAT_VIEWER** (Baru)
**Deskripsi**: Viewer untuk monitoring SatuSehat (read-only)
**Permissions**:
- ✅ satusehat.monitor.view
- ✅ satusehat.order.readiness
- ✅ order.view
- ❌ satusehat.encounter.manage
- ❌ satusehat.servicerequest.manage
- ❌ satusehat.order.send
- ❌ satusehat.health.check

**Use Case**:
- Supervisor/Manager untuk monitoring
- Melihat status sinkronisasi tanpa bisa mengubah

---

### 4. **TECHNOLOGIST** (Existing - Update)
**Deskripsi**: Radiology technologist
**Permissions** (tambahan):
- ✅ satusehat.monitor.view (baru)
- ✅ satusehat.order.readiness (baru)
- ✅ order.view (existing)

**Use Case**:
- Melihat status order di SatuSehat Monitor
- Memeriksa kesiapan order

---

## 📊 Permission Matrix

| Permission | SATUSEHAT_ADMIN | SATUSEHAT_OPERATOR | SATUSEHAT_VIEWER | TECHNOLOGIST | ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|
| satusehat.monitor.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| satusehat.order.readiness | ✅ | ✅ | ✅ | ✅ | ✅ |
| satusehat.encounter.manage | ✅ | ✅ | ❌ | ❌ | ✅ |
| satusehat.servicerequest.manage | ✅ | ✅ | ❌ | ❌ | ✅ |
| satusehat.order.send | ✅ | ✅ | ❌ | ❌ | ✅ |
| order.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| satusehat.health.check | ✅ | ❌ | ❌ | ❌ | ✅ |

---

## 🎯 Fitur & Permission Mapping

### Halaman Utama
- **Akses halaman**: `satusehat.monitor.view`
- **Refresh data**: `satusehat.monitor.view`
- **Search & Filter**: `satusehat.monitor.view`

### Tabel Order
| Kolom | Permission |
|---|---|
| Order Number | order.view |
| Accession Number | order.view |
| Patient Name | order.view |
| Modality | order.view |
| Status | order.view |
| Sync Status | satusehat.monitor.view |
| Study ID | order.view |
| Created Date | order.view |

### Tombol Aksi
| Tombol | Permission | Kondisi |
|---|---|---|
| Check Validation | satusehat.order.readiness | Selalu aktif |
| Send to SatuSehat | satusehat.order.send | Hanya jika ready_to_sync = true |
| View Details | order.view | Selalu aktif |

### Modal Encounter Management
| Aksi | Permission |
|---|---|
| Buka modal | satusehat.encounter.manage |
| Request dari SIMRS | satusehat.encounter.manage |
| Inject manual ID | satusehat.encounter.manage |
| View Readiness | satusehat.order.readiness |

### Modal ServiceRequest Management
| Aksi | Permission |
|---|---|
| Buka modal | satusehat.servicerequest.manage |
| Request dari SIMRS | satusehat.servicerequest.manage |
| Inject manual ID | satusehat.servicerequest.manage |
| View Readiness | satusehat.order.readiness |

### Health Status Display
| Elemen | Permission |
|---|---|
| Health status badge | satusehat.health.check |
| Response time | satusehat.health.check |
| Error details | satusehat.health.check |

---

## 🔧 Implementasi di Frontend

### 1. Route Protection
```javascript
// Di App.jsx atau routing config
{
  path: '/satusehat-monitorcek',
  element: <ProtectedRoute permission="satusehat.monitor.view"><SatusehatMonitor /></ProtectedRoute>
}
```

### 2. Conditional Rendering
```javascript
// Tombol Send to SatuSehat
{canAccess('satusehat.order.send') && !order.satusehat_synced && (
  <button onClick={() => sendToSatusehat(order)}>
    <Send size={14} />
  </button>
)}

// Modal Encounter
{canAccess('satusehat.encounter.manage') && (
  <button onClick={() => openEncounterModal(order)}>
    Manage Encounter
  </button>
)}

// Health Status
{canAccess('satusehat.health.check') && healthStatus && (
  <div className="health-status-badge">
    {healthStatus.status}
  </div>
)}
```

### 3. API Call Protection
```javascript
// Sebelum memanggil API
if (!canAccess('satusehat.order.send')) {
  throw new Error('Anda tidak memiliki akses untuk mengirim order ke SatuSehat');
}

const result = await satusehatService.sendToRouter(payload);
```

---

## 📝 Struktur Permission di Database

```sql
-- Permissions untuk SatuSehat Monitor
INSERT INTO permissions (name, description, category) VALUES
('satusehat.monitor.view', 'View SatuSehat Monitor', 'satusehat'),
('satusehat.order.readiness', 'Check order readiness for SatuSehat', 'satusehat'),
('satusehat.encounter.manage', 'Manage Encounter references', 'satusehat'),
('satusehat.servicerequest.manage', 'Manage ServiceRequest references', 'satusehat'),
('satusehat.order.send', 'Send orders to SatuSehat Router', 'satusehat'),
('satusehat.health.check', 'Check SatuSehat integration health', 'satusehat');

-- Roles untuk SatuSehat
INSERT INTO roles (name, description) VALUES
('SATUSEHAT_ADMIN', 'SatuSehat Administrator'),
('SATUSEHAT_OPERATOR', 'SatuSehat Operator'),
('SATUSEHAT_VIEWER', 'SatuSehat Viewer');

-- Assign permissions to roles
INSERT INTO role_permissions (role_id, permission_id) VALUES
-- SATUSEHAT_ADMIN (semua permissions)
((SELECT id FROM roles WHERE name='SATUSEHAT_ADMIN'), (SELECT id FROM permissions WHERE name='satusehat.monitor.view')),
((SELECT id FROM roles WHERE name='SATUSEHAT_ADMIN'), (SELECT id FROM permissions WHERE name='satusehat.order.readiness')),
((SELECT id FROM roles WHERE name='SATUSEHAT_ADMIN'), (SELECT id FROM permissions WHERE name='satusehat.encounter.manage')),
((SELECT id FROM roles WHERE name='SATUSEHAT_ADMIN'), (SELECT id FROM permissions WHERE name='satusehat.servicerequest.manage')),
((SELECT id FROM roles WHERE name='SATUSEHAT_ADMIN'), (SELECT id FROM permissions WHERE name='satusehat.order.send')),
((SELECT id FROM roles WHERE name='SATUSEHAT_ADMIN'), (SELECT id FROM permissions WHERE name='satusehat.health.check')),

-- SATUSEHAT_OPERATOR (tanpa health check)
((SELECT id FROM roles WHERE name='SATUSEHAT_OPERATOR'), (SELECT id FROM permissions WHERE name='satusehat.monitor.view')),
((SELECT id FROM roles WHERE name='SATUSEHAT_OPERATOR'), (SELECT id FROM permissions WHERE name='satusehat.order.readiness')),
((SELECT id FROM roles WHERE name='SATUSEHAT_OPERATOR'), (SELECT id FROM permissions WHERE name='satusehat.encounter.manage')),
((SELECT id FROM roles WHERE name='SATUSEHAT_OPERATOR'), (SELECT id FROM permissions WHERE name='satusehat.servicerequest.manage')),
((SELECT id FROM roles WHERE name='SATUSEHAT_OPERATOR'), (SELECT id FROM permissions WHERE name='satusehat.order.send')),

-- SATUSEHAT_VIEWER (read-only)
((SELECT id FROM roles WHERE name='SATUSEHAT_VIEWER'), (SELECT id FROM permissions WHERE name='satusehat.monitor.view')),
((SELECT id FROM roles WHERE name='SATUSEHAT_VIEWER'), (SELECT id FROM permissions WHERE name='satusehat.order.readiness'));
```

---

## 🚀 Checklist Implementasi

- [ ] Buat 6 permissions baru di database
- [ ] Buat 3 roles baru (SATUSEHAT_ADMIN, SATUSEHAT_OPERATOR, SATUSEHAT_VIEWER)
- [ ] Assign permissions ke roles
- [ ] Update TECHNOLOGIST role dengan satusehat.monitor.view dan satusehat.order.readiness
- [ ] Implementasi permission checks di SatusehatMonitorClean.jsx
- [ ] Implementasi route protection untuk /satusehat-monitorcek
- [ ] Tambahkan permission checks untuk setiap tombol aksi
- [ ] Tambahkan permission checks untuk setiap modal
- [ ] Test dengan berbagai role combinations
- [ ] Update dokumentasi user untuk role assignments

---

## 📌 Catatan Penting

1. **Granularity**: Permissions dibuat granular untuk kontrol akses yang lebih baik
2. **Backward Compatibility**: Existing permissions (order.view) tetap digunakan
3. **Audit Trail**: Semua aksi (send, inject, request) harus di-log untuk audit
4. **Error Handling**: Jika user tidak punya permission, tampilkan pesan yang jelas
5. **Default Access**: Hanya ADMIN dan SATUSEHAT_ADMIN yang punya akses penuh
6. **Monitoring**: Pertimbangkan untuk membuat SATUSEHAT_VIEWER untuk supervisor

