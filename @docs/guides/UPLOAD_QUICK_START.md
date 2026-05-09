# 🚀 Quick Start - Upload Hasil Pemeriksaan

## ⚡ Mulai dalam 5 Menit

### 1. Start Servers

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend dengan File Upload
npm run server:upload
```

✅ **Frontend**: http://localhost:5174
✅ **Backend**: http://localhost:3001

### 2. Login

- **Username**: `admin`
- **Password**: `password123`

### 3. Test Upload

1. Buka **Orders** → Pilih order atau buat baru
2. Edit order yang sudah ada
3. Scroll ke bagian **"Exam Results & Attachments"**
4. Drag-and-drop file atau klik untuk browse
5. Upload selesai! ✨

---

## 📦 Apa yang Sudah Dibuat?

### ✅ Fitur yang Sudah Terimplementasi

#### 🎨 Frontend Components
- **FileUploader.jsx** - Drag-drop interface dengan progress tracking
- **FileList.jsx** - Display & manage uploaded files
- **OrderForm.jsx** - Integrated upload UI
- **Orders.jsx** - Attachment count badges

#### 🛠️ Backend & Services
- **uploadService.js** - Core upload logic (700+ lines)
- **server-with-upload.js** - Express server dengan multer (500+ lines)
- **Multi-storage support** - Browser / Server / External API

#### 📋 Features
- ✅ Drag & drop upload
- ✅ Multiple file upload (max 10 files)
- ✅ File validation (type & size)
- ✅ Progress indicator
- ✅ File categories (Exam Result, Lab Result, Report, etc.)
- ✅ Download & delete files
- ✅ Edit file metadata
- ✅ Attachment indicators di Orders list
- ✅ localStorage fallback (offline mode)
- ✅ Toast notifications
- ✅ Security validation

---

## 📁 Supported File Types

### Exam Results
- 🖼️ **Images**: JPG, PNG, GIF (max 10MB)
- 📄 **Documents**: PDF (max 20MB)
- 🏥 **DICOM**: DCM files (max 100MB)

### Lab Results
- 📊 **Documents**: PDF, Excel
- 🖼️ **Images**: JPG, PNG
- 📃 **Text**: TXT

### Reports
- 📄 **Documents**: PDF, Word
- 📃 **Text**: TXT

---

## 🎯 Use Cases

### 1. Upload Hasil CT Scan

```
Order: CT Head Non-Contrast
├── ct_scan_axial_5mm.dcm (DICOM)
├── ct_report_final.pdf (Report)
└── consent_form_signed.pdf (Consent Form)
```

### 2. Upload Hasil Lab

```
Order: X-Ray Chest PA
├── xray_chest_pa.jpg (Exam Result)
├── lab_blood_test.pdf (Lab Result)
└── radiologist_report.pdf (Report)
```

### 3. Upload Multiple Files

```
Drag & Drop:
- file1.pdf
- file2.jpg
- file3.dcm
→ Upload 3 files sekaligus!
```

---

## 🔧 Configuration

### Environment Variables

```env
# .env file
VITE_MAX_FILE_SIZE=52428800  # 50MB
VITE_SHOW_STORAGE_INDICATOR=true
```

### Enable Backend Storage

```javascript
// src/services/api-registry.js
const DEFAULT_REGISTRY = {
  orders: {
    enabled: true,  // ← Set to true
    baseUrl: 'http://localhost:3001'
  }
}
```

---

## 📖 API Endpoints

### Upload File

```http
POST /api/orders/:orderId/files
Content-Type: multipart/form-data
Authorization: Basic YWRtaW46cGFzc3dvcmQxMjM=

Body:
- file: File (binary)
- category: "exam_result"
- description: "CT scan results"
```

### Get Files

```http
GET /api/orders/:orderId/files

Response:
[
  {
    "file_id": "1730724567890abc",
    "filename": "ct_scan.pdf",
    "file_type": "application/pdf",
    "file_size": 1024000,
    "category": "exam_result",
    "uploaded_at": "2024-11-04T10:30:00Z"
  }
]
```

### Download File

```http
GET /api/files/:fileId

Response: Binary file download
```

### Delete File

```http
DELETE /api/files/:fileId

