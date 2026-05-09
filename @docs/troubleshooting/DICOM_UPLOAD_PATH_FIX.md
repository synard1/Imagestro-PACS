# DICOM Upload Path Fix for Windows

## Problem

The DICOM upload was failing with:
```
[Errno 2] No such file or directory: '/var/lib/pacs/uploads/...'
```

This happened because:
1. The default path `/var/lib/pacs/uploads` is a Linux path
2. This directory doesn't exist on Windows
3. Windows uses different path separators and conventions

## Solution

Updated the upload directory configuration to be cross-platform:

### Before (Linux-only)
```python
UPLOAD_DIR = os.getenv("DICOM_UPLOAD_DIR", "/var/lib/pacs/uploads")
```

### After (Cross-platform)
```python
# Use cross-platform path - defaults to ./uploads/dicom
DEFAULT_UPLOAD_DIR = os.path.join(os.getcwd(), "uploads", "dicom")
UPLOAD_DIR = os.getenv("DICOM_UPLOAD_DIR", DEFAULT_UPLOAD_DIR)

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)
```

## Changes Made

1. **Cross-platform default path**: Uses `os.path.join()` for proper path separators
2. **Relative to working directory**: `./uploads/dicom` relative to where backend runs
3. **Auto-create directory**: Creates directory on startup if it doesn't exist
4. **Configurable via environment**: Can still override with `DICOM_UPLOAD_DIR` env var

## Default Upload Locations

### Development (Windows)
```
E:\Project\docker\mwl-pacs-ui\pacs-service\uploads\dicom\
```

### Development (Linux/Mac)
```
/path/to/project/pacs-service/uploads/dicom/
```

### Production (Configurable)
Set environment variable:
```bash
# Linux
export DICOM_UPLOAD_DIR=/var/lib/pacs/uploads

# Windows
set DICOM_UPLOAD_DIR=C:\ProgramData\PACS\uploads
```

## Directory Structure

After the fix, uploaded DICOM files will be stored as:

```
pacs-service/
├── uploads/
│   └── dicom/
│       ├── 20251118_132609_abc123.dcm
│       ├── 20251118_132610_def456.dcm
│       └── ...
├── app/
│   └── ...
└── ...
```

## Configuration

### Environment Variable (.env)

```bash
# DICOM Upload Directory (Backend)
# Default: ./uploads/dicom (relative to backend working directory)
# For production, use absolute path
DICOM_UPLOAD_DIR=./uploads/dicom
```

### Production Configuration

For production, use an absolute path:

**Linux:**
```bash
DICOM_UPLOAD_DIR=/var/lib/pacs/uploads
```

**Windows:**
```bash
DICOM_UPLOAD_DIR=C:\ProgramData\PACS\uploads
```

**Docker:**
```yaml
environment:
  - DICOM_UPLOAD_DIR=/data/uploads
volumes:
  - ./data:/data
```

## Benefits

1. ✅ **Cross-platform**: Works on Windows, Linux, and Mac
2. ✅ **Auto-create**: Directory is created automatically
3. ✅ **Configurable**: Can be changed via environment variable
4. ✅ **Relative paths**: Works in development without configuration
5. ✅ **Production ready**: Can use absolute paths in production

## Testing

### Test 1: Verify Directory Creation

Start the backend and check logs:
```
INFO: DICOM upload directory: E:\Project\docker\mwl-pacs-ui\pacs-service\uploads\dicom
```

### Test 2: Upload DICOM File

```bash
curl -X POST http://localhost:8003/api/dicom/upload \
  -F "file=@test.dcm" \
  -F "category=dicom"
```

Check that file is created in the upload directory.

### Test 3: Custom Directory

Set environment variable and restart:
```bash
# Windows
set DICOM_UPLOAD_DIR=C:\Temp\dicom
python -m uvicorn app.main:app --reload --port 8003

# Linux/Mac
export DICOM_UPLOAD_DIR=/tmp/dicom
python -m uvicorn app.main:app --reload --port 8003
```

Verify files are uploaded to the custom directory.

## Troubleshooting

### Issue: Permission Denied

**Symptoms:**
```
[Errno 13] Permission denied: '/var/lib/pacs/uploads'
```

**Solution:**
1. Use a directory where you have write permissions
2. Or run with appropriate permissions
3. For development, use default relative path

### Issue: Directory Not Created

**Symptoms:**
```
[Errno 2] No such file or directory
```

**Solution:**
1. Check that `os.makedirs(UPLOAD_DIR, exist_ok=True)` is executed
2. Verify parent directory exists and is writable
3. Check logs for directory creation message

### Issue: Files Not Found After Upload

**Symptoms:**
Files upload successfully but can't be found later

**Solution:**
1. Check the working directory when starting backend
2. Use absolute path in `DICOM_UPLOAD_DIR`
3. Verify file paths in database match actual file locations

## Migration from Old Path

If you have existing files in `/var/lib/pacs/uploads`:

### Option 1: Move Files
```bash
# Linux
mkdir -p ./uploads/dicom
mv /var/lib/pacs/uploads/* ./uploads/dicom/

# Windows
mkdir uploads\dicom
move C:\var\lib\pacs\uploads\* uploads\dicom\
```

### Option 2: Update Environment Variable
```bash
# Keep using old path
export DICOM_UPLOAD_DIR=/var/lib/pacs/uploads
```

### Option 3: Update Database Paths
```sql
-- Update file paths in database
UPDATE dicom_files 
SET file_path = REPLACE(file_path, '/var/lib/pacs/uploads', 'E:/Project/docker/mwl-pacs-ui/pacs-service/uploads/dicom')
WHERE file_path LIKE '/var/lib/pacs/uploads%';
```

## Security Considerations

### Development
- Default relative path is fine
- Files stored in project directory

### Production
- Use dedicated directory outside web root
- Set appropriate permissions (e.g., 750)
- Consider separate partition for storage
- Implement file size limits
- Regular cleanup of old files

### Recommended Production Paths

**Linux:**
```bash
/var/lib/pacs/uploads          # System-wide
/opt/pacs/data/uploads         # Application-specific
/mnt/storage/pacs/uploads      # Mounted storage
```

**Windows:**
```bash
C:\ProgramData\PACS\uploads    # System-wide
C:\inetpub\pacs\uploads        # IIS
D:\PACS\uploads                # Separate drive
```

## Related Documentation

- [DICOM Auto Tag Update](DICOM_AUTO_TAG_UPDATE.md)
- [DICOM Duplicate Handling](DICOM_DUPLICATE_HANDLING.md)
- [CORS Fix and Backend Restart](CORS_FIX_AND_BACKEND_RESTART.md)

## Summary

The DICOM upload path has been fixed to work cross-platform by:
1. Using `os.path.join()` for proper path separators
2. Defaulting to relative path `./uploads/dicom`
3. Auto-creating the directory on startup
4. Allowing configuration via environment variable

**Restart the backend for changes to take effect:**
```bash
cd pacs-service
python -m uvicorn app.main:app --reload --port 8003
```

The upload directory will be created automatically and logged on startup.
