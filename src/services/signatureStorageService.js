/**
 * Signature Storage Service
 * Abstraction layer for signature storage with seamless migration support
 * 
 * Current: localStorage
 * Future: Backend API (automatic fallback)
 */

import { verifySignatureStatus, createSignature as apiCreateSignature, revokeSignature as apiRevokeSignature } from './signatureService';

const STORAGE_KEY = 'report_signatures';
const USE_BACKEND = import.meta.env.VITE_USE_BACKEND_SIGNATURES === 'true';

// ============================================================================
// Storage Abstraction Layer
// ============================================================================

/**
 * Get all signatures from storage
 * @returns {Array} Array of signature records
 */
function getLocalSignatures() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading signatures from localStorage:', error);
    return [];
  }
}

/**
 * Save signatures to storage
 * @param {Array} signatures - Array of signature records
 */
function saveLocalSignatures(signatures) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(signatures));
  } catch (error) {
    console.error('Error saving signatures to localStorage:', error);
    throw error;
  }
}

/**
 * Find signature by hash in localStorage
 * @param {string} hash - Signature hash
 * @returns {Object|null} Signature record or null
 */
function findLocalSignature(hash) {
  const signatures = getLocalSignatures();
  return signatures.find(sig => sig.signature_hash === hash) || null;
}

// ============================================================================
// Public API - Seamless Backend/LocalStorage Switch
// ============================================================================

/**
 * Create a new signature record
 * Tries backend first, falls back to localStorage
 * 
 * @param {Object} signatureData - Signature data
 * @returns {Promise<Object>} Creation result
 */
export async function createSignatureRecord(signatureData) {
  const record = {
    id: crypto.randomUUID(),
    report_id: signatureData.reportId || signatureData.report_id,
    signature_hash: signatureData.signatureHash || signatureData.signature_hash,
    radiologist_id: signatureData.radiologistId || signatureData.radiologist_id,
    radiologist_name: signatureData.radiologistName || signatureData.radiologist_name,
    license_number: signatureData.licenseNumber || signatureData.license_number,
    signature_method: signatureData.signatureMethod || signatureData.signature_method || 'password',
    signature_data: signatureData.signatureData || signatureData.signature_data,
    signed_at: signatureData.signedAt || signatureData.signed_at || new Date().toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
  };

  // Try backend first if enabled
  if (USE_BACKEND) {
    try {
      const result = await apiCreateSignature({
        report_id: record.report_id,
        signature_hash: record.signature_hash,
        radiologist_id: record.radiologist_id,
        radiologist_name: record.radiologist_name,
        license_number: record.license_number,
        signature_method: record.signature_method,
        signature_data: record.signature_data,
      });
      
      if (result.success) {
        console.log('[SignatureStorage] Created in backend:', record.signature_hash);
        // Also save to localStorage as cache
        const signatures = getLocalSignatures();
        signatures.push(record);
        saveLocalSignatures(signatures);
        return { success: true, signature: record, source: 'backend' };
      }
    } catch (error) {
      console.warn('[SignatureStorage] Backend creation failed, using localStorage:', error);
    }
  }

  // Fallback to localStorage
  const signatures = getLocalSignatures();
  
  // Check if already exists
  const existing = signatures.find(sig => sig.signature_hash === record.signature_hash);
  if (existing) {
    console.warn('[SignatureStorage] Signature already exists:', record.signature_hash);
    return { success: false, message: 'Signature already exists', signature: existing, source: 'localStorage' };
  }

  signatures.push(record);
  saveLocalSignatures(signatures);
  
  console.log('[SignatureStorage] Created in localStorage:', record.signature_hash);
  return { success: true, signature: record, source: 'localStorage' };
}

/**
 * Verify signature status
 * Tries backend first, falls back to localStorage
 * 
 * @param {string} signatureHash - Signature hash to verify
 * @returns {Promise<Object>} Verification result
 */
export async function verifySignature(signatureHash) {
  // Try backend first if enabled
  if (USE_BACKEND) {
    try {
      const result = await verifySignatureStatus(signatureHash);
      console.log('[SignatureStorage] Verified from backend:', signatureHash, result.status);
      return { ...result, source: 'backend' };
    } catch (error) {
      console.warn('[SignatureStorage] Backend verification failed, checking localStorage:', error);
    }
  }

  // Fallback to localStorage
  const signature = findLocalSignature(signatureHash);
  
  if (!signature) {
    console.log('[SignatureStorage] Signature not found in localStorage:', signatureHash);
    return {
      valid: false,
      status: 'not_found',
      message: 'Signature not found in database',
      signature_hash: signatureHash,
      source: 'localStorage'
    };
  }

  if (signature.status === 'revoked') {
    console.log('[SignatureStorage] Signature revoked in localStorage:', signatureHash);
    return {
      valid: false,
      status: 'revoked',
      message: 'This signature has been revoked',
      signature: {
        hash: signature.signature_hash,
        radiologist_name: signature.radiologist_name,
        license_number: signature.license_number,
        signed_at: signature.signed_at,
        revoked_at: signature.revoked_at,
        revoked_by: signature.revoked_by,
        revocation_reason: signature.revocation_reason,
      },
      source: 'localStorage'
    };
  }

  console.log('[SignatureStorage] Signature active in localStorage:', signatureHash);
  return {
    valid: true,
    status: 'active',
    message: 'Signature is valid and active',
    signature: {
      hash: signature.signature_hash,
      radiologist_name: signature.radiologist_name,
      license_number: signature.license_number,
      signed_at: signature.signed_at,
      signature_method: signature.signature_method,
    },
    source: 'localStorage'
  };
}

