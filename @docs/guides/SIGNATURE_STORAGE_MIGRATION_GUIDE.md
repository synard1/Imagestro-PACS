# Signature Storage Migration Guide
**Date**: November 16, 2025  
**Status**: ✅ READY FOR PRODUCTION

---

## 📋 Overview

Sistem signature tracking menggunakan **abstraction layer** yang memungkinkan seamless migration dari localStorage ke backend API tanpa perubahan kode aplikasi.

### Current Implementation:
- ✅ **localStorage** - Default storage (works offline)
- ✅ **Abstraction Layer** - Transparent switching
- ✅ **Backend Ready** - API endpoints prepared
- ✅ **Auto Fallback** - Graceful degradation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│  (ReportEditor, VerifySignature, etc.)                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Signature Storage Service                      │
│         (signatureStorageService.js)                     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Public API (Abstraction Layer)                  │  │
│  │  - createSignatureRecord()                       │  │
│  │  - verifySignature()                             │  │
│  │  - revokeSignatureRecord()                       │  │
│  │  - getReportSignatures()                         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────┐              ┌──────────────────┐    │
│  │  localStorage │  ◄─────────► │  Backend API     │    │
│  │  (Current)    │   Fallback   │  (Future/Ready)  │    │
│  └──────────────┘              └──────────────────┘    │
└─────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  Storage Backends                        │
│                                                          │
│  ┌──────────────┐              ┌──────────────────┐    │
│  │ Browser      │              │ PostgreSQL       │    │
│  │ localStorage │              │ Database         │    │
│  └──────────────┘              └──────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Current Setup (localStorage)

### Storage Structure

```javascript
// localStorage key: 'report_signatures'
[
  {
    "id": "uuid-v4",
    "report_id": "study-instance-uid",
    "signature_hash": "274828CC",
    "radiologist_id": "dr-admin",
    "radiologist_name": "Dr. Admin",
    "license_number": "#12345",
    "signature_method": "password",
    "signature_data": { /* full signature info */ },
    "signed_at": "2025-11-16T10:30:00Z",
    "status": "active",
    "revoked_at": null,
    "revoked_by": null,
    "revocation_reason": null,
    "created_at": "2025-11-16T10:30:00Z"
  }
]
```

### Usage Example

```javascript
import { 
  createSignatureRecord, 
  verifySignature, 
  revokeSignatureRecord 
} from './services/signatureStorageService';

// Create signature
const result = await createSignatureRecord({
  reportId: 'study-123',
  signatureHash: '274828CC',
  radiologistId: 'dr-admin',
  radiologistName: 'Dr. Admin',
  licenseNumber: '#12345',
  signatureMethod: 'password',
  signatureData: { /* ... */ }
});

// Verify signature
const verification = await verifySignature('274828CC');
if (verification.status === 'revoked') {
  console.log('Signature revoked:', verification.signature.revocation_reason);
}

// Revoke signature
const revocation = await revokeSignatureRecord(
  '274828CC',
  'Dr. Admin',
  'Correction needed'
);
```

---

## 🚀 Migration to Backend API

### Step 1: Enable Backend

Update `.env`:

```bash
# Enable backend signature storage
VITE_USE_BACKEND_SIGNATURES=true

# PACS API URL
VITE_PACS_API_URL=http://localhost:8003
```

### Step 2: Run Database Migration

```bash
# Navigate to pacs-service
cd pacs-service

# Run migration
python migrations/run_migration.py migrations/002_create_signature_tables.sql
```

### Step 3: Start PACS Service

```bash
# Start PACS service
cd pacs-service
python -m uvicorn app.main:app --reload --port 8003
```

### Step 4: Sync Existing Data (Optional)

```javascript
import { syncToBackend } from './services/signatureStorageService';

// Sync all localStorage signatures to backend
const result = await syncToBackend();
console.log('Synced:', result.synced);
console.log('Failed:', result.failed);
console.log('Errors:', result.errors);
```

### Step 5: Verify Migration

