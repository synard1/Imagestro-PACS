/**
 * Order Browser Tab Component
 * 
 * Browse and import orders from SIMRS with:
 * - Date range picker (default: today)
 * - Search input (order number, patient name, MRN)
 * - Order list with cards/table view toggle
 * - Multi-select checkboxes
 * - "Import Selected" button with loading state
 * - Connection error state when API unreachable
 * 
 * Requirements: 7.1, 7.2, 7.5
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useServiceMode, useService } from '../../../hooks/useServiceMode';
import * as mockImportService from '../../../services/mock/mockImportService';
import * as realImportService from '../../../services/unifiedImportService';
import OrderCard from '../components/OrderCard';
import PatientDiffDialog from '../components/PatientDiffDialog';
import { logger } from '../../../utils/logger';

// View modes
const VIEW_MODES = {
  CARD: 'card',
  TABLE: 'table',
};

/**
 * Get today's date in YYYY-MM-DD format
 * @returns {string} Today's date
 */
const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

/**
 * OrderBrowserTab Component
 * 
 * @param {Object} props - Component props
 * @param {string} props.systemId - External system ID
 * @param {boolean} props.disabled - Whether the tab is disabled
 */
export default function OrderBrowserTab({ systemId, disabled = false }) {
  const { isMockMode, isUsingFallback } = useServiceMode();

  // State
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionError, setConnectionError] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState(getTodayDate());
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [pagination, setPagination] = useState(null);

  // Selection
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [viewMode, setViewMode] = useState(VIEW_MODES.CARD);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importingOrderId, setImportingOrderId] = useState(null);
  const [importResult, setImportResult] = useState(null);

  // Patient diff dialog
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffDialogData, setDiffDialogData] = useState(null);
  const [diffDialogLoading, setDiffDialogLoading] = useState(false);

  // Get import service based on mode - use real service when available
  const importService = useService(mockImportService, realImportService);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load orders when filters change
  useEffect(() => {
    if (systemId) {
      loadOrders();
    }
  }, [systemId, startDate, endDate, searchDebounced, page]);

  // Load orders from service
  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConnectionError(false);

    try {
      logger.info('[OrderBrowserTab]', 'Loading orders', {
        systemId,
        startDate,
        endDate,
        search: searchDebounced,
        page,
      });

      const result = await importService.listOrders(systemId, {
        startDate,
        endDate,
        search: searchDebounced,
        page,
        pageSize,
      });

      // Handle different response formats
      const items = result.items || result.data || [];
      const pagination = result.pagination || {
        page: result.page || page,
        pageSize: result.page_size || result.pageSize || pageSize,
        total: result.total || items.length,
        totalPages: result.total_pages || result.totalPages || Math.ceil((result.total || items.length) / pageSize),
        hasNextPage: result.has_next_page !== undefined ? result.has_next_page : page < (result.total_pages || 1),
        hasPreviousPage: result.has_previous_page !== undefined ? result.has_previous_page : page > 1,
      };

      setOrders(items);
      setPagination(pagination);

      logger.debug('[OrderBrowserTab]', 'Orders loaded', {
        count: items.length,
        total: pagination.total,
      });
    } catch (err) {
      logger.error('[OrderBrowserTab]', 'Failed to load orders', err);
      
      // Check if it's a connection error
      if (err.message?.includes('network') || err.message?.includes('connection') || err.code === 'ECONNREFUSED') {
        setConnectionError(true);
        setError('Cannot connect to SIMRS. Please check the API configuration and try again.');
      } else {
        setError(err.message || 'Failed to load orders');
      }
      
      setOrders([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [systemId, startDate, endDate, searchDebounced, page, pageSize, importService]);

  // Handle order selection
  const handleSelectOrder = useCallback((orderId, selected) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(orderId);
      } else {
        newSet.delete(orderId);
      }
      return newSet;
    });
  }, []);

  // Handle select all
  const handleSelectAll = useCallback((selected) => {
    if (selected) {
      const selectableOrders = orders.filter(o => !o.is_imported).map(o => o.id);
      setSelectedOrders(new Set(selectableOrders));
    } else {
      setSelectedOrders(new Set());
    }
  }, [orders]);

  // Handle single order import
  const handleImportOrder = useCallback(async (orderId) => {
    setImportingOrderId(orderId);
    setImportResult(null);

    try {
      logger.info('[OrderBrowserTab]', 'Importing order', { systemId, orderId });

      const result = await importService.importOrder(systemId, orderId, {
        updatePatientIfDifferent: true,
      });

      if (result.success) {
        // Check if there's a patient diff
        if (result.patientDiff) {
          // Show diff dialog
          const order = orders.find(o => o.id === orderId);
          setDiffDialogData({
            orderId,
            orderNumber: order?.order_number,
            pacsData: result.patientDiff.pacsData,
            simrsData: result.patientDiff.simrsData,
            diffs: result.patientDiff.diffs || [result.patientDiff],
          });
          setDiffDialogOpen(true);
        } else {
          setImportResult({
            success: true,
            message: `Order ${orderId} imported successfully`,
          });
          // Reload orders to update status
          await loadOrders();
        }
      } else {
        setImportResult({
          success: false,
          message: result.errors?.join(', ') || 'Import failed',
        });
      }
    } catch (err) {
      logger.error('[OrderBrowserTab]', 'Import failed', err);
      setImportResult({
        success: false,
        message: err.message || 'Import failed',
      });
    } finally {
      setImportingOrderId(null);
    }
  }, [systemId, orders, importService, loadOrders]);

  // Handle bulk import
  const handleImportSelected = useCallback(async () => {
    if (selectedOrders.size === 0) return;

    setImporting(true);
    setImportResult(null);

    try {
      logger.info('[OrderBrowserTab]', 'Importing selected orders', {
        systemId,
        count: selectedOrders.size,
      });

      const orderIds = Array.from(selectedOrders);
      const results = await importService.importOrders(systemId, orderIds, {
        updatePatientIfDifferent: true,
      });

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      setImportResult({
        success: failed === 0,
        message: `Imported ${successful} of ${orderIds.length} orders${failed > 0 ? ` (${failed} failed)` : ''}`,
        details: results,
      });

      // Clear selection and reload
      setSelectedOrders(new Set());
      await loadOrders();
    } catch (err) {
      logger.error('[OrderBrowserTab]', 'Bulk import failed', err);
      setImportResult({
        success: false,
        message: err.message || 'Bulk import failed',
      });
    } finally {
      setImporting(false);
    }
  }, [systemId, selectedOrders, importService, loadOrders]);

  // Handle patient diff dialog actions
  const handleDiffUpdatePacs = useCallback(async () => {
    if (!diffDialogData) return;

    setDiffDialogLoading(true);
    try {
      const result = await importService.importOrder(systemId, diffDialogData.orderId, {
        updatePatientIfDifferent: true,
      });

      if (result.success) {
        setImportResult({
          success: true,
          message: 'Order imported and patient data updated',
        });
        setDiffDialogOpen(false);
        setDiffDialogData(null);
        await loadOrders();
      }
    } catch (err) {
      logger.error('[OrderBrowserTab]', 'Update PACS failed', err);
    } finally {
      setDiffDialogLoading(false);
    }
  }, [systemId, diffDialogData, importService, loadOrders]);

  const handleDiffKeepPacs = useCallback(async () => {
    if (!diffDialogData) return;

    setDiffDialogLoading(true);
    try {
      const result = await importService.importOrder(systemId, diffDialogData.orderId, {
        updatePatientIfDifferent: false,
      });

      if (result.success) {
        setImportResult({
          success: true,
          message: 'Order imported with existing PACS patient data',
        });
        setDiffDialogOpen(false);
        setDiffDialogData(null);
        await loadOrders();
      }
    } catch (err) {
      logger.error('[OrderBrowserTab]', 'Keep PACS failed', err);
    } finally {
      setDiffDialogLoading(false);
    }
  }, [systemId, diffDialogData, importService, loadOrders]);

  const handleDiffCancel = useCallback(() => {
    setDiffDialogOpen(false);
    setDiffDialogData(null);
  }, []);

  // Calculate selectable orders count
  const selectableOrdersCount = useMemo(() => {
    return orders.filter(o => !o.is_imported).length;
  }, [orders]);

  const allSelectableSelected = useMemo(() => {
    return selectableOrdersCount > 0 && selectedOrders.size === selectableOrdersCount;
  }, [selectableOrdersCount, selectedOrders.size]);

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
              ? 'Using simulated order data (backend unavailable).' 
              : 'Using simulated order data from SIMRS.'}
          </p>
        </div>
      )}

      {/* Connection Error State */}
      {connectionError && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center">
          <svg className="w-12 h-12 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold text-red-800 mb-2">Connection Error</h3>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={loadOrders}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Filters */}
      {!connectionError && (
        <>
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
                    placeholder="Order number, patient name, or MRN..."
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              {/* View Toggle */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">View</label>
                <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode(VIEW_MODES.CARD)}
                    className={`px-3 py-2 text-sm ${viewMode === VIEW_MODES.CARD ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode(VIEW_MODES.TABLE)}
                    className={`px-3 py-2 text-sm ${viewMode === VIEW_MODES.TABLE ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Refresh */}
              <button
                onClick={loadOrders}
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

          {/* Selection Actions */}
          {selectedOrders.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <span className="text-blue-800">
                <strong>{selectedOrders.size}</strong> order{selectedOrders.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedOrders(new Set())}
                  className="px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900"
                >
                  Clear Selection
                </button>
                <button
                  onClick={handleImportSelected}
                  disabled={importing || disabled}
                  className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center gap-2"
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
                      Import Selected
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className={`p-4 rounded-lg border ${importResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2">
                {importResult.success ? (
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span className={importResult.success ? 'text-green-800' : 'text-red-800'}>
                  {importResult.message}
                </span>
                <button
                  onClick={() => setImportResult(null)}
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
          {error && !connectionError && (
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

          {/* Orders List */}
          {!loading && orders.length > 0 && (
            <>
              {viewMode === VIEW_MODES.CARD ? (
                /* Card View */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {orders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      selected={selectedOrders.has(order.id)}
                      onSelect={handleSelectOrder}
                      onImport={handleImportOrder}
                      importing={importingOrderId === order.id}
                      disabled={disabled}
                      viewMode="card"
                    />
                  ))}
                </div>
              ) : (
                /* Table View */
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={allSelectableSelected}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            disabled={selectableOrdersCount === 0}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Order</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Patient</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Procedure</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Referring Doctor</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Request Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Priority</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(order => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          selected={selectedOrders.has(order.id)}
                          onSelect={handleSelectOrder}
                          onImport={handleImportOrder}
                          importing={importingOrderId === order.id}
                          disabled={disabled}
                          viewMode="table"
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between bg-white rounded-lg shadow px-4 py-3">
                  <div className="text-sm text-gray-600">
                    Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, pagination.total)} of {pagination.total} orders
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
          {!loading && orders.length === 0 && !error && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Orders Found</h3>
              <p className="text-gray-500">
                No orders match your search criteria for the selected date range.
              </p>
            </div>
          )}
        </>
      )}

      {/* Patient Diff Dialog */}
      <PatientDiffDialog
        isOpen={diffDialogOpen}
        onClose={() => !diffDialogLoading && handleDiffCancel()}
        pacsData={diffDialogData?.pacsData || {}}
        simrsData={diffDialogData?.simrsData || {}}
        diffs={diffDialogData?.diffs || []}
        onUpdatePacs={handleDiffUpdatePacs}
        onKeepPacs={handleDiffKeepPacs}
        onCancel={handleDiffCancel}
        loading={diffDialogLoading}
        orderNumber={diffDialogData?.orderNumber}
      />
    </div>
  );
}

OrderBrowserTab.propTypes = {
  systemId: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
};

OrderBrowserTab.defaultProps = {
  disabled: false,
};
