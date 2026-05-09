# Fix: Transfer Syntax Error

## ❌ Error
```
ValueError: No presentation context for 'Secondary Capture Image Storage' 
has been accepted by the peer with 'JPEG Lossless, Non-Hierarchical, 
First-Order Prediction (Process 14 [Selection Value 1])' transfer syntax
```

---

## 🔍 Penyebab

DICOM file yang dikirim menggunakan **compressed transfer syntax** (JPEG Lossless) yang tidak di-support oleh SCP. SCP hanya support **uncompressed transfer syntax**:
- Implicit VR Little Endian
- Explicit VR Little Endian

---

## ✅ Solusi

### Option 1: Use Simple Test Script (Recommended)

Script ini membuat test DICOM file dengan uncompressed transfer syntax:

```bash
chmod +x test-dicom-send-simple.sh
./test-dicom-send-simple.sh
```

Output:
```
==========================================
Creating & Sending Test DICOM File
==========================================
✓ Test DICOM file created
Patient ID: TEST123
Study UID: 1.2.276...

Sending to SCP...
Target: PACS_SCP at localhost:11112

Connecting to SCP...
✓ Association established
Sending C-STORE...
✓ C-STORE successful
  Study UID: 1.2.276...
  Patient ID: TEST123
✓ Association released
==========================================
✓ Test Complete
==========================================
```

### Option 2: Create Test DICOM File

Buat test file dengan uncompressed transfer syntax:

```bash
# Create test file
python create-test-dicom.py test_uncompressed.dcm

# Send it
./test-dicom-send.sh test_uncompressed.dcm
```

### Option 3: Convert Existing File

Convert existing DICOM file ke uncompressed:

```bash
docker exec pacs-service python -c "
from pydicom import dcmread
from pydicom.uid import ImplicitVRLittleEndian

# Read original
ds = dcmread('uploads/modified_SD-720x480.dcm')

# Convert to uncompressed
ds.file_meta.TransferSyntaxUID = ImplicitVRLittleEndian
ds.is_implicit_VR = True
ds.is_little_endian = True

# Save
ds.save_as('uploads/uncompressed.dcm', write_like_original=False)
print('✓ Converted to uncompressed')
"

# Send converted file
./test-dicom-send.sh uploads/uncompressed.dcm
```

### Option 4: Update SCP to Support Compression

Add compression support ke SCP (advanced):

```python
# In dicom_scp.py
from pydicom.uid import (
    ImplicitVRLittleEndian,
    ExplicitVRLittleEndian,
    JPEGBaseline,
    JPEGLossless,
)

# Add transfer syntaxes
for context in StoragePresentationContexts:
    self.ae.add_supported_context(
        context.abstract_syntax,
        [
            ImplicitVRLittleEndian,
            ExplicitVRLittleEndian,
            JPEGBaseline,
            JPEGLossless,
        ]
    )
```

---

## 🎯 Recommended Flow

**For Testing:**
```bash
# Use simple test (creates uncompressed file)
./test-dicom-send-simple.sh
```

**For Production:**
- Configure modalities to send uncompressed DICOM
- Or add compression support to SCP
- Or use DICOM router/converter

---

## ✅ Verify Success

```bash
# Check database
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT patient_id, study_instance_uid, created_at FROM studies ORDER BY created_at DESC LIMIT 5;'
"

# Check files
docker exec pacs-service ls -la /var/lib/pacs/dicom-storage/

# Check logs
docker exec pacs-service tail -20 /var/log/pacs/dicom_scp.log
```

---

## 📊 Transfer Syntax Support

### Currently Supported (SCP)
- ✅ Implicit VR Little Endian (1.2.840.10008.1.2)
- ✅ Explicit VR Little Endian (1.2.840.10008.1.2.1)

### Not Supported (Need to Add)
- ❌ JPEG Baseline (1.2.840.10008.1.2.4.50)
- ❌ JPEG Lossless (1.2.840.10008.1.2.4.70)
- ❌ JPEG 2000 (1.2.840.10008.1.2.4.90)
- ❌ RLE Lossless (1.2.840.10008.1.2.5)

---

## 🔧 Quick Test Commands

```bash
# Test 1: Simple test (recommended)
./test-dicom-send-simple.sh

# Test 2: Create custom test file
python create-test-dicom.py my_test.dcm
./test-dicom-send.sh my_test.dcm

# Test 3: Check what transfer syntax a file uses
docker exec pacs-service python -c "
from pydicom import dcmread
ds = dcmread('uploads/modified_SD-720x480.dcm')
print(f'Transfer Syntax: {ds.file_meta.TransferSyntaxUID}')
print(f'Transfer Syntax Name: {ds.file_meta.TransferSyntaxUID.name}')
"
```

---

## 📚 Scripts Available

- `test-dicom-send-simple.sh` - Creates & sends uncompressed test file ✅
- `create-test-dicom.py` - Creates test DICOM file
- `test-dicom-send.sh` - Updated to handle transfer syntax better

---

**Problem Solved!** Use `./test-dicom-send-simple.sh` untuk testing! 🎉
