# Order Display Fix - Procedure & Scheduled Columns

## Problem

Kolom **Procedure** dan **Scheduled** di tabel Orders tidak menampilkan data meskipun backend API mengembalikan data yang lengkap:

```json
{
  "procedure_name": "CT Head with Contrast",
  "procedure_code": "LP23456-7",
  "scheduled_at": "Fri, 07 Nov 2025 09:00:00 GMT"
}
```

**Symptoms:**
- Kolom Procedure menampilkan "—" dan badge "Missing Procedure"
- Kolom Scheduled menampilkan "—"

---

## Root Cause

### 1. Missing Field Mapping for `scheduled_at`

**File:** `src/services/orderService.js`

**Problem:** Field `scheduled_at` dari backend tidak di-map secara eksplisit di normalized object, hanya ada `scheduled_start_at`.

```javascript
// ❌ BEFORE - scheduled_at not explicitly set
return {
  ...order,
  scheduled_start_at: scheduledStartAt,  // Only this field set
  // scheduled_at missing!
}
```

**Impact:** Tabel Orders.jsx mencoba akses `r.scheduled_at` tapi field tidak ada di normalized object.

### 2. Wrong Field Priority for Procedure

**File:** `src/pages/Orders.jsx`

**Problem:** Kolom procedure menggunakan `requested_procedure` sebagai prioritas pertama, padahal backend mengirim `procedure_name`.

```javascript
// ❌ BEFORE - wrong priority
<div>{r.requested_procedure || r.procedure_name || '—'}</div>
```

**Impact:** Kalau `requested_procedure` undefined, baru cek `procedure_name`. Seharusnya sebaliknya karena backend kirim `procedure_name`.

---

## Solution Implemented

### 1. Added Explicit `scheduled_at` Mapping

**File:** `src/services/orderService.js` (line 109-110)

```javascript
// ✅ AFTER - both fields set
return {
  ...order,
  scheduled_at: scheduledStartAt,        // Keep backend field name
  scheduled_start_at: scheduledStartAt,  // Alias for form compatibility
  // ...
}
```

**Benefits:**
- ✅ Field `scheduled_at` sekarang tersedia di normalized object
- ✅ Backward compatible dengan `scheduled_start_at` untuk form
- ✅ Lebih eksplisit dan predictable

### 2. Fixed Field Priority for Procedure

**File:** `src/pages/Orders.jsx` (line 463)

```javascript
// ✅ AFTER - correct priority
<div>{r.procedure_name || r.requested_procedure || '—'}</div>
```

**Benefits:**
- ✅ Prioritas `procedure_name` (dari backend) terlebih dahulu
- ✅ Fallback ke `requested_procedure` jika diperlukan
- ✅ Missing badge juga updated untuk cek `procedure_name` first

### 3. Fixed Scheduled Column Display

**File:** `src/pages/Orders.jsx` (line 475-478)

```javascript
// ✅ AFTER - support both field names
{(r.scheduled_at || r.scheduled_start_at) ? (
  <div>
    <div>{new Date(r.scheduled_at || r.scheduled_start_at).toLocaleDateString('id-ID')}</div>
    <div>{new Date(r.scheduled_at || r.scheduled_start_at).toLocaleTimeString('id-ID', ...)}</div>
  </div>
) : '—'}
```

**Benefits:**
- ✅ Cek `scheduled_at` terlebih dahulu (field backend)
- ✅ Fallback ke `scheduled_start_at` untuk compatibility
- ✅ Format tanggal Indonesia dengan locale 'id-ID'

---

## Testing Steps

### Option 1: Browser Hard Refresh (Recommended)

Setelah code changes, lakukan:

1. **Hard Refresh Browser:**
   - Windows/Linux: `Ctrl + Shift + R` atau `Ctrl + F5`
   - Mac: `Cmd + Shift + R`

2. **Clear Browser Cache:**
   - Chrome: `Ctrl+Shift+Delete` → Clear cached images and files
   - Firefox: `Ctrl+Shift+Delete` → Cookies and Cache

3. **Refresh halaman `/orders`**

### Option 2: Clear LocalStorage

Jika hard refresh tidak membantu:

1. **Open Browser Console** (`F12` atau `Ctrl+Shift+I`)

2. **Run command:**
   ```javascript
   localStorage.clear()
   location.reload()
   ```

3. **Login kembali** (karena localStorage cleared)

4. **Navigate ke `/orders`**

### Option 3: Debug dengan Script

Jalankan debug script untuk melihat data mentah:

1. **Copy file `test-order-display.js` ke browser console**

2. **Run debug:**
   ```javascript
   debugOrderDisplay.runAll()
   ```

