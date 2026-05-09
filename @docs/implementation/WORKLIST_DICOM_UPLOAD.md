# Worklist DICOM Upload Integration

## Overview
Integrasi upload DICOM langsung dari worklist memungkinkan teknisi radiologi untuk mengunggah gambar DICOM dengan konteks order yang sudah terhubung secara otomatis.

## Features

### 1. Upload Button di Worklist
- Setiap baris worklist memiliki tombol "Upload" 
- Tombol membuka modal upload dengan konteks order yang sudah terisi
- Icon: ArrowUpTrayIcon dari Heroicons

### 2. OrderUploadModal Component
**Location:** `src/components/worklist/OrderUploadModal.jsx`

**Features:**
- Menampilkan konteks order (Patient, MRN, Order Number, Procedure, Modality, Status)
- Integrasi dengan DicomUpload component
- Auto-close setelah upload berhasil (2 detik delay)
- Menampilkan hasil upload (success/failed count)
- Instruksi upload untuk user

**Props:**
- `order` - Object order dari worklist
- `onClose` - Callback untuk menutup modal
- `onUploadComplete` - Callback setelah upload selesai

### 3. DicomUpload Component
**Location:** `src/components/pacs/DicomUpload.jsx`

**Features:**
- Drag & drop interface
- File browser selection
- Multi-file upload support
- Progress tracking per file
- Status indicators (pending, uploading, success, error)
- Retry failed uploads
- Clear completed files
- Mock mode untuk development (90% success rate simulation)
- Backend mode untuk production

**Props:**
- `patientId` - ID pasien untuk validasi
- `orderId` - ID order untuk linking otomatis
- `onUploadComplete` - Callback dengan hasil upload

**Upload Modes:**
1. **Mock Mode** (Development)
   - Simulasi upload dengan delay 1-2 detik
   - 90% success rate
   - Tidak memerlukan backend
   - Diaktifkan ketika `VITE_USE_PACS_BACKEND !== 'true'`

2. **Backend Mode** (Production)
   - Upload ke PACS backend service
   - Real file processing
   - Diaktifkan dengan `VITE_USE_PACS_BACKEND=true`

## User Flow

1. User membuka halaman Worklist
2. User melihat daftar order yang perlu di-scan
3. User klik tombol "Upload" pada order yang sesuai
4. Modal terbuka dengan konteks order yang sudah terisi
5. User drag & drop atau browse file DICOM (.dcm)
6. File ditambahkan ke daftar dengan status "Pending"
7. User klik tombol "Upload X Files"
8. Setiap file di-upload dengan progress tracking
9. Status berubah menjadi "Success" atau "Failed"
10. Jika ada yang gagal, user bisa retry
11. Setelah selesai, modal auto-close dan worklist di-refresh

## Technical Details

### State Management
```javascript
// Worklist.jsx
const [selectedOrder, setSelectedOrder] = useState(null);
const [showUploadModal, setShowUploadModal] = useState(false);

// DicomUpload.jsx
const [files, setFiles] = useState([]);
const [uploading, setUploading] = useState(false);
const [uploadProgress, setUploadProgress] = useState({});
```

### File Structure
```javascript
{
  id: timestamp,
  file: File object,
  status: 'pending' | 'uploading' | 'success' | 'error',
  progress: 0-100,
  error: string | null
}
```

### Upload Result
```javascript
{
  total: number,
  success: number
}
```

## Environment Variables

```env
# Enable backend PACS service
VITE_USE_PACS_BACKEND=true

# PACS service URL (if backend enabled)
VITE_PACS_SERVICE_URL=http://localhost:8001
```

## API Integration

### Backend Upload (when enabled)
```javascript
// pacsService.js
export async function uploadDicomFile(file, metadata) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('patient_id', metadata.patientId);
  formData.append('order_id', metadata.orderId);
  
  const response = await fetch(`${PACS_URL}/api/studies/upload`, {
    method: 'POST',
    body: formData
  });
  
  return response.json();
}
```

## UI Components

### Upload Button (Worklist)
```jsx
<button
  onClick={() => handleUploadClick(order)}
  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
>
  <ArrowUpTrayIcon className="h-4 w-4" />
  Upload
</button>
```

### Status Indicators
- **Pending**: Gray background, DocumentIcon
- **Uploading**: Blue background, spinning ArrowPathIcon
- **Success**: Green background, CheckCircleIcon
- **Error**: Red background, XCircleIcon

## Testing

### Mock Mode Testing
1. Set `VITE_USE_PACS_BACKEND=false` atau hapus variable
2. Buka Worklist
3. Klik Upload pada order manapun
4. Upload beberapa file .dcm
5. Observe: ~90% akan success, ~10% akan fail (random)
6. Test retry failed files
7. Test clear completed

### Backend Mode Testing
1. Set `VITE_USE_PACS_BACKEND=true`
2. Pastikan PACS backend service running
3. Upload file DICOM
4. Verify file tersimpan di backend
5. Verify metadata (patient_id, order_id) ter-link dengan benar

## Future Enhancements

1. **Real-time Progress Bar**
   - Show upload percentage per file
   - Overall progress indicator

2. **DICOM Validation**
   - Validate patient ID match
   - Validate modality match
   - Show warnings for mismatches

3. **Thumbnail Preview**
   - Show DICOM image preview before upload
   - Quick visual verification

4. **Batch Operations**
   - Select multiple orders
   - Upload to multiple orders at once

5. **Upload History**
   - Track upload history per order
   - Show who uploaded and when

## Troubleshooting

### Upload tidak muncul di backend
- Check `VITE_USE_PACS_BACKEND` setting
- Verify PACS service URL
- Check network tab untuk errors
- Verify CORS settings di backend

### Modal tidak menutup otomatis
- Check `onUploadComplete` callback
- Verify `result.success > 0` condition
- Check console untuk errors

### File tidak ter-filter (non-DICOM accepted)
- Verify file input accept attribute: `.dcm,application/dicom`
- Check file filter logic di `handleDrop` dan `handleFileInput`

## Related Files

- `src/pages/Worklist.jsx` - Main worklist page
- `src/components/worklist/OrderUploadModal.jsx` - Upload modal
- `src/components/pacs/DicomUpload.jsx` - Upload component
- `src/services/pacsService.js` - PACS API service
- `docs/DICOM_UPLOAD_SYSTEM.md` - General upload documentation
