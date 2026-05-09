# QR Code Format Configuration Guide
**Date**: November 16, 2025  
**Feature**: Configurable QR Code Format (URL vs TEXT)  
**Status**: ✅ COMPLETE

---

## 🎯 Overview

QR code format sekarang bisa dikonfigurasi via environment variable untuk memenuhi berbagai kebutuhan:

1. **TEXT Format** - Plain text yang bisa langsung dibaca
2. **URL Format** - Link ke verification page

---

## ⚙️ Configuration

### Environment Variables

**File**: `.env`

```bash
# QR Code Format Configuration
# Options: 'text' or 'url'
VITE_QR_CODE_FORMAT=text

# Base URL for verification (only for URL format)
# Leave empty to use current domain
VITE_VERIFICATION_BASE_URL=
```

### Format Options

#### 1. TEXT Format (Default)

**Config**:
```bash
VITE_QR_CODE_FORMAT=text
```

**QR Code Contains**:
```
MEDICAL REPORT SIGNATURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RADIOLOGIST: Dr. Admin
LICENSE: #12345
CREDENTIALS: MD, FRCR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATIENT ID: P001
PATIENT NAME: John Doe
STUDY DATE: 2024-01-15
ACCESSION: ACC001
MODALITY: CT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SIGNED: Nov 16, 2025 1:30:45 AM
STATUS: FINAL
VERIFICATION HASH: 30D99864
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This signature is legally binding.
Scan to verify authenticity.
```

**Benefits**:
- ✅ Readable by any QR scanner
- ✅ No internet required
- ✅ Works offline
- ✅ Direct information display
- ✅ No browser needed
- ✅ Copy-paste friendly

**Use Cases**:
- Offline verification
- Paper-based workflows
- No internet access
- Simple verification
- Manual data entry

#### 2. URL Format

**Config**:
```bash
VITE_QR_CODE_FORMAT=url
VITE_VERIFICATION_BASE_URL=https://pacs.hospital.com
```

**QR Code Contains**:
```
https://pacs.hospital.com/verify-signature?hash=30D99864&radiologist=Dr.%20Admin&license=%2312345&patient=P001&study=2024-01-15&accession=ACC001&timestamp=1700095868000
```

**Benefits**:
- ✅ Opens in browser automatically
- ✅ Professional verification page
- ✅ Interactive UI
- ✅ Printable verification
- ✅ Audit trail
- ✅ User-friendly

**Use Cases**:
- Online verification
- External audits
- Professional presentation
- Interactive verification
- Detailed information

---

## 🔧 How to Change Format

### Step 1: Edit .env File

```bash
# Open .env file
nano .env

# Or use any text editor
code .env
```

### Step 2: Set Format

**For TEXT format**:
```bash
VITE_QR_CODE_FORMAT=text
```

**For URL format**:
```bash
VITE_QR_CODE_FORMAT=url
VITE_VERIFICATION_BASE_URL=https://your-domain.com
```

### Step 3: Restart Server

```bash
# Stop current server (Ctrl+C)
# Start again
npm run dev
```

**Important**: Environment variables hanya di-load saat server start!

---

## 📱 QR Code Display

### In Signature Modal:

```
┌─────────────────────────────────────┐
│         ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄             │
│         █ ▄▄▄ █▀▄█ ▄▄▄ █             │
│         █ ███ █▀▄█ ███ █             │
│         █▄▄▄▄▄█▄▀▄█▄▄▄▄▄█             │
│                                     │
│ 📱 Scan QR Code to Read Signature   │
│    Details                          │
│                                     │
│ [Format: TEXT] (configured in .env) │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ MEDICAL REPORT SIGNATURE        │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │
│ │ RADIOLOGIST: Dr. Admin          │ │
│ │ LICENSE: #12345                 │ │
│ │ ...                             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Quick Reference:                    │
│ • Radiologist: Dr. Admin            │
│ • Patient: John Doe (P001)          │
│ • Study Date: 2024-01-15            │
│ • Verification Hash: 30D99864       │
│                                     │
│ ▼ View URL Format (alternative)     │
└─────────────────────────────────────┘
```

### Format Badge:

**TEXT Format**:
```
[Format: TEXT] (configured in .env)
```
- Blue badge
- Shows current format
- Indicates configuration source

**URL Format**:
```
[Format: URL] (configured in .env)
```
- Green badge
- Shows current format
- Indicates configuration source

---

## 🧪 Testing Guide

### Test 1: TEXT Format

1. **Set Configuration**
   ```bash
   # .env
   VITE_QR_CODE_FORMAT=text
   ```

2. **Restart Server**
   ```bash
   npm run dev
   ```

3. **Sign Report**
   - Go to report editor
   - Sign with QR Code method
   - Check QR code display

4. **Expected Result**:
   ```
   ✅ Badge shows "Format: TEXT"
   ✅ QR code preview shows plain text
   ✅ Text is readable
   ✅ All details included
   ```

5. **Scan QR Code**:
   ```
   ✅ Scanner shows text directly
   ✅ No browser opens
   ✅ Can copy text
   ✅ Readable offline
   ```

### Test 2: URL Format

1. **Set Configuration**
   ```bash
   # .env
   VITE_QR_CODE_FORMAT=url
   VITE_VERIFICATION_BASE_URL=http://localhost:5173
   ```

