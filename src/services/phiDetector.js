/**
 * PHI Detector Service
 * 
 * Detects and classifies Protected Health Information (PHI) based on HIPAA's 18 identifiers
 * 
 * HIPAA 18 PHI Identifiers:
 * 1. Names
 * 2. Geographic subdivisions smaller than state
 * 3. Dates (except year)
 * 4. Phone numbers
 * 5. Email addresses
 * 6. Social Security numbers
 * 7. Medical record numbers (MRN)
 * 8. Health plan beneficiary numbers
 * 9. Account numbers
 * 10. Certificate/license numbers
 * 11. Vehicle identifiers and serial numbers
 * 12. Device identifiers and serial numbers
 * 13. Web URLs
 * 14. IP addresses
 * 15. Biometric identifiers (fingerprints, retinal scans)
 * 16. Full face photographic images
 * 17. Any other unique identifying number, characteristic, or code
 * 18. Patient-specific data (diagnosis, treatment, medications)
 */

// Entities that contain PHI
const PHI_ENTITIES = {
  // High-risk PHI entities (must be encrypted)
  HIGH_RISK: [
    'patients',
    'orders',
    'worklist',
    'studies',
    'reports',
    'measurements',
    'signatures',
    'auditLogs',
    'users' // Contains email, phone, etc.
  ],
  
  // Medium-risk entities (may contain PHI)
  MEDIUM_RISK: [
    'doctors', // May contain personal info
    'nurses',  // May contain personal info
    'notifications' // May contain patient names
  ],
  
  // Low-risk entities (configuration, no PHI)
  LOW_RISK: [
    'modalities',
    'dicomNodes',
    'settings',
    'app.config',
    'api.registry.v1',
    'accession.config',
    'hl7_config',
    'mwl_config',
    'companyProfile',
    'dataStorageMode',
    'serverDataConfig'
  ]
};

// PHI field patterns
const PHI_FIELD_PATTERNS = {
  // Names
  name: /^(patient_?name|full_?name|first_?name|last_?name|middle_?name|name)$/i,
  
  // Dates (except year)
  date: /^(birth_?date|dob|date_?of_?birth|admission_?date|discharge_?date|exam_?date|study_?date|scheduled_?date|created_?at|updated_?at)$/i,
  
  // Contact information
  phone: /^(phone|telephone|mobile|cell|contact_?number)$/i,
  email: /^(email|e_?mail|contact_?email)$/i,
  
  // Identifiers
  ssn: /^(ssn|social_?security|national_?id)$/i,
  mrn: /^(mrn|medical_?record_?number|patient_?id|patient_?mrn)$/i,
  account: /^(account_?number|account_?id|billing_?id)$/i,
  
  // Geographic
  address: /^(address|street|city|zip|postal|location|residence)$/i,
  
  // Medical data
  diagnosis: /^(diagnosis|icd|condition|disease|illness)$/i,
  treatment: /^(treatment|procedure|medication|prescription|therapy)$/i,
  
  // Biometric
  biometric: /^(fingerprint|retina|iris|face_?photo|photo|image)$/i,
  
  // URLs and IPs
  url: /^(url|link|website|web_?address)$/i,
  ip: /^(ip_?address|ip|remote_?addr)$/i
};

class PHIDetectorService {
  /**
   * Check if an entity name contains PHI
   */
  isPhiEntity(entityName) {
    return PHI_ENTITIES.HIGH_RISK.includes(entityName) || 
           PHI_ENTITIES.MEDIUM_RISK.includes(entityName);
  }

  /**
   * Get risk level for an entity
   */
  getEntityRiskLevel(entityName) {
    if (PHI_ENTITIES.HIGH_RISK.includes(entityName)) {
      return 'HIGH';
    }
    if (PHI_ENTITIES.MEDIUM_RISK.includes(entityName)) {
      return 'MEDIUM';
    }
    if (PHI_ENTITIES.LOW_RISK.includes(entityName)) {
      return 'LOW';
    }
    return 'UNKNOWN';
  }

  /**
   * Check if a field name indicates PHI
   */
  isPhiField(fieldName) {
    if (!fieldName) return false;
    
    for (const [category, pattern] of Object.entries(PHI_FIELD_PATTERNS)) {
      if (pattern.test(fieldName)) {
        return { isPhi: true, category };
      }
    }
    
    return { isPhi: false, category: null };
  }

  /**
   * Scan an object for PHI fields
   */
  scanObjectForPhi(obj, path = '') {
    const phiFields = [];
    
    if (!obj || typeof obj !== 'object') {
      return phiFields;
    }

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      const fieldCheck = this.isPhiField(key);
      
      if (fieldCheck.isPhi) {
        phiFields.push({
          path: currentPath,
          field: key,
          category: fieldCheck.category,
          value: this.maskValue(value)
        });
      }

      // Recursively scan nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        phiFields.push(...this.scanObjectForPhi(value, currentPath));
      }

