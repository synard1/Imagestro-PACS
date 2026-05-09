/**
 * PHI Migration UI Component
 * 
 * Provides user interface for PHI migration process
 * with progress tracking, rollback, and verification
 */

import React, { useState, useEffect } from 'react';
import phiMigration, { MIGRATION_STATUS } from '../services/phiMigration';
import phiDetector from '../services/phiDetector';

const PHIMigrationUI = () => {
    const [migrationStatus, setMigrationStatus] = useState(MIGRATION_STATUS.NOT_STARTED);
    const [migrationReport, setMigrationReport] = useState(null);
    const [complianceReport, setComplianceReport] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
    const [logs, setLogs] = useState([]);
    const [showLogs, setShowLogs] = useState(false);

    useEffect(() => {
        loadStatus();
    }, []);

    const loadStatus = () => {
        const status = phiMigration.getMigrationStatus();
        const report = phiMigration.getMigrationReport();
        const compliance = phiDetector.generateComplianceReport();

        setMigrationStatus(status);
        setMigrationReport(report);
        setComplianceReport(compliance);
    };

    const handleMigrate = async (dryRun = false) => {
        setIsProcessing(true);
        setLogs([]);
        setProgress({ current: 0, total: 0, percentage: 0 });

        try {
            const result = await phiMigration.migrate({
                dryRun,
                onProgress: (prog) => {
                    setProgress(prog);
                }
            });

            // Safely set logs with fallback
            setLogs(result.log || []);
            loadStatus();

            if (result.success) {
                alert(`Migration ${dryRun ? 'simulation' : ''} completed successfully!\n\nMigrated: ${result.migrated || 0} entities\nFailed: ${result.failed || 0} entities`);
            } else {
                alert(`Migration ${dryRun ? 'simulation' : ''} completed with errors.\n\nMigrated: ${result.migrated || 0} entities\nFailed: ${result.failed || 0} entities\n\nCheck logs for details.`);
            }
        } catch (error) {
            alert(`Migration failed: ${error.message}`);
            console.error('Migration error:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRollback = async () => {
        if (!confirm('Are you sure you want to rollback the migration? This will restore PHI to localStorage.')) {
            return;
        }

        setIsProcessing(true);
        setLogs([]);

        try {
            const result = await phiMigration.rollback();
            setLogs(result.log);
            loadStatus();

            alert(`Rollback completed successfully!\n\nRestored: ${result.restored} entities`);
        } catch (error) {
            alert(`Rollback failed: ${error.message}`);
            console.error('Rollback error:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleVerify = async () => {
        setIsProcessing(true);

        try {
            const result = await phiMigration.verifyMigration();

            if (result.success) {
                alert(`Verification passed!\n\n${result.message}\n\nSecure storage keys: ${result.secureStorageKeys}\nLocalStorage PHI keys: ${result.localStoragePhiKeys}`);
            } else {
                alert(`Verification failed!\n\n${result.message}\n\nEntities still in localStorage:\n${result.entities?.join('\n')}`);
            }

            loadStatus();
        } catch (error) {
            alert(`Verification failed: ${error.message}`);
            console.error('Verification error:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCleanupBackup = () => {
        if (!confirm('Are you sure you want to delete the backup? This cannot be undone.')) {
            return;
        }

        const success = phiMigration.cleanupBackup();
        if (success) {
            alert('Backup cleaned up successfully');
            loadStatus();
        } else {
            alert('Failed to cleanup backup');
        }
    };

    const exportLogs = () => {
        const logsData = phiMigration.exportLogs();
        const blob = new Blob([logsData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `phi-migration-logs-${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case MIGRATION_STATUS.COMPLETED:
                return 'text-green-600 bg-green-50';
            case MIGRATION_STATUS.IN_PROGRESS:
                return 'text-blue-600 bg-blue-50';
            case MIGRATION_STATUS.FAILED:
                return 'text-red-600 bg-red-50';
            case MIGRATION_STATUS.ROLLED_BACK:
                return 'text-yellow-600 bg-yellow-50';
            default:
                return 'text-gray-600 bg-gray-50';
        }
    };

    const getComplianceColor = (status) => {
        return status === 'COMPLIANT' ? 'text-green-600' : 'text-red-600';
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6">
                <h1 className="text-2xl font-bold mb-6">PHI Migration Tool</h1>

                {/* Status Card */}
                <div className="mb-6 p-4 border rounded-lg">
                    <h2 className="text-lg font-semibold mb-3">Migration Status</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-gray-600">Current Status:</p>
                            <p className={`text-lg font-semibold px-3 py-1 rounded inline-block ${getStatusColor(migrationStatus)}`}>
                                {migrationStatus}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Migration Version:</p>
                            <p className="text-lg font-semibold">{migrationReport?.version || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Backup Available:</p>
                            <p className="text-lg font-semibold">{migrationReport?.hasBackup ? '✅ Yes' : '❌ No'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Migration Needed:</p>
                            <p className="text-lg font-semibold">{migrationReport?.migrationNeeded ? '⚠️ Yes' : '✅ No'}</p>
                        </div>
                    </div>
                </div>

                {/* Compliance Report */}
                {complianceReport && (
                    <div className="mb-6 p-4 border rounded-lg">
                        <h2 className="text-lg font-semibold mb-3">HIPAA Compliance Status</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-gray-600">Compliance Status:</p>
                                <p className={`text-lg font-semibold ${getComplianceColor(complianceReport.summary.complianceStatus)}`}>
                                    {complianceReport.summary.complianceStatus}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">PHI in localStorage:</p>
                                <p className="text-lg font-semibold text-red-600">{complianceReport.summary.phiKeysCount}</p>
                            </div>
                        </div>

                        {complianceReport.violations.length > 0 && (
                            <div className="mt-4">
                                <p className="text-sm font-semibold text-red-600 mb-2">⚠️ Violations Found:</p>
                                <ul className="text-sm space-y-1">
                                    {complianceReport.violations.map((v, i) => (
                                        <li key={i} className="text-red-600">
                                            • {v.key} ({v.riskLevel}) - {v.size} bytes
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Progress Bar */}
                {isProcessing && progress.total > 0 && (
                    <div className="mb-6 p-4 border rounded-lg bg-blue-50">
                        <h3 className="text-sm font-semibold mb-2">Migration Progress</h3>
                        <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                            <div
                                className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                                style={{ width: `${progress.percentage}%` }}
                            />
                        </div>
                        <p className="text-sm text-gray-600">
                            {progress.current} / {progress.total} ({progress.percentage}%)
                            {progress.currentEntity && ` - ${progress.currentEntity}`}
                        </p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="mb-6 space-y-3">
                    <h2 className="text-lg font-semibold mb-3">Actions</h2>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => handleMigrate(true)}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            🔍 Dry Run (Simulate)
                        </button>

                        <button
                            onClick={() => handleMigrate(false)}
                            disabled={isProcessing || !migrationReport?.migrationNeeded}
                            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            ▶️ Start Migration
                        </button>

                        <button
                            onClick={handleVerify}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            ✓ Verify Migration
                        </button>

                        <button
                            onClick={handleRollback}
                            disabled={isProcessing || !migrationReport?.hasBackup}
                            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            ↩️ Rollback
                        </button>

                        <button
                            onClick={handleCleanupBackup}
                            disabled={!migrationReport?.hasBackup}
                            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            🗑️ Cleanup Backup
                        </button>

                        <button
                            onClick={exportLogs}
                            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                        >
                            📥 Export Logs
                        </button>
                    </div>
                </div>

                {/* Logs Section */}
                <div className="mb-6">
                    <button
                        onClick={() => setShowLogs(!showLogs)}
                        className="text-lg font-semibold mb-3 flex items-center gap-2 hover:text-blue-600"
                    >
                        {showLogs ? '▼' : '▶'} Migration Logs ({logs?.length || 0})
                    </button>


                    {showLogs && (
                        <div className="bg-gray-900 text-gray-100 p-4 rounded-lg max-h-96 overflow-y-auto font-mono text-sm">
                            {!logs || logs.length === 0 ? (
                                <p className="text-gray-400">No logs available</p>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className={`mb-1 ${log.level === 'error' ? 'text-red-400' :
                                        log.level === 'warn' ? 'text-yellow-400' :
                                            log.level === 'success' ? 'text-green-400' :
                                                'text-gray-300'
                                        }`}>
                                        [{log.timestamp}] [{log.level.toUpperCase()}] {log.message}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Help Section */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="font-semibold mb-2">ℹ️ Migration Guide</h3>
                    <ol className="text-sm space-y-1 list-decimal list-inside">
                        <li><strong>Dry Run:</strong> Simulate migration without making changes</li>
                        <li><strong>Start Migration:</strong> Migrate PHI from localStorage to encrypted sessionStorage</li>
                        <li><strong>Verify:</strong> Check if migration was successful</li>
                        <li><strong>Rollback:</strong> Restore data from backup if something went wrong</li>
                        <li><strong>Cleanup Backup:</strong> Remove backup after successful migration</li>
                    </ol>
                    <p className="text-sm mt-2 text-red-600 font-semibold">
                        ⚠️ Important: Always run Dry Run first and verify before cleanup!
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PHIMigrationUI;
