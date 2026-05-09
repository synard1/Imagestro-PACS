# File Upload Configuration

This document describes the environment variables for configuring file upload limits.

## Environment Variables

All upload configuration can be set in `.env` file. These settings control file size limits, number of files allowed, and total upload capacity.

### File Size Limits

#### `VITE_MAX_FILE_SIZE`
- **Description**: Default maximum file size (applies when specific type limit is not defined)
- **Default**: `52428800` (50 MB)
- **Format**: Bytes (integer)
- **Example**:
  ```bash
  VITE_MAX_FILE_SIZE=52428800  # 50 MB
  ```

#### `VITE_MAX_PDF_SIZE`
- **Description**: Maximum size for PDF files
- **Default**: `20971520` (20 MB)
- **Format**: Bytes (integer)
- **Example**:
  ```bash
  VITE_MAX_PDF_SIZE=20971520  # 20 MB
  ```

#### `VITE_MAX_DICOM_SIZE`
- **Description**: Maximum size for DICOM medical image files
- **Default**: `104857600` (100 MB)
- **Format**: Bytes (integer)
- **Example**:
  ```bash
  VITE_MAX_DICOM_SIZE=104857600  # 100 MB
  ```

#### `VITE_MAX_IMAGE_SIZE`
- **Description**: Maximum size for regular image files (JPG, PNG, GIF, etc.)
- **Default**: `10485760` (10 MB)
- **Format**: Bytes (integer)
- **Example**:
  ```bash
  VITE_MAX_IMAGE_SIZE=10485760  # 10 MB
  ```

#### `VITE_MAX_DOCUMENT_SIZE`
- **Description**: Maximum size for document files (Word, Excel, etc.)
- **Default**: `10485760` (10 MB)
- **Format**: Bytes (integer)
- **Example**:
  ```bash
  VITE_MAX_DOCUMENT_SIZE=10485760  # 10 MB
  ```

### Upload Capacity Limits

#### `VITE_MAX_FILES_PER_UPLOAD`
- **Description**: Maximum number of files allowed in a single upload session
- **Default**: `20`
- **Format**: Integer
- **Example**:
  ```bash
  VITE_MAX_FILES_PER_UPLOAD=20
  ```
- **Note**: This limits each individual upload operation. Users can upload multiple times.

#### `VITE_MAX_TOTAL_UPLOAD_SIZE`
- **Description**: Maximum total size of all files combined in a single upload session
- **Default**: `524288000` (500 MB)
- **Format**: Bytes (integer)
- **Example**:
  ```bash
  VITE_MAX_TOTAL_UPLOAD_SIZE=524288000  # 500 MB
  ```
- **Note**: This is the combined size for all files selected in one upload operation.

#### `VITE_MAX_FILES_PER_ORDER`
- **Description**: Maximum total number of files allowed per order (across all upload sessions)
- **Default**: `100`
- **Format**: Integer
- **Example**:
  ```bash
  VITE_MAX_FILES_PER_ORDER=100
  ```
- **Note**: This is the absolute maximum files an order can have. Prevents unlimited file accumulation.

## Size Conversion Reference

For easier configuration, here's a conversion reference:

| Size      | Bytes        | Megabytes |
|-----------|--------------|-----------|
| 1 MB      | 1048576      | 1         |
| 5 MB      | 5242880      | 5         |
| 10 MB     | 10485760     | 10        |
| 20 MB     | 20971520     | 20        |
| 50 MB     | 52428800     | 50        |
| 100 MB    | 104857600    | 100       |
| 200 MB    | 209715200    | 200       |
| 500 MB    | 524288000    | 500       |
| 1 GB      | 1073741824   | 1024      |

### Formula
```
Bytes = Megabytes × 1024 × 1024
```

## Usage Examples

### Example 1: Development Environment (More Lenient)
```bash
# Development - Allow larger files for testing
VITE_MAX_FILE_SIZE=104857600          # 100 MB default
VITE_MAX_PDF_SIZE=52428800            # 50 MB for PDFs
VITE_MAX_DICOM_SIZE=209715200         # 200 MB for DICOM
VITE_MAX_IMAGE_SIZE=20971520          # 20 MB for images
VITE_MAX_DOCUMENT_SIZE=20971520       # 20 MB for documents
VITE_MAX_FILES_PER_UPLOAD=50          # Allow 50 files per upload session
VITE_MAX_TOTAL_UPLOAD_SIZE=1073741824 # 1 GB per upload session
VITE_MAX_FILES_PER_ORDER=200          # Allow 200 total files per order
```

