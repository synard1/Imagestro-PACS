# Order Management Refactoring Summary

## Overview

Refactoring dilakukan untuk memastikan struktur data order sesuai dengan format dari backend API `http://103.42.117.19:8888/orders`.

## Tanggal Refactoring
**2025-11-09**

---

## Perubahan Yang Dilakukan

### 1. **orderService.js** - Data Normalization

#### Updated `normalizeOrder()` function

Menambahkan dokumentasi lengkap struktur data backend dan mapping field yang lebih akurat:

**Backend API Structure:**
```json
{
  "id": "uuid",
  "order_number": "ORD2025110700005",
  "accession_number": "2025110600003.001",
  "patient_name": "Ardianto Putra",
  "patient_national_id": "9271060312000001",
  "medical_record_number": "MRN001234",
  "registration_number": "REG20251106001",
  "modality": "CT",
  "procedure_code": "LP23456-7",
  "procedure_name": "CT Head with Contrast",
  "scheduled_at": "Fri, 07 Nov 2025 09:00:00 GMT",
  "status": "CREATED",
  "order_status": "CREATED",
  "worklist_status": null,
  "satusehat_synced": false,
  "created_at": "Thu, 06 Nov 2025 19:18:11 GMT"
}
```

**Field Mapping (Backend → UI):**

| Backend Field | UI Field | Keterangan |
|---------------|----------|------------|
| `accession_number` | `accession_no` | Nomor akses order |
| `patient_national_id` | `patient_id` | NIK pasien |
| `patient_national_id` | `patient_ihs` | IHS number (sama dengan NIK) |
| `medical_record_number` | `mrn` | Medical Record Number |
| `registration_number` | `registration_number` | Nomor registrasi |
| `procedure_code` | `procedure_code` | Kode prosedur |
| `procedure_name` | `requested_procedure` | Nama prosedur yang diminta |
| `procedure_name` | `procedure_name` | Nama prosedur (field asli) |
| `scheduled_at` | `scheduled_start_at` | Waktu jadwal (GMT → Local time) |
| `order_status` | `order_status` | Status order backend |
| `status` | `status` | Status order UI |
| `worklist_status` | `worklist_status` | Status worklist |
| `satusehat_synced` | `satusehat_synced` | Flag sync SatuSehat |

**Normalization Logic:**
- Date conversion: GMT string → ISO format → Local display format
- Field aliasing untuk backward compatibility
- Preserve original data dengan spread operator

### 2. **Orders.jsx** - UI Display Refactoring

#### Updated Table Structure

**Before:**
```jsx
<th>Accession</th>
<th>Patient</th>
<th>Modality</th>
<th>Requested Procedure</th>
<th>Scheduled</th>
<th>Status</th>
```

**After:**
```jsx
<th>Order Number</th>
<th>Accession</th>
<th>Patient</th>
<th>Modality</th>
<th>Procedure</th>
<th>Scheduled</th>
<th>Status</th>
<th>Sync</th>
<th>📎</th>
<th>Actions</th>
```

#### New Display Features

1. **Order Number Column**
   - Display `order_number` prominently
   - Show OFFLINE badge untuk offline orders

2. **Enhanced Patient Info**
   ```jsx
   <div className="font-medium">{r.patient_name}</div>
   <div className="text-xs text-slate-500">
     {r.mrn && <span>MRN: {r.mrn}</span>}
     {r.patient_id && <span>NIK: {r.patient_id}</span>}
   </div>
   ```

3. **Procedure Details**
   - Show procedure name dan procedure code
   - Display warning jika procedure belum diisi

4. **SatuSehat Sync Status**
   - Green badge dengan checkmark untuk synced
   - Grey badge untuk not synced
   ```jsx
   {r.satusehat_synced ? (
     <div className="bg-green-100 text-green-700">
       ✓ Synced
     </div>
   ) : (
     <div className="bg-slate-100 text-slate-500">
       ✗ Not synced
     </div>
   )}
   ```

5. **Worklist Status**
   - Tampil di bawah status order jika ada

6. **Registration Number**
   - Tampil di bawah accession number jika ada

#### Enhanced Search Filter

**Before:**
```javascript
const filtered = rows.filter(r =>
  r.patient_name.toLowerCase().includes(q.toLowerCase()) ||
  r.accession_no.includes(q)
)
```

**After:**
```javascript
const filtered = rows.filter(r =>
  r.patient_name?.toLowerCase().includes(q.toLowerCase()) ||
  r.accession_no?.toLowerCase().includes(q.toLowerCase()) ||
  r.order_number?.toLowerCase().includes(q.toLowerCase()) ||
  r.patient_id?.toLowerCase().includes(q.toLowerCase()) ||
  r.mrn?.toLowerCase().includes(q.toLowerCase())
)
```

**Search Now Supports:**
- Patient Name
- NIK (Patient National ID)
- MRN (Medical Record Number)
- Order Number
- Accession Number

#### Updated Search Placeholder
```jsx
<input
  placeholder="Search: Patient Name / NIK / MRN / Order# / Accession#"
  className="w-80"
/>
```

