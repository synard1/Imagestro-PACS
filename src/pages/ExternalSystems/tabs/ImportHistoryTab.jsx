/**
 * Import History Tab Component
 * 
 * Displays import history with:
 * - Date range filter
 * - Status filter (All, Success, Failed, Partial)
 * - Search (order number, patient name)
 * - Table: Timestamp, Order No, Patient, Procedure, Status, Operator, Actions
 * - Expandable row for error messages on failed imports
 * - "Retry" button for failed imports
 * - "View Details" modal
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useServiceMode, useService } from '../../../hooks/useServiceMode';
import * as mockImportService from '../../../services/mock/mockImportService';
import * as realImportService from '../../../services/unifiedImportService';
import { logger } from '../../../utils/logger';

// Import status options
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'partial', label: 'Partial' },
];

/**
 * Get date string for N days ago in YYYY-MM-DD format
 * @param {number} daysAgo - Number of days ago
 * @returns {string} Date string
 */
const getDateDaysAgo = (daysAgo) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
};

/**
 * Format date/time for display
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted date/time
 */
const formatDateTime = (isoString) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * ImportHistoryTab Component
 * 
 * @param {Object} props - Component props
 * @param {string} props.systemId - External system ID
 * @param {boolean} props.disabled - Whether the tab is disabled
 */
