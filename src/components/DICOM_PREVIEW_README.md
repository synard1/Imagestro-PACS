# File Preview Feature Documentation

Fitur preview untuk berbagai jenis file (DICOM, Image, PDF) pada file uploader.

## Components

### 1. DicomPreview
Komponen modal untuk menampilkan preview DICOM image dan metadata tags.

### 2. ImagePreview
Komponen modal untuk menampilkan preview gambar biasa (JPG, PNG, GIF, WebP, BMP).

**Features:**
- Preview gambar dalam modal
- Zoom otomatis (fit to screen)
- Informasi ukuran file

**Props:**
- `file` (File): File object gambar yang akan di-preview
- `onClose` (Function): Callback saat modal ditutup

### 3. PDFPreview
Komponen modal untuk menampilkan preview file PDF.

**Features:**
- Preview PDF menggunakan iframe
- Scroll untuk melihat semua halaman
- Informasi ukuran file

**Props:**
- `file` (File): File object PDF yang akan di-preview
- `onClose` (Function): Callback saat modal ditutup

**Features:**
- Preview DICOM image menggunakan Cornerstone.js
- Menampilkan DICOM tags (Patient, Study, Series, Image info)
- Format tanggal dan waktu DICOM
- Zoom dan pan image
- Responsive design

**Props:**
- `file` (File): File object DICOM yang akan di-preview
- `onClose` (Function): Callback saat modal ditutup

**Example:**
```jsx
import DicomPreview from './components/DicomPreview'

function MyComponent() {
  const [previewFile, setPreviewFile] = useState(null)

  return (
    <>
      <button onClick={() => setPreviewFile(dicomFile)}>
        Preview DICOM
      </button>

      {previewFile && (
        <DicomPreview
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  )
}
```

### 2. FileUploader (Enhanced)
Komponen drag-and-drop file uploader dengan preview sebelum upload.

**New Features:**
- Preview file DICOM sebelum upload
- List file yang dipilih
- Tombol preview untuk setiap file DICOM
- Hapus file dari list sebelum upload
- Upload multiple files sekaligus

**Props:**
- `orderId` (String): ID order untuk upload
- `category` (String): Kategori file (exam_result, lab_result, dll)
- `accept` (Object): Accepted file types
- `maxSize` (Number): Maximum file size
- `maxFiles` (Number): Maximum number of files
- `disabled` (Boolean): Disable uploader
- `onUploadStart` (Function): Callback saat upload dimulai
- `onUploadProgress` (Function): Callback untuk progress update
- `onUploadComplete` (Function): Callback saat upload selesai
- `onUploadError` (Function): Callback saat error

**Example:**
```jsx
import FileUploader from './components/FileUploader'

function OrderPage({ orderId }) {
  return (
    <FileUploader
      orderId={orderId}
      category="exam_result"
      accept={{
        'application/dicom': ['.dcm', '.dicom'],
        'image/*': ['.jpg', '.jpeg', '.png']
      }}
      maxFiles={10}
      onUploadComplete={({ results, errors }) => {
        console.log('Upload complete:', results)
        if (errors.length > 0) {
          console.error('Errors:', errors)
        }
      }}
    />
  )
}
```

### 3. UploadedFilesList
Komponen untuk menampilkan list file yang sudah diupload dengan kemampuan preview.

**Features:**
- List file yang sudah diupload
- Preview DICOM files yang sudah diupload
- Download file
- Delete file
- Refresh list
- Support localStorage dan server backend

**Props:**
- `orderId` (String): ID order untuk mengambil files
- `onDelete` (Function): Callback saat file dihapus
- `onRefresh` (Function): Callback saat list di-refresh

**Example:**
```jsx
import UploadedFilesList from './components/UploadedFilesList'

function OrderPage({ orderId }) {
  const handleDelete = (file) => {
    console.log('File deleted:', file.filename)
  }

  const handleRefresh = () => {
    console.log('List refreshed')
  }

  return (
    <UploadedFilesList
      orderId={orderId}
      onDelete={handleDelete}
      onRefresh={handleRefresh}
    />
  )
}
```

## Complete Usage Example

