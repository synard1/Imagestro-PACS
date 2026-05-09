# 📎 Upload Hasil Pemeriksaan - Feature Documentation

## 📋 Overview

Fitur upload hasil pemeriksaan adalah sistem komprehensif untuk mengelola file attachment pada order pemeriksaan radiologi. Fitur ini mendukung berbagai jenis file (DICOM, PDF, gambar) dan terintegrasi penuh dengan sistem MWL/PACS UI.

### ✨ Key Features

- **Drag & Drop Interface** - Upload file dengan mudah menggunakan drag-and-drop
- **Multi-File Upload** - Upload multiple files sekaligus (max 10 files)
- **File Validation** - Validasi otomatis untuk tipe dan ukuran file
- **Category Management** - Kategorisasi file (Exam Result, Lab Result, Report, dll)
- **Description & Metadata** - Tambahkan deskripsi dan metadata untuk setiap file
- **Multi-Storage Support** - Mendukung browser localStorage, server storage, dan external API
- **Security** - Validasi file type, size limits, dan access control
- **Progress Tracking** - Real-time progress indicator saat upload
- **Download & Delete** - Kelola file dengan mudah (download, delete, edit metadata)
- **Visual Indicators** - Badge attachment count di Orders list

---

## 🏗️ Architecture

### Components

```
src/
├── components/
│   ├── FileUploader.jsx       # Drag-drop upload component
│   ├── FileList.jsx            # Display & manage files
│   └── ...
├── services/
│   ├── uploadService.js        # Core upload logic & API
│   └── ...
├── pages/
│   ├── OrderForm.jsx           # Integrated upload UI
│   └── Orders.jsx              # Attachment indicators
└── server-with-upload.js       # Backend server with multer
```

### Data Flow

```
User Action → FileUploader → UploadService → Backend API → File Storage
                                ↓
                         Toast Notification
                                ↓
                          Refresh FileList
```

### Storage Strategy

```mermaid
graph LR
    A[File Upload] --> B{Backend Enabled?}
    B -->|Yes| C[Upload to Server]
    B -->|No| D[Save to localStorage]
    C --> E[Update Order Attachments]
    D --> E
    E --> F[Display in FileList]
```

---

## 🚀 Getting Started

### 1. Installation

Semua dependencies sudah terinstall:

```json
{
  "multer": "^2.0.2",        // File upload middleware
  "react-dropzone": "^14.3.8" // Drag-drop interface
}
```

### 2. Start Development Server

```bash
# Terminal 1: Frontend (Vite)
npm run dev

# Terminal 2: Backend Server with Upload Support
npm run server:upload
```

Server akan running di:
- **Frontend**: http://localhost:5174
- **Backend**: http://localhost:3001

### 3. Configuration

#### Environment Variables (.env)

```env
# Max file size (default: 50MB)
VITE_MAX_FILE_SIZE=52428800

# Storage indicator
VITE_SHOW_STORAGE_INDICATOR=true
```

#### API Registry (src/services/api-registry.js)

```javascript
const DEFAULT_REGISTRY = {
  orders: {
    enabled: true,
    baseUrl: 'http://localhost:3001',
    timeout: 30000
  }
}
```

---

## 💻 Usage Guide

### For Developers

#### 1. Using FileUploader Component

```jsx
import FileUploader from '../components/FileUploader'

function MyComponent() {
  const handleUploadComplete = ({ results, errors }) => {
    console.log(`${results.length} files uploaded`)
    if (errors.length > 0) {
      console.error(`${errors.length} files failed`)
    }
  }

  return (
    <FileUploader
      orderId={orderId}
      category="exam_result"
      accept={{
        'image/*': ['.png', '.jpg', '.jpeg'],
        'application/pdf': ['.pdf'],
        'application/dicom': ['.dcm']
      }}
      maxSize={50 * 1024 * 1024}  // 50MB
      maxFiles={10}
      onUploadComplete={handleUploadComplete}
      onUploadError={({ errors }) => console.error(errors)}
    />
  )
}
```

#### 2. Using FileList Component