export default function ImportHistoryTab({ systemId, disabled = false }) {
  const { isMockMode, isUsingFallback } = useServiceMode();

  // State
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [startDate, setStartDate] = useState(getDateDaysAgo(30)); // Default: last 30 days
  const [endDate, setEndDate] = useState(getDateDaysAgo(0)); // Today
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [pagination, setPagination] = useState(null);

  // Expanded rows (for showing error details)
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Detail modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Retry state
  const [retryingId, setRetryingId] = useState(null);
  const [retryResult, setRetryResult] = useState(null);

  // Get import service based on mode - use real service when available
  const importService = useService(mockImportService, realImportService);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load history when filters change
  useEffect(() => {
    if (systemId) {
      loadHistory();
    }
  }, [systemId, startDate, endDate, status, searchDebounced, page]);

  // Load import history from service
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      logger.info('[ImportHistoryTab]', 'Loading import history', {
        systemId,
        startDate,
        endDate,
        status,
        search: searchDebounced,
        page,
      });

      const result = await importService.getImportHistory(systemId, {
        startDate,
        endDate,
        status,
        search: searchDebounced,
        page,
        pageSize,
      });

      setHistory(result.items || []);
      setPagination(result.pagination || null);

      logger.debug('[ImportHistoryTab]', 'History loaded', {
        count: result.items?.length,
        total: result.pagination?.total,
      });
    } catch (err) {
      logger.error('[ImportHistoryTab]', 'Failed to load history', err);
      setError(err.message || 'Failed to load import history');
      setHistory([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [systemId, startDate, endDate, status, searchDebounced, page, pageSize, importService]);

  // Toggle row expansion
  const toggleRowExpansion = useCallback((recordId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recordId)) {
        newSet.delete(recordId);
      } else {
        newSet.add(recordId);
      }
      return newSet;
    });
  }, []);

  // Handle retry import
  const handleRetry = useCallback(async (record) => {
    setRetryingId(record.id);
    setRetryResult(null);

    try {
      logger.info('[ImportHistoryTab]', 'Retrying import', {
        historyId: record.id,
        orderId: record.external_order_id,
      });

      const result = await importService.retryImport(systemId, record.id, {
        operatorName: record.operator_name,
      });

      if (result.success) {
        setRetryResult({
          success: true,
          message: 'Import retry successful',
        });
        // Reload history to show updated status
        await loadHistory();
      } else {
        setRetryResult({
          success: false,
          message: result.errors?.join(', ') || 'Retry failed',
        });
      }
    } catch (err) {
      logger.error('[ImportHistoryTab]', 'Retry failed', err);
      setRetryResult({
        success: false,
        message: err.message || 'Retry failed',
      });
    } finally {
      setRetryingId(null);
    }
  }, [systemId, importService, loadHistory]);

  // Open detail modal
  const handleViewDetails = useCallback((record) => {
    setSelectedRecord(record);
    setDetailModalOpen(true);
  }, []);

  // Close detail modal
  const handleCloseDetailModal = useCallback(() => {
    setDetailModalOpen(false);
    setSelectedRecord(null);
  }, []);

  // Get status badge color
  const getStatusBadgeClass = (importStatus) => {
    switch (importStatus) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      {/* Mock Mode Indicator */}
      {isMockMode && (
        <div className={`p-3 rounded-lg ${
          isUsingFallback 
            ? 'bg-yellow-50 border border-yellow-200' 
            : 'bg-blue-50 border border-blue-200'
        }`}>
          <p className={`text-sm ${isUsingFallback ? 'text-yellow-800' : 'text-blue-800'}`}>
            <span className="font-medium">{isUsingFallback ? 'Fallback Mode:' : 'Mock Mode:'}</span>{' '}
            {isUsingFallback 
              ? 'Using simulated import history data (backend unavailable).' 
              : 'Using simulated import history data.'}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Date Range */}
          <div className="flex gap-2 items-center">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <span className="text-gray-400 mt-5">to</span>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Order number or patient name..."
                className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Refresh */}
          <button
            onClick={loadHistory}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition flex items-center gap-2"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Retry Result */}
      {retryResult && (
        <div className={`p-4 rounded-lg border ${retryResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2">
            {retryResult.success ? (
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className={retryResult.success ? 'text-green-800' : 'text-red-800'}>
              {retryResult.message}
            </span>
            <button
              onClick={() => setRetryResult(null)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* History Table */}
      {!loading && history.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Order No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Procedure</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Operator</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {history.map(record => (
                  <HistoryRow
                    key={record.id}
                    record={record}
                    expanded={expandedRows.has(record.id)}
                    onToggleExpand={() => toggleRowExpansion(record.id)}
                    onRetry={() => handleRetry(record)}
                    onViewDetails={() => handleViewDetails(record)}
                    retrying={retryingId === record.id}
                    disabled={disabled}
                    getStatusBadgeClass={getStatusBadgeClass}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-lg shadow px-4 py-3">
              <div className="text-sm text-gray-600">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, pagination.total)} of {pagination.total} records
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!pagination.hasPreviousPage}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm">
                  Page {page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={!pagination.hasNextPage}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && history.length === 0 && !error && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Import History</h3>
          <p className="text-gray-500">
            No import records found for the selected filters.
          </p>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedRecord && (
        <ImportDetailModal
          record={selectedRecord}
          onClose={handleCloseDetailModal}
          getStatusBadgeClass={getStatusBadgeClass}
        />
      )}
    </div>
  );
}

ImportHistoryTab.propTypes = {
  systemId: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
};

ImportHistoryTab.defaultProps = {
  disabled: false,
};


// ============================================
// Helper Components
// ============================================

/**
 * History Row Component
 * 
 * Displays a single import history record with expandable error details
 */
function HistoryRow({
  record,
  expanded,
  onToggleExpand,
  onRetry,
  onViewDetails,
  retrying,
  disabled,
  getStatusBadgeClass,
}) {
  const hasError = record.import_status === 'failed' || record.import_status === 'partial';
  const canRetry = record.import_status === 'failed';

  return (
    <>
      <tr className={`hover:bg-gray-50 ${expanded ? 'bg-gray-50' : ''}`}>
        {/* Expand Button */}
        <td className="px-4 py-3">
          {hasError && (
            <button
              onClick={onToggleExpand}
              className="text-gray-400 hover:text-gray-600"
              title={expanded ? 'Collapse' : 'Expand to see error details'}
            >
              <svg
                className={`w-4 h-4 transform transition-transform ${expanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </td>

        {/* Timestamp */}
        <td className="px-4 py-3 text-sm text-gray-900">
          {formatDateTime(record.imported_at)}
        </td>

        {/* Order Number */}
        <td className="px-4 py-3 text-sm font-medium text-gray-900">
          {record.external_order_id}
        </td>

        {/* Patient */}
        <td className="px-4 py-3">
          <div className="text-sm text-gray-900">{record.patient_name}</div>
          <div className="text-xs text-gray-500">{record.patient_mrn}</div>
        </td>

        {/* Procedure */}
        <td className="px-4 py-3">
          <div className="text-sm text-gray-900">{record.procedure_name}</div>
          <div className="text-xs text-gray-500">{record.procedure_code}</div>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(record.import_status)}`}>
            {record.import_status === 'success' && '✓ '}
            {record.import_status === 'failed' && '✗ '}
            {record.import_status === 'partial' && '⚠ '}
            {record.import_status.charAt(0).toUpperCase() + record.import_status.slice(1)}
          </span>
          {/* Patient created/updated indicators */}
          {record.patient_created && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
              +Patient
            </span>
          )}
          {record.patient_updated && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 rounded">
              ↻Patient
            </span>
          )}
        </td>

        {/* Operator */}
        <td className="px-4 py-3 text-sm text-gray-600">
          {record.operator_name || record.imported_by || '-'}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={onViewDetails}
              className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
              title="View Details"
            >
              Details
            </button>
            {canRetry && (
              <button
                onClick={onRetry}
                disabled={retrying || disabled}
                className="px-2 py-1 text-xs text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="Retry Import"
              >
                {retrying ? (
                  <>
                    <span className="animate-spin h-3 w-3 border-2 border-orange-600 border-t-transparent rounded-full"></span>
                    Retrying...
                  </>
                ) : (
                  'Retry'
                )}
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded Error Row */}
      {expanded && hasError && (
        <tr className="bg-red-50">
          <td colSpan={8} className="px-4 py-3">
            <div className="ml-8">
              <div className="text-sm font-medium text-red-800 mb-1">Error Details:</div>
              <div className="text-sm text-red-700 bg-red-100 p-3 rounded-lg">
                {record.error_message || 'Unknown error'}
              </div>
              {record.warnings && record.warnings.length > 0 && (
                <div className="mt-2">
                  <div className="text-sm font-medium text-yellow-800 mb-1">Warnings:</div>
                  <ul className="list-disc list-inside text-sm text-yellow-700">
                    {record.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

HistoryRow.propTypes = {
  record: PropTypes.object.isRequired,
  expanded: PropTypes.bool.isRequired,
  onToggleExpand: PropTypes.func.isRequired,
  onRetry: PropTypes.func.isRequired,
  onViewDetails: PropTypes.func.isRequired,
  retrying: PropTypes.bool.isRequired,
  disabled: PropTypes.bool.isRequired,
  getStatusBadgeClass: PropTypes.func.isRequired,
};

/**
 * Import Detail Modal Component
 * 
 * Shows detailed information about an import record
 */
function ImportDetailModal({ record, onClose, getStatusBadgeClass }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Import Details</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Status */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Status:</span>
              <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(record.import_status)}`}>
                {record.import_status === 'success' && '✓ '}
                {record.import_status === 'failed' && '✗ '}
                {record.import_status === 'partial' && '⚠ '}
                {record.import_status.charAt(0).toUpperCase() + record.import_status.slice(1)}
              </span>
            </div>

            {/* Order Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Order Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Order ID:</span>
                  <span className="ml-2 text-gray-900">{record.external_order_id}</span>
                </div>
                <div>
                  <span className="text-gray-500">Visit ID:</span>
                  <span className="ml-2 text-gray-900">{record.external_visit_id || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Procedure:</span>
                  <span className="ml-2 text-gray-900">{record.procedure_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">Procedure Code:</span>
                  <span className="ml-2 text-gray-900">{record.procedure_code}</span>
                </div>
              </div>
            </div>

            {/* Patient Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Patient Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Name:</span>
                  <span className="ml-2 text-gray-900">{record.patient_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">MRN:</span>
                  <span className="ml-2 text-gray-900">{record.patient_mrn}</span>
                </div>
                <div>
                  <span className="text-gray-500">Patient Created:</span>
                  <span className="ml-2 text-gray-900">{record.patient_created ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Patient Updated:</span>
                  <span className="ml-2 text-gray-900">{record.patient_updated ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>

            {/* Import Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Import Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Imported At:</span>
                  <span className="ml-2 text-gray-900">{formatDateTime(record.imported_at)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Imported By:</span>
                  <span className="ml-2 text-gray-900">{record.imported_by || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Operator:</span>
                  <span className="ml-2 text-gray-900">{record.operator_name || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Worklist Item:</span>
                  <span className="ml-2 text-gray-900">{record.worklist_item_id || '-'}</span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {record.error_message && (
              <div className="bg-red-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-red-700 mb-2">Error Message</h4>
                <p className="text-sm text-red-600">{record.error_message}</p>
              </div>
            )}

            {/* Warnings */}
            {record.warnings && record.warnings.length > 0 && (
              <div className="bg-yellow-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-yellow-700 mb-2">Warnings</h4>
                <ul className="list-disc list-inside text-sm text-yellow-600">
                  {record.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end p-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

ImportDetailModal.propTypes = {
  record: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  getStatusBadgeClass: PropTypes.func.isRequired,
};