```javascript
import { isBackendAvailable } from './services/signatureStorageService';

// Check if backend is working
const available = await isBackendAvailable();
console.log('Backend available:', available);
```

---

## 🔄 How It Works

### Automatic Fallback

The abstraction layer automatically handles backend failures:

```javascript
// signatureStorageService.js
export async function verifySignature(signatureHash) {
  // Try backend first if enabled
  if (USE_BACKEND) {
    try {
      const result = await verifySignatureStatus(signatureHash);
      return { ...result, source: 'backend' };
    } catch (error) {
      console.warn('Backend failed, using localStorage');
    }
  }

  // Fallback to localStorage
  const signature = findLocalSignature(signatureHash);
  return { ...signature, source: 'localStorage' };
}
```

### Transparent Switching

Application code doesn't change:

```javascript
// ReportEditor.jsx - Same code works for both!
const result = await createSignatureRecord({
  reportId: studyId,
  signatureHash: signatureData.verificationHash,
  // ...
});

// Works with localStorage OR backend
console.log('Saved to:', result.source); // 'localStorage' or 'backend'
```

---

## 📊 Feature Comparison

| Feature | localStorage | Backend API |
|---------|-------------|-------------|
| **Storage** | Browser only | Database (PostgreSQL) |
| **Persistence** | Per browser | Centralized |
| **Sync** | No | Yes |
| **Multi-device** | No | Yes |
| **Audit Trail** | Limited | Full |
| **Real-time** | No | Yes |
| **Backup** | Manual | Automatic |
| **Scalability** | Limited | High |
| **Offline** | Yes | No (with cache) |

---

## 🧪 Testing

### Test localStorage (Current)

```javascript
// Create test signature
const result = await createSignatureRecord({
  reportId: 'test-report-1',
  signatureHash: 'TEST1234',
  radiologistId: 'test-doctor',
  radiologistName: 'Dr. Test',
  licenseNumber: '#TEST',
  signatureMethod: 'password'
});

console.log('Created:', result.success);
console.log('Source:', result.source); // 'localStorage'

// Verify
const verification = await verifySignature('TEST1234');
console.log('Status:', verification.status); // 'active'

// Revoke
const revocation = await revokeSignatureRecord(
  'TEST1234',
  'Dr. Test',
  'Testing revocation'
);

console.log('Revoked:', revocation.success);

// Verify again
const verification2 = await verifySignature('TEST1234');
console.log('Status:', verification2.status); // 'revoked'
```

### Test Backend Migration

```bash
# 1. Enable backend in .env
VITE_USE_BACKEND_SIGNATURES=true

# 2. Start PACS service
cd pacs-service
python -m uvicorn app.main:app --reload --port 8003

# 3. Test in browser console
const result = await createSignatureRecord({
  reportId: 'test-report-2',
  signatureHash: 'TEST5678',
  radiologistId: 'test-doctor',
  radiologistName: 'Dr. Test',
  licenseNumber: '#TEST',
  signatureMethod: 'password'
});

console.log('Source:', result.source); // 'backend'
```

---

## 🔐 Security Considerations

### localStorage Security

**Pros**:
- ✅ No network transmission
- ✅ Works offline
- ✅ Fast access

**Cons**:
- ⚠️ Browser-specific
- ⚠️ Can be cleared
- ⚠️ Limited to ~5-10MB
- ⚠️ No encryption by default

### Backend Security

**Pros**:
- ✅ Centralized control
- ✅ Database encryption
- ✅ Audit logging
- ✅ Access control
- ✅ Backup/recovery

**Cons**:
- ⚠️ Requires network
- ⚠️ Single point of failure (mitigated by fallback)

---

## 📦 Backup & Export

### Export Signatures

```javascript
import { exportSignatures } from './services/signatureStorageService';

// Export all signatures
const signatures = exportSignatures();

// Save to file
const blob = new Blob([JSON.stringify(signatures, null, 2)], { 
  type: 'application/json' 
});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `signatures-backup-${Date.now()}.json`;
a.click();
```