```jsx
import FileList from '../components/FileList'

function MyComponent() {
  const [files, setFiles] = useState([])

  const refreshFiles = async () => {
    const updatedFiles = await uploadService.getOrderFiles(orderId)
    setFiles(updatedFiles)
  }

  return (
    <FileList
      orderId={orderId}
      files={files}
      onRefresh={refreshFiles}
      readOnly={false}
      showCategory={true}
      showDescription={true}
    />
  )
}
```

#### 3. Using UploadService Directly

```javascript
import { uploadService } from '../services/uploadService'

// Upload single file
const result = await uploadService.uploadToOrder(orderId, file, {
  category: 'exam_result',
  description: 'CT Scan Results'
})

// Upload multiple files
const { results, errors } = await uploadService.uploadMultiple(
  orderId,
  files,
  { category: 'lab_result' }
)

// Get files for order
const files = await uploadService.getOrderFiles(orderId)

// Download file
await uploadService.downloadFile(fileId, filename)

// Delete file
await uploadService.deleteFile(orderId, fileId)

// Update metadata
await uploadService.updateFileMetadata(orderId, fileId, {
  category: 'report',
  description: 'Updated description'
})
```

### For End Users

#### 1. Upload File ke Order

1. Buka order yang ingin ditambahkan attachment (klik Edit di Orders list)
2. Scroll ke bagian **"Exam Results & Attachments"**
3. Drag-and-drop file atau klik area upload untuk browse
4. Tunggu upload selesai (progress bar akan muncul)
5. File akan muncul di daftar attachments

#### 2. Manage Attachments

- **Download**: Klik tombol ⬇️ pada file yang ingin didownload
- **Delete**: Klik tombol 🗑️ untuk menghapus file
- **Edit Description**: Klik "Edit" pada deskripsi file
- **View Details**: Hover pada file untuk melihat informasi lengkap

#### 3. View Attachments di Orders List

- Badge **📎 N** menunjukkan jumlah attachment
- Klik badge untuk langsung buka order dan lihat attachments

---

## 📁 File Categories

### Supported Categories

| Category | Label | Icon | Use Case |
|----------|-------|------|----------|
| `exam_result` | Exam Result | 🔬 | Hasil pemeriksaan radiologi (CT, MRI, X-Ray, dll) |
| `lab_result` | Lab Result | ⚗️ | Hasil laboratorium pendukung |
| `report` | Report | 📋 | Laporan pemeriksaan, radiologi report |
| `consent_form` | Consent Form | ✍️ | Formulir persetujuan pasien |
| `other` | Other | 📁 | File lainnya |

### Allowed File Types per Category

#### Exam Result
- Images: JPG, PNG, GIF, WEBP
- Documents: PDF
- DICOM: DCM, DICOM+JPEG, DICOM+RLE
- **Max Size**: 50MB (images: 10MB, DICOM: 100MB)

#### Lab Result
- Documents: PDF, Excel (XLS, XLSX)
- Images: JPG, PNG
- Text: TXT
- **Max Size**: 20MB

#### Report
- Documents: PDF, Word (DOC, DOCX)
- Text: TXT
- **Max Size**: 20MB

#### Other
- All types allowed
- **Max Size**: 50MB

---

## 🔒 Security & Validation

### File Validation

```javascript
// Automatic validation checks:
1. File size (max 50MB default, configurable per type)
2. File type (whitelist-based)
3. Empty file detection
4. Dangerous extensions blocked (.exe, .bat, .sh, etc.)
5. MIME type verification
```

### Security Features

- **Sanitized Filenames**: Auto-generated unique filenames
- **Path Traversal Protection**: Isolated file storage directory
- **Access Control**: Basic authentication on backend
- **Type Whitelist**: Only approved file types accepted
- **Size Limits**: Prevent DOS attacks via large files
- **Metadata Validation**: Sanitized descriptions and categories

### Dangerous Extensions Blocked

`.exe`, `.bat`, `.cmd`, `.sh`, `.msi`, `.app`, `.deb`, `.rpm`, `.js` (executable)

---

## 🗄️ Data Model

### File Metadata Structure