### 3. **Documentation Updates**

#### ORDER_CRUD_IMPLEMENTATION.md

Updated dengan:
- Struktur data backend yang akurat
- Field mapping lengkap
- Contoh response dari backend API real
- Data normalization flow

---

## Backend API Response Structure

### GET /orders

**Response Format:**
```json
{
  "status": "success",
  "count": 9,
  "total": 9,
  "limit": 100,
  "offset": 0,
  "orders": [...]
}
```

**Order Object Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique order ID |
| `order_number` | String | Yes | Order number (ORD...) |
| `accession_number` | String | Yes | Accession number |
| `patient_name` | String | Yes | Nama pasien |
| `patient_national_id` | String | No | NIK pasien |
| `medical_record_number` | String | No | MRN pasien |
| `registration_number` | String | No | No. registrasi |
| `modality` | String | Yes | CT, MRI, XR, dll |
| `procedure_code` | String | No | Kode prosedur (LOINC) |
| `procedure_name` | String | Yes | Nama prosedur |
| `scheduled_at` | DateTime | No | Jadwal pemeriksaan |
| `status` | String | Yes | Status order |
| `order_status` | String | Yes | Status order backend |
| `worklist_status` | String | No | Status worklist |
| `satusehat_synced` | Boolean | Yes | Flag sync SatuSehat |
| `created_at` | DateTime | Yes | Waktu pembuatan |

---

## Testing Guide

### 1. Verify Data Display

Buka `/orders` dan verify:
- ✅ Order Number tampil di kolom pertama
- ✅ NIK dan MRN tampil di info patient
- ✅ Procedure code tampil jika ada
- ✅ Registration number tampil jika ada
- ✅ SatuSehat sync status tampil dengan badge warna
- ✅ Worklist status tampil jika ada

### 2. Test Search Functionality

Test search dengan:
- ✅ Patient name: "Ardianto"
- ✅ NIK: "9271060312000001"
- ✅ MRN: "MRN001234"
- ✅ Order number: "ORD2025110700005"
- ✅ Accession: "2025110600003.001"

Semua harus return hasil yang benar.

### 3. Verify Data Normalization

```javascript
// Di browser console
const orders = await orderService.listOrders();
console.log('First order:', orders[0]);

// Verify fields:
// - accession_no (normalized dari accession_number)
// - patient_id (normalized dari patient_national_id)
// - mrn (normalized dari medical_record_number)
// - requested_procedure (normalized dari procedure_name)
// - scheduled_start_at (normalized dari scheduled_at)
```

### 4. Check Backend Response Format

```bash
# Test dengan Postman atau curl
curl -X GET "http://103.42.117.19:8888/orders" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Verify response structure matches documentation
```

---

## Breaking Changes

### ⚠️ Field Name Changes

Jika ada komponen lain yang menggunakan order data, pastikan update field names:

| Old Field | New Field | Action Required |
|-----------|-----------|-----------------|
| N/A | `order_number` | Add support untuk display |
| N/A | `mrn` | Add support untuk display |
| N/A | `procedure_code` | Add support untuk display |
| N/A | `registration_number` | Add support untuk display |
| N/A | `order_status` | Add support (terpisah dari `status`) |
| N/A | `worklist_status` | Add support untuk display |
| N/A | `satusehat_synced` | Add support untuk display |

### ✅ Backward Compatible Fields

Fields ini tetap ada dan backward compatible:
- `accession_no` (alias `accession_number`)
- `patient_id` (alias `patient_national_id`)
- `patient_name`
- `modality`
- `requested_procedure` (alias `procedure_name`)
- `scheduled_start_at` (alias `scheduled_at`)
- `status`

---

## Next Steps

1. **Test dengan Backend Real**
   - Verify semua fields tampil dengan benar
   - Test search functionality
   - Verify sync status indicator

2. **Update OrderForm.jsx**
   - Add support untuk `order_number` di form edit
   - Add support untuk `procedure_code` input
   - Add display untuk `registration_number`

3. **Update Other Components**
   - Check components yang menggunakan order data
   - Update field references jika perlu
   - Add support untuk new fields

4. **Performance Optimization**
   - Add pagination untuk large datasets
   - Implement virtual scrolling untuk table
   - Cache order list untuk faster loading

---

## Files Modified

### Created:
- `ORDER_REFACTORING_SUMMARY.md` (this file)

### Modified:
- `src/services/orderService.js` - Enhanced normalization
- `src/pages/Orders.jsx` - Updated UI display
- `ORDER_CRUD_IMPLEMENTATION.md` - Updated documentation

### Not Modified:
- `src/pages/OrderForm.jsx` - Form masih compatible
- `src/components/OrderActionButtons.jsx` - Still compatible
- `src/components/StatusBadge.jsx` - Still compatible

---

## Contacts & Support

Untuk issue atau pertanyaan:
1. Check browser console untuk error messages
2. Verify backend API response structure
3. Review data normalization di orderService.js
4. Check field mapping table di atas

---

**Refactored by:** Claude AI Assistant
**Date:** 2025-11-09
**Version:** 2.0
**Status:** ✅ Complete