### Import Signatures

```javascript
import { importSignatures } from './services/signatureStorageService';

// Load from file
const file = document.querySelector('input[type=file]').files[0];
const text = await file.text();
const signatures = JSON.parse(text);

// Import
const success = importSignatures(signatures);
console.log('Import success:', success);
```

---

## 🐛 Troubleshooting

### Issue: Signature not found after revocation

**Solution**: Check if signature was saved to storage

```javascript
const signature = await getSignatureByHash('274828CC');
console.log('Signature:', signature);
```

### Issue: Backend not working

**Solution**: Check backend availability

```javascript
const available = await isBackendAvailable();
if (!available) {
  console.log('Backend not available, using localStorage');
}
```

### Issue: localStorage full

**Solution**: Clear old signatures or migrate to backend

```javascript
// Check storage size
const signatures = exportSignatures();
console.log('Signatures count:', signatures.length);
console.log('Storage size:', JSON.stringify(signatures).length, 'bytes');

// Clear if needed
clearAllSignatures();
```

---

## 📝 Migration Checklist

### Pre-Migration

- [ ] Backup current localStorage signatures
- [ ] Test backend API endpoints
- [ ] Run database migration
- [ ] Verify PACS service is running
- [ ] Update `.env` configuration

### Migration

- [ ] Enable backend in `.env`
- [ ] Sync existing signatures to backend
- [ ] Verify sync results
- [ ] Test signature creation
- [ ] Test signature verification
- [ ] Test signature revocation

### Post-Migration

- [ ] Monitor backend performance
- [ ] Check audit logs
- [ ] Verify all signatures accessible
- [ ] Test fallback to localStorage
- [ ] Update documentation

---

## 🎯 Best Practices

### Development

```bash
# Use localStorage for development
VITE_USE_BACKEND_SIGNATURES=false
```

### Staging

```bash
# Test backend with fallback
VITE_USE_BACKEND_SIGNATURES=true
```

### Production

```bash
# Use backend with localStorage cache
VITE_USE_BACKEND_SIGNATURES=true
```

---

## 📚 API Reference

### createSignatureRecord(data)

Create a new signature record.

**Parameters**:
- `reportId` (string) - Report/Study ID
- `signatureHash` (string) - Unique signature hash
- `radiologistId` (string) - Radiologist ID
- `radiologistName` (string) - Radiologist name
- `licenseNumber` (string) - License number
- `signatureMethod` (string) - Signature method (password/pad/qrcode)
- `signatureData` (object) - Full signature data

**Returns**: `Promise<{ success, signature, source }>`

### verifySignature(hash)

Verify signature status.

**Parameters**:
- `hash` (string) - Signature hash

**Returns**: `Promise<{ valid, status, message, signature, source }>`

### revokeSignatureRecord(hash, revokedBy, reason)

Revoke a signature.

**Parameters**:
- `hash` (string) - Signature hash
- `revokedBy` (string) - User revoking
- `reason` (string) - Revocation reason

**Returns**: `Promise<{ success, message, source }>`

---

## 🎉 Summary

### What We Have

✅ **Abstraction Layer** - Seamless storage switching  
✅ **localStorage** - Working now, no backend needed  
✅ **Backend Ready** - API endpoints prepared  
✅ **Auto Fallback** - Graceful degradation  
✅ **Migration Tools** - Sync, export, import  
✅ **Zero Downtime** - Switch without code changes  

### Migration Path

```
Current State:
  localStorage ✅ (Working)
  Backend API ✅ (Ready)

Migration:
  1. Enable backend in .env
  2. Run database migration
  3. Start PACS service
  4. Sync existing data (optional)
  5. Done! ✅

Fallback:
  Backend fails → localStorage (automatic)
```

---

**Status**: ✅ PRODUCTION READY  
**Migration**: ⏱️ 5 MINUTES  
**Downtime**: 🚫 ZERO  
**Risk**: 🟢 LOW (automatic fallback)