```javascript
{
  file_id: "1730724567890abc123def456",      // Unique ID
  order_id: "o-1001",                        // Parent order ID
  filename: "ct_scan_result.pdf",            // Original filename
  stored_filename: "1730724567890-abc-ct_scan_result.pdf",  // Server filename
  file_type: "application/pdf",               // MIME type
  file_size: 1024000,                         // Bytes
  category: "exam_result",                    // Category
  description: "CT scan results from 2024-11-04",  // User description
  uploaded_at: "2024-11-04T10:30:00.000Z",   // ISO timestamp
  uploaded_by: "admin",                       // Username
  _local: false                               // Local storage flag
}
```

### Order Model Extension

```javascript
{
  // ... existing order fields
  attachments: [
    {
      file_id: "...",
      filename: "...",
      file_type: "...",
      file_size: 1024000,
      category: "exam_result",
      description: "...",
      uploaded_at: "...",
      uploaded_by: "..."
    }
  ]
}
```

---

## 🛠️ Backend API Endpoints

### Base URL

```
http://localhost:3001/api
```

### Authentication

All endpoints require Basic Auth:
- **Username**: `admin`
- **Password**: `password123`

### Endpoints

#### 1. Upload Files to Order

```http
POST /orders/:orderId/files
Content-Type: multipart/form-data

Body:
- files: File[] (up to 10 files)
- category: string (optional)
- description: string (optional)

Response: 201
[
  {
    file_id: "...",
    filename: "...",
    file_type: "...",
    file_size: 1024000,
    category: "exam_result",
    uploaded_at: "..."
  }
]
```

#### 2. Get Order Files

```http
GET /orders/:orderId/files

Response: 200
[
  {
    file_id: "...",
    filename: "...",
    ...
  }
]
```

#### 3. Download File

```http
GET /files/:fileId

Response: 200 (file download)
Content-Disposition: attachment; filename="original.pdf"
```

#### 4. Delete File

```http
DELETE /files/:fileId

Response: 200
{
  message: "File deleted successfully"
}
```

#### 5. Update File Metadata

```http
PATCH /files/:fileId/metadata
Content-Type: application/json

Body:
{
  category: "report",
  description: "Updated description"
}

Response: 200
{
  message: "File metadata updated successfully"
}
```

#### 6. Get Storage Statistics

```http
GET /files/stats

Response: 200
{
  total_files: 42,
  total_size: 104857600,
  by_category: {
    exam_result: { count: 20, size: 50000000 },
    lab_result: { count: 15, size: 30000000 },
    ...
  },
  by_type: {
    "application/pdf": { count: 25, size: 60000000 },
    ...
  }
}
```

---

## 🔄 Storage Modes

### 1. Browser Storage (localStorage)

**When**: Backend disabled or unavailable

**Features**:
- Files stored as base64 in localStorage
- 5-10MB total limit
- Persists in browser only
- No server required

**Limitations**:
- Limited capacity
- Not shared across devices
- Cleared when browser cache cleared

### 2. Server Storage (Node.js + JSON)

**When**: `npm run server:upload` running

**Features**:
- Files stored in `server-data/files/`
- Metadata in `server-data/file-metadata.json`
- Basic authentication
- Suitable for small teams

**File Structure**:
```
server-data/
├── files/
│   ├── 1730724567890-abc-ct_scan.pdf
│   ├── 1730724568901-def-xray.jpg
│   └── ...
├── file-metadata.json
└── orders.json (with attachments field)
```

### 3. External API (Production)

**When**: API registry `orders.enabled = true`

**Features**:
- Scalable cloud storage
- CDN support
- Advanced access control
- Virus scanning
- File versioning

---

## 📊 File Storage Statistics

### Get Storage Info

```javascript
import { uploadService } from '../services/uploadService'

const stats = uploadService.getStorageStats()

console.log(stats)
// {
//   totalFiles: 42,
//   totalSize: 104857600,  // bytes
//   byCategory: {
//     exam_result: { count: 20, size: 50MB },
//     lab_result: { count: 15, size: 30MB },
//     ...
//   }
// }
```

### Monitor Disk Usage

```bash
# Check server-data/files directory size
du -sh server-data/files

# List largest files
du -ah server-data/files | sort -rh | head -20
```

---

## 🧪 Testing Guide

### Manual Testing Checklist

#### Upload Flow
- [ ] Drag-and-drop single file
- [ ] Drag-and-drop multiple files
- [ ] Click to browse and upload
- [ ] Upload different file types (PDF, JPG, DCM)
- [ ] Upload file exceeding size limit (should fail)
- [ ] Upload dangerous file type (.exe) (should fail)
- [ ] Progress bar displays correctly
- [ ] Toast notifications work
- [ ] File appears in list after upload

