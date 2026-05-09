/**
 * Signature Service
 * Handles signature verification and management
 */

const PACS_API_URL = import.meta.env.VITE_MAIN_API_BACKEND_URL || '';

/**
 * Verify signature status from database
 * @param {string} signatureHash - The signature hash to verify
 * @returns {Promise<Object>} Verification result
 */
export async function verifySignatureStatus(signatureHash) {
  try {
    const response = await fetch(`${PACS_API_URL}/api/signatures/verify/${signatureHash}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error verifying signature:', error);
    throw error;
  }
}

/**
 * Create a new signature record
 * @param {Object} signatureData - Signature data
 * @returns {Promise<Object>} Creation result
 */
export async function createSignature(signatureData) {
  try {
    const response = await fetch(`${PACS_API_URL}/api/signatures/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(signatureData),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating signature:', error);
    throw error;
  }
}

/**
 * Revoke a signature
 * @param {string} signatureHash - The signature hash to revoke
 * @param {string} revokedBy - User who is revoking
 * @param {string} reason - Revocation reason
 * @returns {Promise<Object>} Revocation result
 */
export async function revokeSignature(signatureHash, revokedBy, reason) {
  try {
    const response = await fetch(`${PACS_API_URL}/api/signatures/${signatureHash}/revoke`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        revoked_by: revokedBy,
        revocation_reason: reason,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error revoking signature:', error);
    throw error;
  }
}

/**
 * Get signature details
 * @param {string} signatureHash - The signature hash
 * @returns {Promise<Object>} Signature details
 */
export async function getSignature(signatureHash) {
  try {
    const response = await fetch(`${PACS_API_URL}/api/signatures/${signatureHash}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting signature:', error);
    throw error;
  }
}

/**
 * Get all signatures for a report
 * @param {string} reportId - The report ID
 * @returns {Promise<Object>} Report signatures
 */
export async function getReportSignatures(reportId) {
  try {
    const response = await fetch(`${PACS_API_URL}/api/signatures/report/${reportId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting report signatures:', error);
    throw error;
  }
}
