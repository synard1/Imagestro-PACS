/**
 * Mappings Tab Component
 * 
 * Displays and manages unified mappings for external systems including:
 * - Procedure mappings (SIMRS procedure code → PACS procedure code)
 * - Doctor mappings (SIMRS doctor code → PACS doctor ID)
 * - Operator mappings (PACS user → SIMRS operator)
 * 
 * Features:
 * - Sub-tabs for Procedures, Doctors, Operators
 * - Import from JSON button
 * - Export to JSON button
 * 
 * Requirements: 4.1, 5.1, 6.1
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useServiceMode, useService } from '../../../hooks/useServiceMode';
import * as mockMappingService from '../../../services/mock/mockMappingService';
import * as realMappingService from '../../../services/unifiedMappingService';
import ProcedureMappingTable from '../components/ProcedureMappingTable';
import DoctorMappingTable from '../components/DoctorMappingTable';
import OperatorMappingTable from '../components/OperatorMappingTable';
import { logger } from '../../../utils/logger';

// Sub-tab definitions
const SUB_TABS = {
  PROCEDURES: 'procedures',
  DOCTORS: 'doctors',
  OPERATORS: 'operators',
};

/**
 * MappingsTab Component
 * 
 * @param {Object} props - Component props
 * @param {string} props.systemId - External system ID
 * @param {boolean} props.disabled - Whether the tab is disabled
 */