#### File Management
- [ ] Download file
- [ ] Delete file (with confirmation)
- [ ] Edit file description
- [ ] View file metadata
- [ ] Category badge displays correctly

#### Integration
- [ ] Attachment count badge shows in Orders list
- [ ] Click badge navigates to order detail
- [ ] Files persist after page refresh
- [ ] Files sync between browser and server
- [ ] Offline mode works (localStorage)

#### Error Handling
- [ ] Network error handled gracefully
- [ ] Server unavailable fallback to localStorage
- [ ] Invalid file type shows error
- [ ] Large file shows error
- [ ] Empty file shows error

### Automated Testing

```javascript
// Example unit test
import { uploadService } from '../services/uploadService'

describe('UploadService', () => {
  test('validates file size', () => {
    const largeFile = new File(['x'.repeat(100 * 1024 * 1024)], 'large.pdf')
    const result = uploadService.validateFile(largeFile, 'exam_result')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('File size exceeds maximum')
  })

  test('validates file type', () => {
    const exeFile = new File(['data'], 'virus.exe')
    const result = uploadService.validateFile(exeFile, 'exam_result')

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('not allowed')
  })
})
```

---

## 🚀 Production Deployment

### Prerequisites

1. **Cloud Storage** (Recommended: AWS S3 / MinIO)
2. **Database** (PostgreSQL / MySQL for metadata)
3. **CDN** (CloudFront / CloudFlare for file delivery)
4. **Virus Scanner** (ClamAV / Cloud-based)

### Migration to Cloud Storage

#### Option A: AWS S3

```javascript
// Update uploadService.js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

async function uploadToS3(file, metadata) {
  const command = new PutObjectCommand({
    Bucket: 'mwl-pacs-files',
    Key: `orders/${metadata.orderId}/${file.name}`,
    Body: file.stream,
    ContentType: file.type,
    Metadata: {
      category: metadata.category,
      uploadedBy: metadata.uploaded_by
    }
  })

  return await s3Client.send(command)
}
```

#### Option B: MinIO (Self-hosted)

```javascript
import * as Minio from 'minio'

const minioClient = new Minio.Client({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
})

await minioClient.putObject(
  'mwl-pacs',
  `orders/${orderId}/${filename}`,
  fileStream,
  fileSize,
  { 'Content-Type': mimeType }
)
```

### Security Hardening

```javascript
// Add virus scanning
import { ClamScan } from 'clamscan'

const scanner = await new ClamScan().init({
  clamdscan: { path: '/usr/bin/clamdscan' }
})

const { isInfected, viruses } = await scanner.scanFile(filePath)
if (isInfected) {
  throw new Error(`Virus detected: ${viruses.join(', ')}`)
}
```

### Environment Configuration

```env
# Production .env
NODE_ENV=production
PORT=3001

# Storage
STORAGE_TYPE=s3
AWS_REGION=us-east-1
AWS_S3_BUCKET=mwl-pacs-files
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# CDN
CDN_URL=https://cdn.example.com

# Security
MAX_FILE_SIZE=52428800
ENABLE_VIRUS_SCAN=true
ENABLE_FILE_ENCRYPTION=true

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/mwl_pacs
```

---

## 📈 Performance Optimization

### 1. Chunked Upload (Large Files)

```javascript
// For files > 10MB, use chunked upload
async function chunkedUpload(file, chunkSize = 5 * 1024 * 1024) {
  const chunks = Math.ceil(file.size / chunkSize)

  for (let i = 0; i < chunks; i++) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize, file.size)
    const chunk = file.slice(start, end)

    await uploadChunk(chunk, i, chunks)

    // Update progress
    const progress = Math.round(((i + 1) / chunks) * 100)
    onProgress({ loaded: i + 1, total: chunks, percent: progress })
  }
}
```

### 2. Lazy Loading File List