3. **Check output:**
   - ✅ Backend returns `procedure_name` and `scheduled_at`?
   - ✅ Normalized data has these fields?
   - ✅ LocalStorage has offline orders that override?
   - ✅ Table displays correct data?

---

## Expected Result

### Before Fix:
```
Order Number    Procedure         Scheduled
ORD202511...    —                 —
                Missing Procedure
```

### After Fix:
```
Order Number    Procedure                       Scheduled
ORD202511...    CT Head with Contrast          07/11/2025
                Code: LP23456-7                09:00
```

---

## Field Mapping Reference

### Backend → Frontend Mapping

| Backend Field | Frontend Field(s) | Usage |
|--------------|-------------------|-------|
| `procedure_name` | `procedure_name`, `requested_procedure` | Display in table |
| `procedure_code` | `procedure_code` | Display below procedure name |
| `scheduled_at` | `scheduled_at`, `scheduled_start_at` | Display in scheduled column |
| `status` | `status` (lowercase) | Status badge |
| `patient_name` | `patient_name` | Patient column |
| `medical_record_number` | `mrn` | Below patient name |
| `patient_national_id` | `patient_id` | NIK below patient name |

---

## Troubleshooting

### Issue 1: Procedure masih kosong setelah refresh

**Check:**
```javascript
// Browser console
const orders = await fetch('http://103.42.117.19:8888/orders', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
}).then(r => r.json())

console.log(orders.orders[0].procedure_name)  // Should show procedure name
```

**Fix:**
- Pastikan backend mengembalikan `procedure_name`
- Cek apakah ada offline orders di localStorage yang override

### Issue 2: Scheduled masih kosong

**Check:**
```javascript
// Browser console
const orders = await fetch('http://103.42.117.19:8888/orders', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
}).then(r => r.json())

console.log(orders.orders[0].scheduled_at)  // Should show date
```

**Fix:**
- Pastikan backend mengembalikan `scheduled_at`
- Format date harus parseable oleh JavaScript `new Date()`

### Issue 3: Data lama masih muncul

**Fix:**
```javascript
// Clear all cached data
localStorage.removeItem('orders_offline')
sessionStorage.clear()
location.reload()
```

---

## Files Modified

### Core Changes:
1. ✅ `src/services/orderService.js` (line 109-110)
   - Added explicit `scheduled_at` field mapping

2. ✅ `src/pages/Orders.jsx` (line 463)
   - Fixed procedure field priority (`procedure_name` first)

3. ✅ `src/pages/Orders.jsx` (line 475-478)
   - Support both `scheduled_at` and `scheduled_start_at`

### Documentation:
4. ✅ `ORDER_DISPLAY_FIX.md` (this file)
5. ✅ `test-order-display.js` - Debug script

---

## API Response Example

**Backend Response:**
```json
{
  "status": "success",
  "count": 9,
  "orders": [
    {
      "id": "c42a688b-d214-4fd4-b1e4-3db87052518a",
      "order_number": "ORD2025110700001",
      "accession_number": "2025110600002.001",
      "patient_name": "Ardianto Putra",
      "medical_record_number": "MRN001234",
      "patient_national_id": "9271060312000001",
      "modality": "CT",
      "procedure_code": "LP23456-7",
      "procedure_name": "CT Head with Contrast",  ← This field
      "scheduled_at": "Fri, 07 Nov 2025 09:00:00 GMT",  ← This field
      "status": "CREATED",
      "satusehat_synced": false
    }
  ]
}
```

**After Normalization:**
```javascript
{
  id: "c42a688b-d214-4fd4-b1e4-3db87052518a",
  order_number: "ORD2025110700001",
  accession_no: "2025110600002.001",
  patient_name: "Ardianto Putra",
  mrn: "MRN001234",
  patient_id: "9271060312000001",
  modality: "CT",
  procedure_code: "LP23456-7",
  procedure_name: "CT Head with Contrast",      ← Mapped correctly
  requested_procedure: "CT Head with Contrast", ← Also set for compatibility
  scheduled_at: "2025-11-07T09:00:00.000Z",    ← Mapped correctly (ISO format)
  scheduled_start_at: "2025-11-07T09:00:00.000Z", ← Alias
  status: "created",  // lowercase normalized
  satusehat_synced: false
}
```

---

## Next Steps

1. ✅ **Hard refresh browser** untuk melihat perubahan
2. ✅ **Clear localStorage** jika masih ada masalah
3. ✅ **Run debug script** jika perlu investigasi lebih lanjut
4. ✅ **Report** jika masih ada issue setelah semua langkah di atas

---

**Fixed:** 2025-11-09
**Version:** 1.0
**Status:** ✅ Complete - Requires browser refresh to see changes