### Example 2: Production Environment (Stricter)
```bash
# Production - Strict limits for performance
VITE_MAX_FILE_SIZE=31457280           # 30 MB default
VITE_MAX_PDF_SIZE=10485760            # 10 MB for PDFs
VITE_MAX_DICOM_SIZE=52428800          # 50 MB for DICOM
VITE_MAX_IMAGE_SIZE=5242880           # 5 MB for images
VITE_MAX_DOCUMENT_SIZE=5242880        # 5 MB for documents
VITE_MAX_FILES_PER_UPLOAD=10          # Allow 10 files per upload session
VITE_MAX_TOTAL_UPLOAD_SIZE=104857600  # 100 MB per upload session
VITE_MAX_FILES_PER_ORDER=50           # Allow 50 total files per order
```

### Example 3: Medical Imaging Environment (DICOM Focus)
```bash
# Medical - Prioritize large DICOM files
VITE_MAX_FILE_SIZE=52428800           # 50 MB default
VITE_MAX_PDF_SIZE=20971520            # 20 MB for PDFs
VITE_MAX_DICOM_SIZE=524288000         # 500 MB for DICOM (CT/MRI series)
VITE_MAX_IMAGE_SIZE=10485760          # 10 MB for images
VITE_MAX_DOCUMENT_SIZE=10485760       # 10 MB for documents
VITE_MAX_FILES_PER_UPLOAD=100         # Allow 100 files per upload (DICOM series)
VITE_MAX_TOTAL_UPLOAD_SIZE=2147483648 # 2 GB per upload session (full study)
VITE_MAX_FILES_PER_ORDER=500          # Allow 500 total files per order (multiple studies)
```

## How It Works

1. **Environment Variables**: Set in `.env` file
2. **UploadService**: Reads these values on initialization
3. **Validation**: Checks files against limits before upload
4. **FileUploader Component**: Uses service defaults or accepts custom props
5. **Error Messages**: Shows user-friendly messages when limits are exceeded

## Overriding Defaults

You can override these settings in your component props:

```jsx
<FileUploader
  orderId="12345"
  category="exam_result"
  maxFiles={5}           // Override env default
  maxSize={20971520}     // Override env default (20 MB)
  // ... other props
/>
```

**Note**: Component props take precedence over environment variables.

## Validation Flow

```
User selects files for upload
     ↓
Check number of files ≤ VITE_MAX_FILES_PER_UPLOAD
     ↓
Check total size ≤ VITE_MAX_TOTAL_UPLOAD_SIZE
     ↓
Check existing files in order + new files ≤ VITE_MAX_FILES_PER_ORDER
     ↓
For each file:
  - Check file type is allowed for category
  - Check file size ≤ type-specific limit (VITE_MAX_*_SIZE)
  - Check for dangerous extensions (.exe, .bat, etc.)
  - Check file is not empty
     ↓
If all pass → Upload
If any fail → Show error message with details
```

### Example Scenarios

**Scenario 1: First Upload**
- Order has 0 files
- User selects 10 files
- Check: 0 + 10 = 10 ≤ 100 (VITE_MAX_FILES_PER_ORDER) ✅
- Result: Upload proceeds

**Scenario 2: Approaching Limit**
- Order has 95 files
- User selects 10 files
- Check: 95 + 10 = 105 > 100 (VITE_MAX_FILES_PER_ORDER) ❌
- Result: Error - "Cannot upload 10 file(s). Order already has 95 file(s). Maximum allowed per order is 100 files."

**Scenario 3: Multiple Small Uploads**
- Order has 30 files
- User uploads 20 files (total: 50)
- Later uploads 30 more files (total: 80)
- Later uploads 15 more files (total: 95)
- All succeed because each step stays under limit

## Best Practices

1. **Set Realistic Limits**: Balance user needs with server capacity
2. **Consider Network Speed**: Larger limits = longer upload times
3. **Monitor Storage**: Large limits can quickly fill storage
4. **Different Environments**: Use stricter limits in production
5. **DICOM Files**: Medical images are typically large (50-500 MB), set appropriate limits
6. **Batch Uploads**: Consider `MAX_TOTAL_UPLOAD_SIZE` for multiple file uploads

## Troubleshooting

### Files Being Rejected
- Check if file size exceeds type-specific limit
- Verify file type is in allowed types list
- Check total upload size for batch uploads

### Upload Fails
- Ensure limits are realistic for your server configuration
- Check browser console for detailed error messages
- Verify `.env` file is properly loaded (check with `import.meta.env`)

### Configuration Not Applied
- Restart development server after changing `.env`
- Clear browser cache
- Verify environment variable names are correct (must start with `VITE_`)

## Related Files

- `.env` - Environment configuration
- `.env.example` - Template with documented defaults
- `src/services/uploadService.js` - Upload service implementation
- `src/components/FileUploader.jsx` - File upload component
- `src/components/FileList.jsx` - Uploaded files list

## Security Notes

- Never accept files larger than your server can handle
- Always validate file types on both client and server
- Dangerous file extensions are automatically blocked
- Consider implementing virus scanning for production
- Set appropriate limits to prevent DoS attacks