```javascript
// Load files on demand, not all at once
const [visibleFiles, setVisibleFiles] = useState([])
const [page, setPage] = useState(1)
const PAGE_SIZE = 10

useEffect(() => {
  const loadMore = async () => {
    const files = await uploadService.getOrderFiles(orderId)
    const paginated = files.slice(0, page * PAGE_SIZE)
    setVisibleFiles(paginated)
  }
  loadMore()
}, [page, orderId])
```

### 3. File Compression

```javascript
// Compress images before upload
import imageCompression from 'browser-image-compression'

async function compressImage(file) {
  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    useWebWorker: true
  }

  return await imageCompression(file, options)
}
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "File upload failed"

**Possible Causes**:
- Server not running
- Network error
- File too large
- Invalid file type

**Solutions**:
```bash
# Check server status
npm run server:upload

# Check browser console for errors
# Check backend logs for errors
# Verify file size and type
```

#### 2. "Files not showing after upload"

**Solutions**:
- Refresh the page
- Check if `loadOrderFiles()` is called
- Verify `orderId` is correct
- Check browser localStorage (F12 → Application → Local Storage)

#### 3. "Download not working"

**Solutions**:
- Check if file exists in `server-data/files/`
- Verify file metadata in `file-metadata.json`
- Check browser popup blocker
- Verify server authentication

#### 4. "localStorage quota exceeded"

**Solutions**:
```javascript
// Clear old files
localStorage.removeItem('order_files_OLD_ORDER_ID')

// Or migrate to server storage
npm run server:upload
```

---

## 📚 Best Practices

### 1. File Naming

```javascript
// Good: Descriptive, safe filenames
"ct_scan_head_2024-11-04.pdf"
"xray_chest_patient_12345.jpg"

// Bad: Generic, unsafe filenames
"scan.pdf"
"file (1).jpg"
```

### 2. File Organization

```javascript
// Group by category and date
exam_results/
  2024-11/
    ct_scans/
    xrays/
lab_results/
  2024-11/
```

### 3. Error Handling

```javascript
try {
  await uploadService.uploadToOrder(orderId, file, metadata)
} catch (error) {
  // Log error details
  console.error('[Upload] Failed:', {
    orderId,
    filename: file.name,
    error: error.message,
    stack: error.stack
  })

  // Show user-friendly message
  toast.notify({
    type: 'error',
    message: 'Upload failed. Please try again.'
  })
}
```

### 4. Progress Feedback

```javascript
// Always provide feedback
onUploadStart={() => {
  toast.notify({ type: 'info', message: 'Uploading...' })
}}

onUploadProgress={({ percent }) => {
  // Update progress bar
  setProgress(percent)
}}

onUploadComplete={() => {
  toast.notify({ type: 'success', message: 'Upload complete!' })
}}
```

---

## 🔮 Future Enhancements

### Planned Features

1. **File Preview** - Preview PDF, images, DICOM in-browser
2. **Batch Operations** - Select multiple files for bulk actions
3. **Version Control** - Track file versions and changes
4. **Sharing** - Share files with external users via links
5. **OCR** - Extract text from scanned documents
6. **AI Analysis** - Automatic tagging and categorization
7. **Audit Trail** - Complete file access history
8. **Mobile App** - Upload from mobile devices
9. **DICOM Viewer Integration** - Open DICOM files directly
10. **Cloud Sync** - Sync with Google Drive, Dropbox

### Contributions Welcome!

```bash
# Fork repository
git clone https://github.com/your-org/mwl-pacs-ui
cd mwl-pacs-ui

# Create feature branch
git checkout -b feature/file-preview

# Make changes and test
npm run dev
npm run server:upload

# Submit pull request
git push origin feature/file-preview
```

---

## 📞 Support

### Documentation
- **Main Docs**: `/docs/`
- **API Docs**: `/docs/API.md`
- **Contributing**: `/docs/CONTRIBUTING.md`

### Contact
- **Issues**: https://github.com/your-org/mwl-pacs-ui/issues
- **Email**: support@example.com
- **Slack**: #mwl-pacs-support

---

## 📄 License

MIT License - See [LICENSE](../LICENSE) file for details

---

## 🙏 Acknowledgments

- React Dropzone contributors
- Multer developers
- TailwindCSS team
- All contributors and testers

---

**Version**: 1.0.0
**Last Updated**: 2024-11-04
**Author**: Claude Code AI Assistant
**Status**: ✅ Production Ready