      // Scan arrays
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (item && typeof item === 'object') {
            phiFields.push(...this.scanObjectForPhi(item, `${currentPath}[${index}]`));
          }
        });
      }
    }

    return phiFields;
  }

  /**
   * Mask a value for logging
   */
  maskValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const str = String(value);
    if (str.length <= 4) {
      return '***';
    }

    return str.substring(0, 2) + '***' + str.substring(str.length - 2);
  }

  /**
   * Analyze localStorage for PHI
   */
  analyzeLocalStorage() {
    const analysis = {
      totalKeys: 0,
      phiKeys: [],
      nonPhiKeys: [],
      riskSummary: {
        HIGH: [],
        MEDIUM: [],
        LOW: [],
        UNKNOWN: []
      }
    };

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      analysis.totalKeys++;
      const riskLevel = this.getEntityRiskLevel(key);
      
      const keyAnalysis = {
        key,
        riskLevel,
        isPhi: this.isPhiEntity(key),
        size: localStorage.getItem(key)?.length || 0
      };

      if (keyAnalysis.isPhi) {
        analysis.phiKeys.push(keyAnalysis);
      } else {
        analysis.nonPhiKeys.push(keyAnalysis);
      }

      analysis.riskSummary[riskLevel].push(key);
    }

    return analysis;
  }

  /**
   * Get all PHI entities from localStorage
   */
  getPhiEntitiesFromLocalStorage() {
    const phiData = {};

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (this.isPhiEntity(key)) {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            phiData[key] = JSON.parse(data);
          }
        } catch (error) {
          console.error(`[PHIDetector] Failed to parse ${key}:`, error);
        }
      }
    }

    return phiData;
  }

  /**
   * Generate PHI compliance report
   */
  generateComplianceReport() {
    const analysis = this.analyzeLocalStorage();
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalKeys: analysis.totalKeys,
        phiKeysCount: analysis.phiKeys.length,
        nonPhiKeysCount: analysis.nonPhiKeys.length,
        complianceStatus: analysis.phiKeys.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT'
      },
      violations: analysis.phiKeys.map(item => ({
        key: item.key,
        riskLevel: item.riskLevel,
        size: item.size,
        recommendation: 'Move to encrypted sessionStorage'
      })),
      riskBreakdown: {
        HIGH: analysis.riskSummary.HIGH.length,
        MEDIUM: analysis.riskSummary.MEDIUM.length,
        LOW: analysis.riskSummary.LOW.length,
        UNKNOWN: analysis.riskSummary.UNKNOWN.length
      },
      recommendations: this.generateRecommendations(analysis)
    };

    return report;
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.phiKeys.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'MIGRATE_PHI_TO_SECURE_STORAGE',
        description: `Found ${analysis.phiKeys.length} PHI entities in localStorage`,
        entities: analysis.phiKeys.map(k => k.key)
      });
    }

    if (analysis.riskSummary.HIGH.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'ENCRYPT_HIGH_RISK_DATA',
        description: 'High-risk PHI entities must be encrypted',
        entities: analysis.riskSummary.HIGH
      });
    }

    if (analysis.riskSummary.MEDIUM.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'REVIEW_MEDIUM_RISK_DATA',
        description: 'Review medium-risk entities for PHI content',
        entities: analysis.riskSummary.MEDIUM
      });
    }

    if (analysis.riskSummary.UNKNOWN.length > 0) {
      recommendations.push({
        priority: 'LOW',
        action: 'CLASSIFY_UNKNOWN_DATA',
        description: 'Classify unknown entities',
        entities: analysis.riskSummary.UNKNOWN
      });
    }

    return recommendations;
  }

  /**
   * Log PHI access for audit trail
   */
  logPhiAccess(entity, action, userId = 'unknown') {
    if (!this.isPhiEntity(entity)) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      entity,
      action,
      userId,
      riskLevel: this.getEntityRiskLevel(entity),
      phi_accessed: true
    };

    console.log('[PHI ACCESS]', logEntry);

    // Store in audit log (should be sent to backend)
    try {
      const auditLogs = JSON.parse(sessionStorage.getItem('__phi_audit__') || '[]');
      auditLogs.push(logEntry);
      
      // Keep only last 100 entries
      if (auditLogs.length > 100) {
        auditLogs.shift();
      }
      
      sessionStorage.setItem('__phi_audit__', JSON.stringify(auditLogs));
    } catch (error) {
      console.error('[PHIDetector] Failed to log PHI access:', error);
    }
  }

  /**
   * Get PHI audit logs
   */
  getPhiAuditLogs() {
    try {
      return JSON.parse(sessionStorage.getItem('__phi_audit__') || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Clear PHI audit logs
   */
  clearPhiAuditLogs() {
    sessionStorage.removeItem('__phi_audit__');
  }
}

// Create singleton instance
const phiDetector = new PHIDetectorService();

// Export
export { PHIDetectorService, PHI_ENTITIES, PHI_FIELD_PATTERNS };
export default phiDetector;