export default function MappingsTab({ systemId, disabled = false }) {
  const { isMockMode, isUsingFallback } = useServiceMode();
  const [activeSubTab, setActiveSubTab] = useState(SUB_TABS.PROCEDURES);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Get mapping service based on mode - use real service when available
  const mappingService = useService(mockMappingService, realMappingService);

  // Handle export to JSON
  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);

    try {
      logger.info('[MappingsTab]', 'Exporting mappings', { systemId, type: activeSubTab });

      let data;
      let filename;

      switch (activeSubTab) {
        case SUB_TABS.PROCEDURES:
          data = await mappingService.exportProcedureMappings(systemId);
          filename = `procedure-mappings-${systemId}.json`;
          break;
        case SUB_TABS.DOCTORS:
          // Export doctor mappings
          const doctorResult = await mappingService.listDoctorMappings(systemId, { pageSize: 1000 });
          data = doctorResult.items;
          filename = `doctor-mappings-${systemId}.json`;
          break;
        case SUB_TABS.OPERATORS:
          // Export operator mappings
          const operatorResult = await mappingService.listOperatorMappings(systemId, { pageSize: 1000 });
          data = operatorResult.items;
          filename = `operator-mappings-${systemId}.json`;
          break;
        default:
          throw new Error('Unknown mapping type');
      }

      // Create and download file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      logger.info('[MappingsTab]', 'Export completed', { count: data.length });
    } catch (err) {
      setError(err.message || 'Failed to export mappings');
      logger.error('[MappingsTab]', 'Export failed', err);
    } finally {
      setExporting(false);
    }
  }, [systemId, activeSubTab, mappingService]);

  // Handle import from JSON
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setImportResult(null);

    try {
      logger.info('[MappingsTab]', 'Importing mappings', { systemId, type: activeSubTab, filename: file.name });

      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        throw new Error('Invalid file format: expected an array of mappings');
      }

      let result;

      switch (activeSubTab) {
        case SUB_TABS.PROCEDURES:
          result = await mappingService.bulkImportProcedureMappings(systemId, data);
          break;
        case SUB_TABS.DOCTORS:
          // Bulk import doctor mappings
          result = { total: data.length, successful: 0, failed: 0, errors: [] };
          for (const mapping of data) {
            try {
              await mappingService.createDoctorMapping(systemId, mapping);
              result.successful++;
            } catch (err) {
              result.failed++;
              result.errors.push({ code: mapping.external_code, error: err.message });
            }
          }
          break;
        case SUB_TABS.OPERATORS:
          // Bulk import operator mappings
          result = { total: data.length, successful: 0, failed: 0, errors: [] };
          for (const mapping of data) {
            try {
              await mappingService.createOperatorMapping(systemId, mapping);
              result.successful++;
            } catch (err) {
              result.failed++;
              result.errors.push({ code: mapping.external_operator_code, error: err.message });
            }
          }
          break;
        default:
          throw new Error('Unknown mapping type');
      }

      setImportResult(result);
      logger.info('[MappingsTab]', 'Import completed', result);

      // Trigger refresh by changing a key (handled by child components)
      window.dispatchEvent(new CustomEvent('mappings-imported', { detail: { systemId, type: activeSubTab } }));
    } catch (err) {
      setError(err.message || 'Failed to import mappings');
      logger.error('[MappingsTab]', 'Import failed', err);
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [systemId, activeSubTab, mappingService]);

  // Get sub-tab label
  const getSubTabLabel = (tab) => {
    switch (tab) {
      case SUB_TABS.PROCEDURES:
        return 'Procedures';
      case SUB_TABS.DOCTORS:
        return 'Doctors';
      case SUB_TABS.OPERATORS:
        return 'Operators';
      default:
        return tab;
    }
  };

  return (
    <div className="space-y-4">
      {/* Mock Mode Indicator */}
      {isMockMode && (
        <div className={`p-3 rounded-lg ${isUsingFallback
          ? 'bg-yellow-50 border border-yellow-200'
          : 'bg-blue-50 border border-blue-200'
          }`}>
          <p className={`text-sm ${isUsingFallback ? 'text-yellow-800' : 'text-blue-800'}`}>
            <span className="font-medium">{isUsingFallback ? 'Fallback Mode:' : 'Mock Mode:'}</span>{' '}
            {isUsingFallback
              ? 'Using simulated mapping data (backend unavailable).'
              : 'Using simulated mapping data.'}
          </p>
        </div>
      )}

      {/* Enhanced Mappings Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">
              💡 Enhanced Mapping Management Available
            </p>
            <p className="text-xs text-blue-700 mt-1">
              For a better experience with cross-system views and advanced features, visit the{' '}
              <a
                href={`/mappings-enhanced?system=${systemId}&type=procedures`}
                className="underline font-medium hover:text-blue-900"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = `/mappings-enhanced?system=${systemId}&type=procedures`;
                }}
              >
                unified Mappings page
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Header with Import/Export buttons */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {Object.values(SUB_TABS).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveSubTab(tab);
                setImportResult(null);
                setError(null);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition ${activeSubTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {getSubTabLabel(tab)}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {/* Refresh Button */}
          <button
            onClick={() => {
              // Trigger refresh by dispatching event
              window.dispatchEvent(new CustomEvent('mappings-refresh', { detail: { systemId, type: activeSubTab } }));
            }}
            disabled={disabled}
            className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center gap-2"
            title="Refresh mappings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>

          {/* Import Button */}
          <button
            onClick={handleImportClick}
            disabled={disabled || importing}
            className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {importing ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                Importing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import from JSON
              </>
            )}
          </button>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={disabled || exporting}
            className="px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {exporting ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export to JSON
              </>
            )}
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div className={`p-4 rounded-lg border ${importResult.failed === 0
          ? 'bg-green-50 border-green-200'
          : 'bg-yellow-50 border-yellow-200'
          }`}>
          <p className={`font-medium ${importResult.failed === 0 ? 'text-green-800' : 'text-yellow-800'}`}>
            Import completed: {importResult.successful} successful, {importResult.failed} failed
          </p>
          {importResult.errors && importResult.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-yellow-700 font-medium">Errors:</p>
              <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside max-h-32 overflow-y-auto">
                {importResult.errors.slice(0, 10).map((err, index) => (
                  <li key={index}>
                    {err.code}: {err.error}
                  </li>
                ))}
                {importResult.errors.length > 10 && (
                  <li>...and {importResult.errors.length - 10} more errors</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Sub-tab Content */}
      <div className="bg-white rounded-lg shadow">
        {activeSubTab === SUB_TABS.PROCEDURES && (
          <ProcedureMappingTable systemId={systemId} disabled={disabled} />
        )}
        {activeSubTab === SUB_TABS.DOCTORS && (
          <DoctorMappingTable systemId={systemId} disabled={disabled} />
        )}
        {activeSubTab === SUB_TABS.OPERATORS && (
          <OperatorMappingTable systemId={systemId} disabled={disabled} />
        )}
      </div>
    </div>
  );
}

MappingsTab.propTypes = {
  systemId: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
};
