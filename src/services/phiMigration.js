/**
 * PHI Migration Service
 * 
 * Migrates PHI data from localStorage to encrypted sessionStorage
 * with backup and rollback capabilities
 */

import secureStorage from './secureStorage';
import phiDetector from './phiDetector';

// Migration configuration
const MIGRATION_CONFIG = {
  BACKUP_KEY: '__phi_migration_backup__',
  STATUS_KEY: '__phi_migration_status__',
  VERSION_KEY: '__phi_migration_version__',
  CURRENT_VERSION: '1.0.0',
  BATCH_SIZE: 10, // Process 10 entities at a time
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000 // 1 second
};

// Migration status
const MIGRATION_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK'
};

class PHIMigrationService {
  constructor() {
    this.migrationLog = [];
    this.backupData = null;
  }

  /**
   * Get current migration status
   */
  getMigrationStatus() {
    try {
      const status = localStorage.getItem(MIGRATION_CONFIG.STATUS_KEY);
      return status || MIGRATION_STATUS.NOT_STARTED;
    } catch {
      return MIGRATION_STATUS.NOT_STARTED;
    }
  }

  /**
   * Set migration status
   */
  setMigrationStatus(status) {
    try {
      localStorage.setItem(MIGRATION_CONFIG.STATUS_KEY, status);
      this.log('info', `Migration status changed to: ${status}`);
    } catch (error) {
      this.log('error', `Failed to set migration status: ${error.message}`);
    }
  }

  /**
   * Check if migration is needed
   */
  isMigrationNeeded() {
    const status = this.getMigrationStatus();
    if (status === MIGRATION_STATUS.COMPLETED) {
      return false;
    }

    // Check if there's PHI in localStorage
    const analysis = phiDetector.analyzeLocalStorage();
    return analysis.phiKeys.length > 0;
  }