/**
 * Revoke a signature
 * Tries backend first, falls back to localStorage
 * 
 * @param {string} signatureHash - Signature hash to revoke
 * @param {string} revokedBy - User who is revoking
 * @param {string} reason - Revocation reason
 * @returns {Promise<Object>} Revocation result
 */
export async function revokeSignatureRecord(signatureHash, revokedBy, reason) {
  // Try backend first if enabled
  if (USE_BACKEND) {
    try {
      const result = await apiRevokeSignature(signatureHash, revokedBy, reason);
      if (result.success) {
        console.log('[SignatureStorage] Revoked in backend:', signatureHash);
        // Also update localStorage cache
        const signatures = getLocalSignatures();
        const signature = signatures.find(sig => sig.signature_hash === signatureHash);
        if (signature) {
          signature.status = 'revoked';
          signature.revoked_at = new Date().toISOString();
          signature.revoked_by = revokedBy;
          signature.revocation_reason = reason;
          saveLocalSignatures(signatures);
        }
        return { ...result, source: 'backend' };
      }
    } catch (error) {
      console.warn('[SignatureStorage] Backend revocation failed, using localStorage:', error);
    }
  }

  // Fallback to localStorage
  const signatures = getLocalSignatures();
  const signature = signatures.find(sig => sig.signature_hash === signatureHash && sig.status === 'active');
  
  if (!signature) {
    console.warn('[SignatureStorage] Signature not found or already revoked:', signatureHash);
    return {
      success: false,
      message: 'Signature not found or already revoked',
      source: 'localStorage'
    };
  }

  signature.status = 'revoked';
  signature.revoked_at = new Date().toISOString();
  signature.revoked_by = revokedBy;
  signature.revocation_reason = reason;
  
  saveLocalSignatures(signatures);
  
  console.log('[SignatureStorage] Revoked in localStorage:', signatureHash);
  return {
    success: true,
    message: 'Signature revoked successfully',
    signature_id: signature.id,
    revoked_at: signature.revoked_at,
    source: 'localStorage'
  };
}

/**
 * Get all signatures for a report
 * @param {string} reportId - Report ID
 * @returns {Promise<Array>} Array of signatures
 */
export async function getReportSignatures(reportId) {
  // For now, only localStorage (backend can be added later)
  const signatures = getLocalSignatures();
  const reportSignatures = signatures.filter(sig => sig.report_id === reportId);
  
  console.log('[SignatureStorage] Found signatures for report:', reportId, reportSignatures.length);
  return reportSignatures;
}

/**
 * Get signature by hash
 * @param {string} signatureHash - Signature hash
 * @returns {Promise<Object|null>} Signature record or null
 */
export async function getSignatureByHash(signatureHash) {
  // Try backend first if enabled
  if (USE_BACKEND) {
    try {
      const result = await verifySignatureStatus(signatureHash);
      if (result.signature) {
        return { ...result.signature, source: 'backend' };
      }
    } catch (error) {
      console.warn('[SignatureStorage] Backend fetch failed, checking localStorage:', error);
    }
  }

  // Fallback to localStorage
  const signature = findLocalSignature(signatureHash);
  return signature ? { ...signature, source: 'localStorage' } : null;
}

/**
 * Clear all signatures (for testing/development)
 * @returns {boolean} Success status
 */
export function clearAllSignatures() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[SignatureStorage] All signatures cleared');
    return true;
  } catch (error) {
    console.error('[SignatureStorage] Error clearing signatures:', error);
    return false;
  }
}

/**
 * Export all signatures (for backup/migration)
 * @returns {Array} All signature records
 */
export function exportSignatures() {
  return getLocalSignatures();
}

/**
 * Import signatures (for restore/migration)
 * @param {Array} signatures - Signature records to import
 * @returns {boolean} Success status
 */
export function importSignatures(signatures) {
  try {
    if (!Array.isArray(signatures)) {
      throw new Error('Signatures must be an array');
    }
    saveLocalSignatures(signatures);
    console.log('[SignatureStorage] Imported signatures:', signatures.length);
    return true;
  } catch (error) {
    console.error('[SignatureStorage] Error importing signatures:', error);
    return false;
  }
}

// ============================================================================
// Migration Utilities
// ============================================================================

/**
 * Sync localStorage signatures to backend
 * Useful for one-time migration when backend becomes available
 * 
 * @returns {Promise<Object>} Sync result
 */
export async function syncToBackend() {
  const signatures = getLocalSignatures();
  const results = {
    total: signatures.length,
    synced: 0,
    failed: 0,
    errors: []
  };

  console.log('[SignatureStorage] Starting sync to backend:', signatures.length, 'signatures');

  for (const signature of signatures) {
    try {
      const result = await apiCreateSignature({
        report_id: signature.report_id,
        signature_hash: signature.signature_hash,
        radiologist_id: signature.radiologist_id,
        radiologist_name: signature.radiologist_name,
        license_number: signature.license_number,
        signature_method: signature.signature_method,
        signature_data: signature.signature_data,
      });

      if (result.success) {
        results.synced++;
      } else {
        results.failed++;
        results.errors.push({ hash: signature.signature_hash, error: result.message });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({ hash: signature.signature_hash, error: error.message });
    }
  }

  console.log('[SignatureStorage] Sync complete:', results);
  return results;
}

/**
 * Check if backend is available
 * @returns {Promise<boolean>} Backend availability
 */
export async function isBackendAvailable() {
  if (!USE_BACKEND) return false;
  
  try {
    // Try a simple verification call
    await verifySignatureStatus('test-hash-check');
    return true;
  } catch (error) {
    return false;
  }
}

export default {
  createSignatureRecord,
  verifySignature,
  revokeSignatureRecord,
  getReportSignatures,
  getSignatureByHash,
  clearAllSignatures,
  exportSignatures,
  importSignatures,
  syncToBackend,
  isBackendAvailable,
};
