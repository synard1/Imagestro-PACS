# Order CRUD Implementation Guide

## Overview

Implementasi lengkap fitur CRUD (Create, Read, Update, Delete) untuk Order Management yang terintegrasi dengan backend API di `http://103.42.117.19:8888/orders/`.

## Perubahan yang Dilakukan

### 1. **Service Layer** - `src/services/orderService.js` (BARU)

File service baru yang mengikuti pattern yang sama dengan `patientService.js` dan `doctorService.js`.

**Fitur:**
- ✅ List semua orders dengan filter (status, patient_id, modality, dll)
- ✅ Get order by ID/order number/accession number
- ✅ Create order baru
- ✅ Update order
- ✅ Delete order (soft delete)
- ✅ Purge order (hard delete)
- ✅ Sync order ke SatuSehat
- ✅ Create worklist dari order
- ✅ Complete flow (create + sync + worklist)
- ✅ Search orders dengan parameter

**Key Features:**
- **100% Backend API** - Tidak ada fallback ke mock data
- Data normalization dari format backend ke format UI
- Multiple endpoint candidates untuk kompatibilitas API Gateway
- Error handling yang comprehensive
- Wajib enable orders module di Settings untuk menggunakan fitur ini

### 2. **API Registry** - `src/services/api-registry.js`

Updated konfigurasi orders untuk mengarah ke backend yang benar:

```javascript
orders: {
  enabled: true,
  baseUrl: 'http://103.42.117.19:8888',
  healthPath: '/health',
  timeoutMs: 6000
}
```

### 3. **UI Components**

#### **Orders.jsx** - `src/pages/Orders.jsx`
Updated untuk menggunakan `orderService`:
- `api.listOrders()` → `orderService.listOrders()`
- `api.updateOrder()` → `orderService.updateOrder()`
- `api.deleteOrder()` → `orderService.deleteOrder()`

#### **OrderForm.jsx** - `src/pages/OrderForm.jsx`
Updated untuk menggunakan `orderService`:
- `api.getOrder()` → `orderService.getOrder()`
- `api.updateOrder()` → `orderService.updateOrder()`

## API Endpoints Backend

Berdasarkan dokumentasi di `docs/README OrderManagement V1.md`, backend menyediakan endpoint berikut:

### List Orders
```
GET /orders/all
GET /orders/list
GET /orders?status=draft&modality=CT
```

**Query Parameters:**
- `status` - Filter by status (draft, scheduled, completed, dll)
- `patient_id` - Filter by patient ID
- `modality` - Filter by modality (CT, MRI, XR, dll)
- `accession_no` - Filter by accession number
- `order_number` - Filter by order number
- `from_date` - Filter from date
- `to_date` - Filter to date
- `page` - Page number untuk pagination
- `limit` - Limit hasil per page

### Get Order
```
GET /orders/{identifier}
```
`identifier` bisa berupa: order ID, order number, atau accession number

### Create Order
```
POST /orders/create
POST /orders
```

**Request Body Example:**
```json
{
  "patient_id": "12345",
  "patient_name": "John Doe",
  "modality": "CT",
  "requested_procedure": "CT Scan Abdomen",
  "station_ae_title": "CT_STATION_1",
  "scheduled_start_at": "2025-11-09 14:00",
  "status": "draft",
  "accession_no": "ACC20251109001",
  "priority": "routine",
  "reason": "Abdominal pain",
  "laterality": "NA",
  "body_part": "Abdomen",
  "contrast": "with",
  "contrast_allergy": false,
  "pregnancy": "unknown",
  "icd10": "R10.9",
  "tags": "urgent, trauma",
  "referring_id": "DR001",
  "referring_name": "Dr. Smith",
  "nurse_id": "NS001",
  "nurse_name": "Nurse Jane"
}
```

### Update Order
```
PUT /orders/{identifier}
```

**Request Body:** Same format sebagai create

### Delete Order (Soft Delete)
```
DELETE /orders/{identifier}
```

### Purge Order (Hard Delete)
```
DELETE /orders/{identifier}/purge
```

### Sync to SatuSehat
```
POST /orders/{identifier}/sync-satusehat
```

### Create Worklist
```
POST /orders/{identifier}/create-worklist
```