2. **Restart Server**
   ```bash
   npm run dev
   ```

3. **Sign Report**
   - Go to report editor
   - Sign with QR Code method
   - Check QR code display

4. **Expected Result**:
   ```
   ✅ Badge shows "Format: URL"
   ✅ QR code preview shows URL
   ✅ URL is clickable
   ✅ Base URL matches config
   ```

5. **Scan QR Code**:
   ```
   ✅ Scanner detects URL
   ✅ Phone asks "Open in browser?"
   ✅ Browser opens verification page
   ✅ Professional UI displayed
   ```

---

## 📊 Format Comparison

| Feature | TEXT Format | URL Format |
|---------|-------------|------------|
| **Readability** | ✅ Direct | ⚠️ Needs browser |
| **Offline** | ✅ Yes | ❌ No |
| **Internet** | ❌ Not needed | ✅ Required |
| **Scanner Support** | ✅ Universal | ✅ Universal |
| **User-Friendly** | ✅ Simple | ✅ Professional |
| **Data Size** | ~400 bytes | ~200 bytes |
| **Verification** | ⚠️ Manual | ✅ Automatic |
| **Audit Trail** | ❌ No | ✅ Yes |
| **Professional** | ✅ Yes | ✅✅ Very |
| **Copy-Paste** | ✅ Easy | ⚠️ URL only |

---

## 🎯 Use Case Recommendations

### Use TEXT Format When:
- ✅ Offline verification needed
- ✅ No internet access
- ✅ Simple workflows
- ✅ Paper-based processes
- ✅ Manual data entry
- ✅ Quick verification
- ✅ Rural/remote areas

### Use URL Format When:
- ✅ Online verification preferred
- ✅ Professional presentation needed
- ✅ Audit trail required
- ✅ Interactive verification
- ✅ External audits
- ✅ Compliance requirements
- ✅ Modern workflows

---

## 🔐 Security Considerations

### TEXT Format:
- ✅ All data visible in QR code
- ✅ No external dependencies
- ✅ Tamper-evident (hash)
- ⚠️ No automatic verification
- ⚠️ Manual hash checking

### URL Format:
- ✅ Verification page validates
- ✅ Automatic hash checking
- ✅ Audit trail logged
- ⚠️ Requires internet
- ⚠️ Server dependency

### Both Formats:
- ✅ Verification hash included
- ✅ Timestamp recorded
- ✅ Legally binding
- ✅ Tamper-evident
- ✅ Cryptographic security

---

## 🚀 Production Deployment

### Development:
```bash
VITE_QR_CODE_FORMAT=text
VITE_VERIFICATION_BASE_URL=http://localhost:5173
```

### Staging:
```bash
VITE_QR_CODE_FORMAT=url
VITE_VERIFICATION_BASE_URL=https://staging.pacs.hospital.com
```

### Production:
```bash
VITE_QR_CODE_FORMAT=url
VITE_VERIFICATION_BASE_URL=https://pacs.hospital.com
```

### Offline/Rural:
```bash
VITE_QR_CODE_FORMAT=text
VITE_VERIFICATION_BASE_URL=
```

---

## 📝 Configuration Files

### Files Modified:
1. `.env.example` - Template with documentation
2. `.env` - Active configuration
3. `src/components/reporting/DigitalSignature.jsx` - Implementation

### Environment Variables:
```bash
# Required
VITE_QR_CODE_FORMAT=text|url

# Optional (only for URL format)
VITE_VERIFICATION_BASE_URL=https://your-domain.com
```

---

## 🔄 Migration Guide

### From JSON to TEXT:
```bash
# Old (not supported anymore)
# QR code contained JSON

# New
VITE_QR_CODE_FORMAT=text
```

### From TEXT to URL:
```bash
# Change format
VITE_QR_CODE_FORMAT=url

# Set base URL
VITE_VERIFICATION_BASE_URL=https://your-domain.com

# Restart server
npm run dev
```

### From URL to TEXT:
```bash
# Change format
VITE_QR_CODE_FORMAT=text

# Remove base URL (optional)
VITE_VERIFICATION_BASE_URL=

# Restart server
npm run dev
```

---

## 🎉 Benefits

### For Administrators:
- ✅ Easy configuration
- ✅ No code changes needed
- ✅ Flexible deployment
- ✅ Environment-specific settings

### For Users:
- ✅ Format matches workflow
- ✅ Offline capability (TEXT)
- ✅ Professional UI (URL)
- ✅ Universal scanner support

### For Compliance:
- ✅ Audit trail (URL)
- ✅ Offline verification (TEXT)
- ✅ Legally binding (both)
- ✅ Tamper-evident (both)

---

## 📞 Support

### Common Issues:

**Q: Format tidak berubah setelah edit .env**
A: Restart server dengan `npm run dev`

**Q: QR code masih menampilkan format lama**
A: Clear browser cache dan reload

**Q: URL format tidak buka browser**
A: Check VITE_VERIFICATION_BASE_URL setting

**Q: TEXT format terlalu panjang**
A: Normal, QR code Level H support up to 2,953 bytes

---

**Status**: ✅ COMPLETE  
**Configuration**: ✅ FLEXIBLE  
**Testing**: ✅ READY  
**Production**: ✅ READY