  /**
   * Create backup of current localStorage data
   */
  async createBackup() {
    this.log('info', 'Creating backup of localStorage data...');
    
    try {
      const backup = {
        timestamp: new Date().toISOString(),
        version: MIGRATION_CONFIG.CURRENT_VERSION,
        data: {}
      };

      // Backup all PHI entities
      const phiData = phiDetector.getPhiEntitiesFromLocalStorage();
      
      for (const [key, value] of Object.entries(phiData)) {
        backup.data[key] = value;
        this.log('info', `Backed up: ${key} (${JSON.stringify(value).length} bytes)`);
      }

      // Store backup in localStorage (temporary)
      localStorage.setItem(
        MIGRATION_CONFIG.BACKUP_KEY,
        JSON.stringify(backup)
      );

      this.backupData = backup;
      this.log('success', `Backup created successfully (${Object.keys(backup.data).length} entities)`);
      
      return backup;
    } catch (error) {
      this.log('error', `Backup creation failed: ${error.message}`);
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Migrate a single entity
   */
  async migrateEntity(key, data, retryCount = 0) {
    try {
      // Encrypt and store in sessionStorage
      await secureStorage.setItem(key, data);
      
      // Verify migration
      const retrieved = await secureStorage.getItem(key);
      if (!retrieved) {
        throw new Error('Verification failed: data not found after migration');
      }

      // Compare data (basic check)
      const originalSize = JSON.stringify(data).length;
      const retrievedSize = JSON.stringify(retrieved).length;
      
      if (originalSize !== retrievedSize) {
        throw new Error(`Verification failed: size mismatch (${originalSize} vs ${retrievedSize})`);
      }

      this.log('success', `Migrated: ${key}`);
      return true;
    } catch (error) {
      if (retryCount < MIGRATION_CONFIG.RETRY_ATTEMPTS) {
        this.log('warn', `Migration failed for ${key}, retrying (${retryCount + 1}/${MIGRATION_CONFIG.RETRY_ATTEMPTS})...`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, MIGRATION_CONFIG.RETRY_DELAY));
        
        return this.migrateEntity(key, data, retryCount + 1);
      }

      this.log('error', `Migration failed for ${key} after ${MIGRATION_CONFIG.RETRY_ATTEMPTS} attempts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Perform migration
   */
  async migrate(options = {}) {
    const {
      dryRun = false,
      skipBackup = false,
      onProgress = null
    } = options;

    this.log('info', `Starting PHI migration (dryRun: ${dryRun})...`);
    this.migrationLog = [];

    try {
      // Check if migration is needed
      if (!this.isMigrationNeeded()) {
        this.log('info', 'Migration not needed - no PHI found in localStorage');
        return {
          success: true,
          message: 'Migration not needed',
          migrated: 0,
          failed: 0,
          failedEntities: [],
          dryRun,
          log: this.migrationLog
        };
      }

      // Set status
      if (!dryRun) {
        this.setMigrationStatus(MIGRATION_STATUS.IN_PROGRESS);
      }

      // Create backup
      if (!skipBackup && !dryRun) {
        await this.createBackup();
      }

      // Get PHI entities
      const phiData = phiDetector.getPhiEntitiesFromLocalStorage();
      const entities = Object.entries(phiData);
      const totalEntities = entities.length;

      this.log('info', `Found ${totalEntities} PHI entities to migrate`);

      // Initialize secure storage
      await secureStorage.initialize();

      // Migrate entities in batches
      let migratedCount = 0;
      let failedCount = 0;
      const failedEntities = [];

      for (let i = 0; i < entities.length; i += MIGRATION_CONFIG.BATCH_SIZE) {
        const batch = entities.slice(i, i + MIGRATION_CONFIG.BATCH_SIZE);
        
        for (const [key, data] of batch) {
          try {
            if (!dryRun) {
              await this.migrateEntity(key, data);
              
              // Remove from localStorage after successful migration
              localStorage.removeItem(key);
              this.log('info', `Removed from localStorage: ${key}`);
            } else {
              this.log('info', `[DRY RUN] Would migrate: ${key}`);
            }

            migratedCount++;
            
            // Report progress
            if (onProgress) {
              onProgress({
                current: migratedCount,
                total: totalEntities,
                percentage: Math.round((migratedCount / totalEntities) * 100),
                currentEntity: key
              });
            }
          } catch (error) {
            failedCount++;
            failedEntities.push({ key, error: error.message });
            this.log('error', `Failed to migrate ${key}: ${error.message}`);
          }
        }

        // Small delay between batches
        if (i + MIGRATION_CONFIG.BATCH_SIZE < entities.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Final status
      const success = failedCount === 0;
      
      if (!dryRun) {
        this.setMigrationStatus(success ? MIGRATION_STATUS.COMPLETED : MIGRATION_STATUS.FAILED);
        
        // Store migration version
        localStorage.setItem(MIGRATION_CONFIG.VERSION_KEY, MIGRATION_CONFIG.CURRENT_VERSION);
      }

      const result = {
        success,
        migrated: migratedCount,
        failed: failedCount,
        failedEntities,
        dryRun,
        log: this.migrationLog
      };

      this.log('success', `Migration completed: ${migratedCount} migrated, ${failedCount} failed`);
      
      return result;
    } catch (error) {
      this.log('error', `Migration failed: ${error.message}`);
      
      if (!dryRun) {
        this.setMigrationStatus(MIGRATION_STATUS.FAILED);
      }

      throw error;
    }
  }

  /**
   * Rollback migration
   */
  async rollback() {
    this.log('info', 'Starting migration rollback...');

    try {
      // Get backup
      const backupJson = localStorage.getItem(MIGRATION_CONFIG.BACKUP_KEY);
      if (!backupJson) {
        throw new Error('No backup found - cannot rollback');
      }

      const backup = JSON.parse(backupJson);
      this.log('info', `Found backup from ${backup.timestamp}`);

      // Restore data to localStorage
      let restoredCount = 0;
      for (const [key, value] of Object.entries(backup.data)) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
          
          // Remove from sessionStorage
          secureStorage.removeItem(key);
          
          restoredCount++;
          this.log('success', `Restored: ${key}`);
        } catch (error) {
          this.log('error', `Failed to restore ${key}: ${error.message}`);
        }
      }

      // Update status
      this.setMigrationStatus(MIGRATION_STATUS.ROLLED_BACK);

      this.log('success', `Rollback completed: ${restoredCount} entities restored`);

      return {
        success: true,
        restored: restoredCount,
        log: this.migrationLog
      };
    } catch (error) {
      this.log('error', `Rollback failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up backup after successful migration
   */
  cleanupBackup() {
    try {
      localStorage.removeItem(MIGRATION_CONFIG.BACKUP_KEY);
      this.log('info', 'Backup cleaned up');
      return true;
    } catch (error) {
      this.log('error', `Failed to cleanup backup: ${error.message}`);
      return false;
    }
  }

  /**
   * Get migration report
   */
  getMigrationReport() {
    const status = this.getMigrationStatus();
    const version = localStorage.getItem(MIGRATION_CONFIG.VERSION_KEY);
    const hasBackup = localStorage.getItem(MIGRATION_CONFIG.BACKUP_KEY) !== null;
    const analysis = phiDetector.analyzeLocalStorage();

    return {
      status,
      version,
      hasBackup,
      phiInLocalStorage: analysis.phiKeys.length,
      phiEntities: analysis.phiKeys.map(k => k.key),
      migrationNeeded: this.isMigrationNeeded(),
      log: this.migrationLog
    };
  }

  /**
   * Verify migration integrity
   */
  async verifyMigration() {
    this.log('info', 'Verifying migration integrity...');

    try {
      // Check if there's still PHI in localStorage
      const analysis = phiDetector.analyzeLocalStorage();
      
      if (analysis.phiKeys.length > 0) {
        this.log('error', `Verification failed: ${analysis.phiKeys.length} PHI entities still in localStorage`);
        return {
          success: false,
          message: 'PHI still found in localStorage',
          entities: analysis.phiKeys.map(k => k.key)
        };
      }

      // Check if backup exists
      const hasBackup = localStorage.getItem(MIGRATION_CONFIG.BACKUP_KEY) !== null;
      if (!hasBackup) {
        this.log('warn', 'No backup found - cannot verify data integrity');
      }

      // Check sessionStorage
      const secureKeys = secureStorage.getAllKeys();
      this.log('info', `Found ${secureKeys.length} entities in secure storage`);

      this.log('success', 'Migration verification passed');

      return {
        success: true,
        message: 'Migration verified successfully',
        secureStorageKeys: secureKeys.length,
        localStoragePhiKeys: 0
      };
    } catch (error) {
      this.log('error', `Verification failed: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Log migration event
   */
  log(level, message) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    this.migrationLog.push(logEntry);

    // Console output with color
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m'    // Red
    };

    const reset = '\x1b[0m';
    const color = colors[level] || '';

    console.log(`${color}[PHI Migration] ${message}${reset}`);
  }

  /**
   * Get migration logs
   */
  getMigrationLogs() {
    return this.migrationLog;
  }

  /**
   * Export migration logs
   */
  exportLogs() {
    const report = this.getMigrationReport();
    const logs = this.getMigrationLogs();

    const exportData = {
      report,
      logs,
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(exportData, null, 2);
  }
}

// Create singleton instance
const phiMigration = new PHIMigrationService();

// Export
export { PHIMigrationService, MIGRATION_STATUS, MIGRATION_CONFIG };
export default phiMigration;
