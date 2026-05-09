/**
 * Secure Storage Service - HIPAA Compliant
 * 
 * This service provides encrypted storage for PHI (Protected Health Information)
 * using sessionStorage with Web Crypto API encryption.
 * 
 * HIPAA 18 PHI Identifiers Protected:
 * 1. Names
 * 2. Geographic subdivisions smaller than state
 * 3. Dates (except year)
 * 4. Phone numbers
 * 5. Email addresses
 * 6. Social Security numbers
 * 7. Medical record numbers
 * 8. Health plan beneficiary numbers
 * 9. Account numbers
 * 10. Certificate/license numbers
 * 11. Vehicle identifiers
 * 12. Device identifiers
 * 13. Web URLs
 * 14. IP addresses
 * 15. Biometric identifiers
 * 16. Full face photos
 * 17. Any unique identifying number
 * 18. Any unique characteristic or code
 */

// Configuration
const ENCRYPTION_CONFIG = {
  algorithm: 'AES-GCM',
  keyLength: 256,
  ivLength: 12, // 96 bits for GCM
  saltLength: 16,
  iterations: 100000,
  hashAlgorithm: 'SHA-256'
};

// Storage keys
const STORAGE_KEYS = {
  ENCRYPTION_KEY: '__secure_storage_key__',
  KEY_TIMESTAMP: '__secure_storage_key_ts__',
  MIGRATION_FLAG: '__phi_migration_complete__',
  BACKUP_PREFIX: '__backup__'
};

// Key lifetime (15 minutes - matches session timeout)
const KEY_LIFETIME = 15 * 60 * 1000;

class SecureStorageService {
  constructor() {
    this.encryptionKey = null;
    this.keyTimestamp = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the secure storage service
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Check if we have an existing key
      const storedKeyData = sessionStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY);
      const storedTimestamp = sessionStorage.getItem(STORAGE_KEYS.KEY_TIMESTAMP);

      if (storedKeyData && storedTimestamp) {
        const timestamp = parseInt(storedTimestamp, 10);
        const now = Date.now();

        // Check if key is still valid
        if (now - timestamp < KEY_LIFETIME) {
          // Import existing key
          const keyData = JSON.parse(storedKeyData);
          this.encryptionKey = await crypto.subtle.importKey(
            'jwk',
            keyData,
            { name: ENCRYPTION_CONFIG.algorithm },
            true,
            ['encrypt', 'decrypt']
          );
          this.keyTimestamp = timestamp;
          this.isInitialized = true;
          return;
        }
      }

      // Generate new key
      await this.generateNewKey();
      this.isInitialized = true;
    } catch (error) {
      console.error('[SecureStorage] Initialization failed:', error);
      throw new Error('Failed to initialize secure storage');
    }
  }

  /**
   * Generate a new encryption key
   */
  async generateNewKey() {
    try {
      // Generate new AES-GCM key
      this.encryptionKey = await crypto.subtle.generateKey(
        {
          name: ENCRYPTION_CONFIG.algorithm,
          length: ENCRYPTION_CONFIG.keyLength
        },
        true,
        ['encrypt', 'decrypt']
      );

      // Export and store key
      const exportedKey = await crypto.subtle.exportKey('jwk', this.encryptionKey);
      sessionStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY, JSON.stringify(exportedKey));
      
      // Store timestamp
      this.keyTimestamp = Date.now();
      sessionStorage.setItem(STORAGE_KEYS.KEY_TIMESTAMP, this.keyTimestamp.toString());

      console.log('[SecureStorage] New encryption key generated');
    } catch (error) {
      console.error('[SecureStorage] Key generation failed:', error);
      throw error;
    }
  }

  /**
   * Check if key needs rotation
   */
  async checkKeyRotation() {
    if (!this.keyTimestamp) {
      return;
    }

    const now = Date.now();
    if (now - this.keyTimestamp >= KEY_LIFETIME) {
      console.warn('[SecureStorage] Encryption key expired, rotating...');
      await this.rotateKey();
    }
  }

  /**
   * Rotate encryption key
   */
  async rotateKey() {
    try {
      // Get all encrypted data
      const allData = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && !key.startsWith('__')) {
          const encrypted = sessionStorage.getItem(key);
          if (encrypted) {
            try {
              allData[key] = await this.decrypt(encrypted);
            } catch (e) {
              console.warn(`[SecureStorage] Failed to decrypt ${key} during rotation:`, e);
            }
          }
        }
      }

      // Generate new key
      await this.generateNewKey();

      // Re-encrypt all data with new key
      for (const [key, value] of Object.entries(allData)) {
        const encrypted = await this.encrypt(value);
        sessionStorage.setItem(key, encrypted);
      }

      console.log('[SecureStorage] Key rotation completed');
    } catch (error) {
      console.error('[SecureStorage] Key rotation failed:', error);
      throw error;
    }
  }

  /**
   * Encrypt data
   */
  async encrypt(data) {
    await this.checkKeyRotation();

    if (!this.encryptionKey) {
      await this.initialize();
    }

    try {
      // Convert data to string
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      const dataBuffer = new TextEncoder().encode(dataString);

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.ivLength));

      // Encrypt
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: ENCRYPTION_CONFIG.algorithm,
          iv: iv
        },
        this.encryptionKey,
        dataBuffer
      );

      // Combine IV + encrypted data
      const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encryptedBuffer), iv.length);

      // Convert to base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('[SecureStorage] Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt data
   */
  async decrypt(encryptedData) {
    if (!this.encryptionKey) {
      await this.initialize();
    }

    try {
      // Decode from base64
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

      // Extract IV and encrypted data
      const iv = combined.slice(0, ENCRYPTION_CONFIG.ivLength);
      const encryptedBuffer = combined.slice(ENCRYPTION_CONFIG.ivLength);

      // Decrypt
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: ENCRYPTION_CONFIG.algorithm,
          iv: iv
        },
        this.encryptionKey,
        encryptedBuffer
      );

      // Convert back to string
      const decryptedString = new TextDecoder().decode(decryptedBuffer);

      // Try to parse as JSON
      try {
        return JSON.parse(decryptedString);
      } catch {
        return decryptedString;
      }
    } catch (error) {
      console.error('[SecureStorage] Decryption failed:', error);
      throw error;
    }
  }

  /**
   * Set item in secure storage
   */
  async setItem(key, value) {
    try {
      const encrypted = await this.encrypt(value);
      sessionStorage.setItem(key, encrypted);
      return true;
    } catch (error) {
      console.error(`[SecureStorage] Failed to set item ${key}:`, error);
      return false;
    }
  }

  /**
   * Get item from secure storage
   */
  async getItem(key) {
    try {
      const encrypted = sessionStorage.getItem(key);
      if (!encrypted) {
        return null;
      }
      return await this.decrypt(encrypted);
    } catch (error) {
      console.error(`[SecureStorage] Failed to get item ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove item from secure storage
   */
  removeItem(key) {
    sessionStorage.removeItem(key);
  }

  /**
   * Clear all secure storage
   */
  clear() {
    sessionStorage.clear();
    this.encryptionKey = null;
    this.keyTimestamp = null;
    this.isInitialized = false;
  }

  /**
   * Check if key exists
   */
  hasItem(key) {
    return sessionStorage.getItem(key) !== null;
  }

  /**
   * Get all keys
   */
  getAllKeys() {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && !key.startsWith('__')) {
        keys.push(key);
      }
    }
    return keys;
  }
}

// Create singleton instance
const secureStorage = new SecureStorageService();

// Export both the class and instance
export { SecureStorageService, secureStorage };
export default secureStorage;