```jsx
import { useState } from 'react'
import FileUploader from './components/FileUploader'
import UploadedFilesList from './components/UploadedFilesList'

function ExamResultsPage({ orderId }) {
  const [uploadKey, setUploadKey] = useState(0)

  const handleUploadComplete = ({ results, errors }) => {
    if (errors.length === 0) {
      // Trigger refresh of uploaded files list
      setUploadKey(prev => prev + 1)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Upload Exam Results</h2>

        <FileUploader
          orderId={orderId}
          category="exam_result"
          accept={{
            'application/dicom': ['.dcm', '.dicom'],
            'application/pdf': ['.pdf'],
            'image/*': ['.jpg', '.jpeg', '.png']
          }}
          maxFiles={20}
          onUploadComplete={handleUploadComplete}
          onUploadError={({ errors }) => {
            console.error('Upload errors:', errors)
          }}
        />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Uploaded Files</h2>

        <UploadedFilesList
          key={uploadKey}
          orderId={orderId}
          onDelete={() => setUploadKey(prev => prev + 1)}
          onRefresh={() => console.log('Refreshed')}
        />
      </div>
    </div>
  )
}

export default ExamResultsPage
```

## DICOM Tags Displayed

### Patient Information
- Patient Name
- Patient ID
- Birth Date
- Sex

### Study Information
- Study Date
- Study Time
- Study Description
- Study Instance UID

### Series Information
- Series Number
- Series Description
- Series Instance UID

### Image Information
- Instance Number
- Modality
- Rows × Columns
- Slice Thickness
- Pixel Spacing

### Equipment Information
- Institution Name
- Manufacturer

## Technical Details

### Libraries Used
- `@cornerstonejs/core` v1.x - DICOM image rendering dengan GPU acceleration
- `@cornerstonejs/dicom-image-loader` - DICOM image loading dan decoding
- `@cornerstonejs/tools` - Tools untuk zoom, pan, window/level
- `dicom-parser` - DICOM tag parsing
- `react-dropzone` - Drag and drop functionality

### Cornerstone.js Implementation
Menggunakan **Cornerstone3D** (v1.x) dengan fitur:
- **RenderingEngine**: GPU-accelerated rendering
- **Stack Viewport**: Untuk display single atau multi-frame DICOM
- **WebWorker**: Untuk decoding DICOM di background thread
- **WadoURI**: URL scheme untuk loading DICOM dari blob/file

### Initialization Flow
1. Initialize Cornerstone Core (`cornerstone.init()`)
2. Configure DICOM Image Loader dengan external dependencies
3. Setup WebWorker manager untuk decoding
4. Create RenderingEngine untuk setiap viewport
5. Enable viewport dengan type STACK
6. Load dan display image dengan `viewport.setStack()`

### File Support
The components support:
- **Uncompressed DICOM**: Raw pixel data
- **Compressed DICOM**: JPEG, JPEG-LS, JPEG 2000, RLE
- **Photometric Interpretation**: MONOCHROME1, MONOCHROME2, RGB
- **Bits Allocated**: 8-bit, 16-bit (signed/unsigned)
- **Multi-frame**: Support untuk DICOM dengan multiple frames

### Storage Backends
- **Server Backend**: Files uploaded via API endpoints
- **LocalStorage**: Fallback untuk offline mode, files stored as base64
- **Blob URL**: Temporary URL untuk preview file lokal

### Browser Compatibility
- Modern browsers dengan WebGL 2.0 support (Chrome, Firefox, Edge, Safari)
- File API support
- LocalStorage support
- WebWorker support untuk background decoding

## Error Handling

The components handle various error scenarios:
- Invalid DICOM files
- Network errors (with fallback to localStorage)
- File size limits
- File type validation
- Parse errors

## Performance Considerations

- DICOM images are loaded on-demand (only when preview is opened)
- Large files use streaming where possible
- LocalStorage has size limits (~5-10MB depending on browser)
- Consider implementing pagination for large file lists

## Security

- File type validation (MIME type + extension)
- File size limits
- Dangerous extensions blocked (.exe, .bat, etc.)
- No direct file system access
- Server-side validation recommended

## Future Enhancements

Potential improvements:
- Multi-frame DICOM support (cine)
- Window/level adjustment controls
- Measurement tools
- 3D volume rendering
- DICOM SR (Structured Report) support
- Thumbnail generation
- Batch preview mode