Response:
{
  "message": "File deleted successfully"
}
```

---

## 🎨 UI Preview

### OrderForm - Upload Section

```
┌─────────────────────────────────────────────────────┐
│ 🔬 Exam Results & Attachments                       │
│                                           📊 3 files │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌───────────────────────────────────────────────┐  │
│  │  📤 Drag files here or click to browse        │  │
│  │                                                 │  │
│  │  Maximum file size: 50MB                       │  │
│  │  Accepted: JPG, PNG, PDF, DCM                  │  │
│  └───────────────────────────────────────────────┘  │
│                                                       │
│  📄 ct_scan_result.pdf                    🔬 Exam    │
│  1.2 MB · Nov 4, 2024 10:30 AM                       │
│  "CT scan axial 5mm slices"                [⬇️] [🗑️] │
│                                                       │
│  🖼️ xray_chest.jpg                        🔬 Exam    │
│  856 KB · Nov 4, 2024 10:31 AM                       │
│  No description                            [⬇️] [🗑️] │
│                                                       │
│  📊 lab_blood.pdf                         ⚗️ Lab     │
│  245 KB · Nov 4, 2024 10:32 AM                       │
│  "Complete blood count results"            [⬇️] [🗑️] │
│                                                       │
└─────────────────────────────────────────────────────┘
```

### Orders List - Attachment Badge

```
┌────────┬─────────┬──────┬─────────────┬───────┬──────┬────┬─────┐
│ Acces  │ Patient │ Mod  │ Procedure   │ Sched │ Stat │ 📎 │ Act │
├────────┼─────────┼──────┼─────────────┼───────┼──────┼────┼─────┤
│ 251104 │ John D  │ CT   │ CT Head Non │ 09:00 │ ✅   │ 📎3│ ... │
│ -0042  │ 123456  │      │ Contrast    │       │      │    │     │
└────────┴─────────┴──────┴─────────────┴───────┴──────┴────┴─────┘
```

---

## 🧪 Testing Checklist

### ✅ Basic Upload
- [ ] Drag-and-drop single file
- [ ] Click to browse and select
- [ ] Upload multiple files (2-5 files)
- [ ] Progress bar appears
- [ ] Toast notification shows success
- [ ] File appears in list

### ✅ File Management
- [ ] Download file works
- [ ] Delete file works (with confirmation)
- [ ] Edit description works
- [ ] File info displays correctly

### ✅ Validation
- [ ] Large file (>50MB) rejected
- [ ] Invalid file type (.exe) rejected
- [ ] Empty file rejected
- [ ] Error message displayed

### ✅ Integration
- [ ] Badge shows correct count in Orders list
- [ ] Click badge opens order detail
- [ ] Files persist after refresh
- [ ] Offline mode works (no server)

---

## 🚨 Troubleshooting

### Problem: Upload fails

**Solution**:
```bash
# Check server is running
npm run server:upload

# Check browser console (F12)
# Check file size and type
```

### Problem: Files not showing

**Solution**:
```javascript
// Check orderId is correct
console.log('Order ID:', orderId)

// Manually refresh files
await uploadService.getOrderFiles(orderId)
```

### Problem: Server not starting

**Solution**:
```bash
# Check port 3001 is available
netstat -ano | findstr :3001

# Kill process if needed
taskkill /PID <PID> /F

# Restart server
npm run server:upload
```

---

## 📚 Full Documentation

Lihat dokumentasi lengkap di:
- **[UPLOAD_FEATURE.md](docs/UPLOAD_FEATURE.md)** - Complete guide
- **README.md** - Project overview
- **API Documentation** - Endpoint details

---

## 🎓 Learning Path

### Beginner
1. ✅ Start servers
2. ✅ Upload first file
3. ✅ Download file
4. ✅ Delete file

### Intermediate
1. ✅ Upload multiple files
2. ✅ Edit file metadata
3. ✅ Use different categories
4. ✅ Test offline mode

### Advanced
1. ✅ Integrate to external API
2. ✅ Add custom validation
3. ✅ Implement file preview
4. ✅ Add batch operations

---

## 💡 Tips & Tricks

### 1. Keyboard Shortcuts

- **Ctrl+V**: Paste image dari clipboard (future feature)
- **Delete**: Delete selected file (future feature)
- **Space**: Preview file (future feature)

### 2. Drag & Drop Tips

```
✅ DO:
- Drag multiple files at once
- Drop directly on upload area
- Use small-medium files for testing

❌ DON'T:
- Drop folders (not supported yet)
- Drop very large files (>100MB)
- Drop dangerous file types
```

### 3. Performance Tips

```javascript
// For large files, compress before upload
- Images: Use JPG instead of PNG
- PDFs: Use "Save as Reduced Size PDF"
- DICOM: Use compression codecs
```

---

## 🎉 Success!

Selamat! Anda sudah berhasil setup fitur upload hasil pemeriksaan.

**Next Steps**:
1. 📖 Baca full documentation
2. 🧪 Test dengan real data
3. 🚀 Deploy ke production
4. 🔐 Setup security hardening

**Need Help?**
- 📧 Email: support@example.com
- 💬 Slack: #mwl-pacs-support
- 📝 Issues: GitHub Issues

---

**Happy Uploading! 🎊**