### Complete Flow
```
POST /orders/complete-flow
```
Menjalankan: create order → sync to SatuSehat → create worklist dalam satu request.

## Cara Penggunaan

### Di Service Layer

```javascript
import orderService from '../services/orderService';

// List all orders
const orders = await orderService.listOrders();

// List dengan filter
const filteredOrders = await orderService.listOrders({
  status: 'scheduled',
  modality: 'CT',
  from_date: '2025-11-01',
  to_date: '2025-11-30'
});

// Get single order
const order = await orderService.getOrder('ACC20251109001');

// Create order
const newOrder = await orderService.createOrder({
  patient_id: '12345',
  patient_name: 'John Doe',
  modality: 'CT',
  requested_procedure: 'CT Scan',
  // ... other fields
});

// Update order
const updatedOrder = await orderService.updateOrder('ACC20251109001', {
  status: 'scheduled',
  scheduled_start_at: '2025-11-10 15:00'
});

// Delete order
await orderService.deleteOrder('ACC20251109001');

// Sync to SatuSehat
await orderService.syncToSatusehat('ACC20251109001');

// Create worklist
await orderService.createWorklist('ACC20251109001');
```

### Di UI Components

```javascript
import orderService from '../services/orderService';

// Dalam component
const loadOrders = async () => {
  try {
    const orders = await orderService.listOrders({ status: 'draft' });
    setOrders(orders);
  } catch (error) {
    console.error('Failed to load orders:', error);
  }
};
```

## Data Normalization

`orderService` secara otomatis menormalisasi data dari backend ke format UI:

**Backend Format (dari http://103.42.117.19:8888/orders):**
```json
{
  "id": "2d020474-72cf-4801-a87f-66db86595f84",
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

**UI Format (Normalized):**
```json
{
  "id": "2d020474-72cf-4801-a87f-66db86595f84",
  "order_number": "ORD2025110700005",
  "accession_no": "2025110600003.001",
  "patient_name": "Ardianto Putra",
  "patient_id": "9271060312000001",
  "patient_ihs": "9271060312000001",
  "mrn": "MRN001234",
  "registration_number": "REG20251106001",
  "modality": "CT",
  "procedure_code": "LP23456-7",
  "procedure_name": "CT Head with Contrast",
  "requested_procedure": "CT Head with Contrast",
  "scheduled_start_at": "2025-11-07 09:00",
  "status": "CREATED",
  "order_status": "CREATED",
  "worklist_status": null,
  "satusehat_synced": false,
  "created_at": "2025-11-06T19:18:11.000Z"
}
```

**Field Mapping:**
- `accession_number` → `accession_no`
- `patient_national_id` → `patient_id` & `patient_ihs`
- `medical_record_number` → `mrn`
- `procedure_name` → `requested_procedure`
- `scheduled_at` → `scheduled_start_at`
- Dates are converted to ISO format for UI

## Backend Requirement

Service ini **WAJIB** menggunakan backend API, tanpa fallback:

1. Orders module **HARUS** enabled di Settings (`/settings`)
2. Backend API **HARUS** accessible di `http://103.42.117.19:8888`
3. Jika backend tidak tersedia atau tidak enabled, semua operasi akan throw error
4. Offline orders (localStorage) tetap didukung di UI untuk create manual saat backend down

**Error yang akan muncul jika backend tidak enabled:**
```
Orders backend is not enabled. Please enable it in Settings page.
```

## Error Handling

Service ini memberikan error messages yang jelas:

```javascript
try {
  await orderService.updateOrder(id, data);
} catch (error) {
  // Possible errors:
  // - "Order not found. The order may have been deleted. Please refresh the page."
  // - "You do not have permission to update this order."
  // - "Update conflict. Another user may have modified this order. Please refresh and try again."
}
```

## Testing Guide

### 1. Test List Orders

```bash
# Di browser console
const orders = await orderService.listOrders();
console.log('Total orders:', orders.length);

# Dengan filter
const scheduledOrders = await orderService.listOrders({ status: 'scheduled' });
console.log('Scheduled orders:', scheduledOrders);
```

### 2. Test Create Order

```bash
# Di halaman /orders/new
# 1. Isi form dengan data lengkap
# 2. Klik Save
# 3. Cek di backend apakah order ter-create
# 4. Cek di halaman /orders apakah order muncul
```

### 3. Test Update Order

```bash
# Di halaman /orders/{id}
# 1. Ubah beberapa field
# 2. Klik Update
# 3. Verify perubahan tersimpan di backend
# 4. Refresh halaman dan cek data tetap sama
```

### 4. Test Delete Order

```bash
# Di halaman /orders
# 1. Klik action delete pada salah satu order
# 2. Confirm deletion
# 3. Verify order hilang dari list
# 4. Cek backend apakah order ter-soft delete
```

### 5. Test Backend Integration

Buka Settings page (`/settings`) dan verify:
- ✅ Orders module: **Enabled**
- ✅ Base URL: `http://103.42.117.19:8888`
- ✅ Health status: **Healthy** (hijau)

### 6. Test Error Handling (Backend Disabled)

```bash
# 1. Disable orders module di Settings
# 2. Try to list orders → harus muncul error:
#    "Orders backend is not enabled. Please enable it in Settings page."
# 3. Enable kembali orders module
# 4. Verify backend orders muncul kembali
# 5. Create new order manual → akan tersimpan offline (localStorage) di UI saja
```

## File yang Diubah/Dibuat

### Files Baru:
- ✅ `src/services/orderService.js` - Service layer untuk order CRUD

### Files Diupdate:
- ✅ `src/services/api-registry.js` - Update konfigurasi orders backend
- ✅ `src/pages/Orders.jsx` - Update untuk menggunakan orderService
- ✅ `src/pages/OrderForm.jsx` - Update untuk menggunakan orderService

### Files Tidak Berubah (Tetap Compatible):
- ✅ `src/components/OrderActionButtons.jsx`
- ✅ `src/components/StatusBadge.jsx`
- ✅ `src/config/orderStatus.js`
- ✅ `src/config/orderActions.js`

## Status Implementation

| Feature | Status | Notes |
|---------|--------|-------|
| List Orders | ✅ | Dengan filter & pagination |
| Get Order | ✅ | By ID/number/accession |
| Create Order | ✅ | Dengan validasi lengkap |
| Update Order | ✅ | Dengan permission check |
| Delete Order | ✅ | Soft delete |
| Purge Order | ✅ | Hard delete (backend only) |
| Sync SatuSehat | ✅ | Integration ready |
| Create Worklist | ✅ | Integration ready |
| Complete Flow | ✅ | All-in-one operation |
| Search Orders | ✅ | Multiple criteria |
| Offline Mode | ⚠️ | UI only (tidak untuk service) |
| Data Normalization | ✅ | Backend ↔ UI mapping |
| Error Handling | ✅ | User-friendly messages |

## Next Steps

1. **Testing End-to-End**
   - Test semua CRUD operations dengan backend API
   - Verify data normalization berjalan dengan benar
   - Test error scenarios (network error, validation error, dll)

2. **Performance Optimization**
   - Implementasi caching untuk list orders
   - Add debouncing untuk search
   - Lazy loading untuk large datasets

3. **Advanced Features**
   - Bulk operations (delete multiple, update multiple)
   - Export orders to CSV/Excel
   - Print order details
   - Order history/audit trail

4. **Integration Testing**
   - Test sync to SatuSehat
   - Test worklist creation
   - Test complete flow

## Troubleshooting

### Order tidak muncul di list
- Cek API registry settings (`/settings`)
- Verify backend health check
- Check browser console untuk error
- Verify localStorage untuk offline orders

### Update order gagal
- Cek permission user
- Verify order status (hanya draft/enqueued/scheduled yang bisa edit)
- Check network connection
- Verify data format sesuai dengan backend requirements

### Backend API tidak connect
- Cek URL backend di API registry: `http://103.42.117.19:8888`
- Verify network connectivity ke server
- Check CORS settings di backend
- Verify authentication token valid

## Kontak & Support

Untuk pertanyaan atau issue terkait implementasi ini, silakan:
1. Check logs di browser console
2. Verify backend logs di server
3. Review dokumentasi backend di `docs/README OrderManagement V1.md`

---

**Dibuat:** 2025-11-09
**Versi:** 1.0
**Author:** Claude AI Assistant
