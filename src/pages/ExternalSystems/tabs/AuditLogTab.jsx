/**
 * Audit Log Tab Component
 * 
 * Displays audit trail for external system integration activities:
 * - Date range filter
 * - User filter dropdown
 * - Action type filter (Create, Update, Delete, Import, Sync)
 * - Table: Timestamp, User, Action, Entity, Changes
 * - Expandable row for before/after values
 * 
 * Requirements: 18.5
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useServiceMode, useService } from '../../../hooks/useServiceMode';
import * as mockAuditLogService from '../../../services/mock/mockAuditLogService';
// Note: Real audit log service will be added when backend API is available
// import * as realAuditLogService from '../../../services/auditLogService';
import { logger } from '../../../utils/logger';

// Action type options
const ACTION_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'CREATE', label: 'Create' },
  { value: 'UPDATE', label: 'Update' },
  { value: 'DELETE', label: 'Delete' },
  { value: 'IMPORT', label: 'Import' },
  { value: 'SYNC', label: 'Sync' },
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
 * AuditLogTab Component
 * 
 * @param {Object} props - Component props
 * @param {string} props.systemId - External system ID
 * @param {boolean} props.disabled - Whether the tab is disabled
 */
export default function AuditLogTab({ systemId, disabled = false }) {
  const { isMockMode, isUsingFallback } = useServiceMode();

  // State
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Users for filter dropdown
  const [users, setUsers] = useState([]);

  // Filters
  const [startDate, setStartDate] = useState(getDateDaysAgo(30)); // Default: last 30 days
  const [endDate, setEndDate] = useState(getDateDaysAgo(0)); // Today
  const [action, setAction] = useState('all');
  const [userId, setUserId] = useState('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [pagination, setPagination] = useState(null);

  // Expanded rows (for showing before/after values)
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Detail modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  // Get audit log service based on mode
  // Note: Using mock service for both modes until real audit log API is available
  const auditLogService = useService(mockAuditLogService, mockAuditLogService);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load users for filter dropdown
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const userList = await auditLogService.getAuditLogUsers();
        setUsers(userList);
      } catch (err) {
        logger.error('[AuditLogTab]', 'Failed to load users', err);
      }
    };
    loadUsers();
  }, [auditLogService]);

  // Load logs when filters change
  useEffect(() => {
    loadLogs();
  }, [systemId, startDate, endDate, action, userId, searchDebounced, page]);

  // Load audit logs from service
  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      logger.info('[AuditLogTab]', 'Loading audit logs', {
        systemId,
        startDate,
        endDate,
        action,
        userId,
        search: searchDebounced,
        page,
      });

      const result = await auditLogService.listAuditLogs(systemId, {
        startDate,
        endDate,
        action,
        userId,
        search: searchDebounced,
        page,
        pageSize,
      });

      setLogs(result.items || []);
      setPagination(result.pagination || null);

      logger.debug('[AuditLogTab]', 'Logs loaded', {
        count: result.items?.length,
        total: result.pagination?.total,
      });
    } catch (err) {
      logger.error('[AuditLogTab]', 'Failed to load logs', err);
      setError(err.message || 'Failed to load audit logs');
      setLogs([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [systemId, startDate, endDate, action, userId, searchDebounced, page, pageSize, auditLogService]);

  // Toggle row expansion
  const toggleRowExpansion = useCallback((logId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  }, []);

  // Open detail modal
  const handleViewDetails = useCallback((log) => {
    setSelectedLog(log);
    setDetailModalOpen(true);
  }, []);

  // Close detail modal
  const handleCloseDetailModal = useCallback(() => {
    setDetailModalOpen(false);
    setSelectedLog(null);
  }, []);

  // Get action badge styling
  const getActionBadgeClass = (actionType) => {
    const display = auditLogService.getActionDisplay(actionType);
    return display.colorClass;
  };

  // Check if log has changes to show
  const hasChanges = (log) => {
    return log.changes && (log.changes.before || log.changes.after);
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
              ? 'Using simulated audit log data (backend unavailable).' 
              : 'Using simulated audit log data.'}
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

          {/* User Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">User</label>
            <select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]"
            >
              <option value="all">All Users</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.username}</option>
              ))}
            </select>
          </div>

          {/* Action Type Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Action</label>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ACTION_OPTIONS.map(opt => (
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
                placeholder="Entity ID, username, or entity type..."
                className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Refresh */}
          <button
            onClick={loadLogs}
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

      {/* Audit Log Table */}
      {!loading && logs.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Changes</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map(log => (
                  <AuditLogRow
                    key={log.id}
                    log={log}
                    expanded={expandedRows.has(log.id)}
                    onToggleExpand={() => toggleRowExpansion(log.id)}
                    onViewDetails={() => handleViewDetails(log)}
                    disabled={disabled}
                    getActionBadgeClass={getActionBadgeClass}
                    hasChanges={hasChanges}
                    auditLogService={auditLogService}
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
      {!loading && logs.length === 0 && !error && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Audit Logs</h3>
          <p className="text-gray-500">
            No audit log entries found for the selected filters.
          </p>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedLog && (
        <AuditLogDetailModal
          log={selectedLog}
          onClose={handleCloseDetailModal}
          getActionBadgeClass={getActionBadgeClass}
          auditLogService={auditLogService}
        />
      )}
    </div>
  );
}

AuditLogTab.propTypes = {
  systemId: PropTypes.string,
  disabled: PropTypes.bool,
};

AuditLogTab.defaultProps = {
  systemId: null,
  disabled: false,
};


// ============================================
// Helper Components
// ============================================

/**
 * Audit Log Row Component
 * 
 * Displays a single audit log entry with expandable changes details
 */
function AuditLogRow({
  log,
  expanded,
  onToggleExpand,
  onViewDetails,
  disabled,
  getActionBadgeClass,
  hasChanges,
  auditLogService,
}) {
  const canExpand = hasChanges(log);
  const entityTypeDisplay = auditLogService.getEntityTypeDisplayName(log.entity_type);

  // Get a summary of changes for the table
  const getChangesSummary = () => {
    if (!log.changes) return '-';
    
    const parts = [];
    if (log.changes.before) {
      const beforeKeys = Object.keys(log.changes.before);
      parts.push(`${beforeKeys.length} field(s) changed`);
    } else if (log.changes.after) {
      const afterKeys = Object.keys(log.changes.after);
      parts.push(`${afterKeys.length} field(s) set`);
    }
    
    return parts.length > 0 ? parts.join(', ') : '-';
  };

  return (
    <>
      <tr className={`hover:bg-gray-50 ${expanded ? 'bg-gray-50' : ''}`}>
        {/* Expand Button */}
        <td className="px-4 py-3">
          {canExpand && (
            <button
              onClick={onToggleExpand}
              className="text-gray-400 hover:text-gray-600"
              title={expanded ? 'Collapse' : 'Expand to see changes'}
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
          {formatDateTime(log.timestamp)}
        </td>

        {/* User */}
        <td className="px-4 py-3 text-sm text-gray-900">
          {log.username || '-'}
        </td>

        {/* Action */}
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getActionBadgeClass(log.action)}`}>
            {log.action}
          </span>
        </td>

        {/* Entity */}
        <td className="px-4 py-3">
          <div className="text-sm text-gray-900">{entityTypeDisplay}</div>
          <div className="text-xs text-gray-500 font-mono">{log.entity_id}</div>
        </td>

        {/* Changes Summary */}
        <td className="px-4 py-3 text-sm text-gray-600">
          {getChangesSummary()}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <button
            onClick={onViewDetails}
            className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
            title="View Details"
          >
            Details
          </button>
        </td>
      </tr>

      {/* Expanded Changes Row */}
      {expanded && canExpand && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-4 py-3">
            <div className="ml-8">
              <ChangesDisplay changes={log.changes} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

AuditLogRow.propTypes = {
  log: PropTypes.object.isRequired,
  expanded: PropTypes.bool.isRequired,
  onToggleExpand: PropTypes.func.isRequired,
  onViewDetails: PropTypes.func.isRequired,
  disabled: PropTypes.bool.isRequired,
  getActionBadgeClass: PropTypes.func.isRequired,
  hasChanges: PropTypes.func.isRequired,
  auditLogService: PropTypes.object.isRequired,
};

/**
 * Changes Display Component
 * 
 * Shows before/after values in a side-by-side comparison
 */
function ChangesDisplay({ changes }) {
  if (!changes) return null;

  const { before, after } = changes;
  
  // Get all unique keys from both before and after
  const allKeys = new Set([
    ...(before ? Object.keys(before) : []),
    ...(after ? Object.keys(after) : []),
  ]);

  if (allKeys.size === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700 mb-2">Changes:</div>
      <div className="grid grid-cols-2 gap-4">
        {/* Before Column */}
        <div className="bg-red-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-red-700 mb-2">Before</div>
          {before ? (
            <div className="space-y-1">
              {Object.entries(before).map(([key, value]) => (
                <div key={key} className="text-sm">
                  <span className="text-gray-600">{key}:</span>{' '}
                  <span className="text-red-800 font-mono">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">No previous value</div>
          )}
        </div>

        {/* After Column */}
        <div className="bg-green-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-green-700 mb-2">After</div>
          {after ? (
            <div className="space-y-1">
              {Object.entries(after).map(([key, value]) => (
                <div key={key} className="text-sm">
                  <span className="text-gray-600">{key}:</span>{' '}
                  <span className="text-green-800 font-mono">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">Value removed</div>
          )}
        </div>
      </div>
    </div>
  );
}

ChangesDisplay.propTypes = {
  changes: PropTypes.shape({
    before: PropTypes.object,
    after: PropTypes.object,
  }),
};

/**
 * Audit Log Detail Modal Component
 * 
 * Shows detailed information about an audit log entry
 */
function AuditLogDetailModal({ log, onClose, getActionBadgeClass, auditLogService }) {
  const entityTypeDisplay = auditLogService.getEntityTypeDisplayName(log.entity_type);

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
            <h3 className="text-lg font-semibold text-gray-900">Audit Log Details</h3>
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
            {/* Action Badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Action:</span>
              <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getActionBadgeClass(log.action)}`}>
                {log.action}
              </span>
            </div>

            {/* Basic Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Basic Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Log ID:</span>
                  <span className="ml-2 text-gray-900 font-mono">{log.id}</span>
                </div>
                <div>
                  <span className="text-gray-500">Timestamp:</span>
                  <span className="ml-2 text-gray-900">{formatDateTime(log.timestamp)}</span>
                </div>
                <div>
                  <span className="text-gray-500">User:</span>
                  <span className="ml-2 text-gray-900">{log.username || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">User ID:</span>
                  <span className="ml-2 text-gray-900 font-mono">{log.user_id || '-'}</span>
                </div>
              </div>
            </div>

            {/* Entity Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Entity Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Entity Type:</span>
                  <span className="ml-2 text-gray-900">{entityTypeDisplay}</span>
                </div>
                <div>
                  <span className="text-gray-500">Entity ID:</span>
                  <span className="ml-2 text-gray-900 font-mono">{log.entity_id}</span>
                </div>
                <div>
                  <span className="text-gray-500">External System:</span>
                  <span className="ml-2 text-gray-900">{log.external_system_name || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">System Code:</span>
                  <span className="ml-2 text-gray-900 font-mono">{log.external_system_code || '-'}</span>
                </div>
              </div>
            </div>

            {/* Changes */}
            {log.changes && (log.changes.before || log.changes.after) && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Changes</h4>
                <ChangesDisplay changes={log.changes} />
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

AuditLogDetailModal.propTypes = {
  log: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  getActionBadgeClass: PropTypes.func.isRequired,
  auditLogService: PropTypes.object.isRequired,
};
