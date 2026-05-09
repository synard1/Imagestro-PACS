/**
 * Order Browser Component
 * 
 * Displays radiology orders from SIMRS Khanza with:
 * - Date range filter
 * - Search functionality
 * - Order list with required fields
 * - Import status indicator
 * - Multi-select and batch import
 * - Patient data diff confirmation
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 5.2, 5.3, 5.4
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Calendar,
  RefreshCw,
  AlertCircle,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  CheckCircle,
  XCircle
} from 'lucide-react'
import { listRadiologi } from '../../services/khanzaService'
import { 
  isOrderImported, 
  validateOrder, 
  importOrder, 
  importOrders 
} from '../../services/khanzaImportService'
import { notify } from '../../services/notifications'

// Import reusable Khanza components
import { 
  ImportStatusBadge, 
  OrderCard, 
  OrderCardList,
  PatientDiffDialog,
  usePatientDiffDialog 
} from '../../components/khanza'

// Empty state component
function EmptyState({ hasFilters, onClearFilters }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
      <FileText size={48} className="mb-4 opacity-50" />
      <p className="text-lg font-medium">No orders found</p>
      <p className="text-sm mt-1">
        {hasFilters 
          ? 'Try adjusting your filters or date range'
          : 'No radiology orders available for the selected date range'
        }
      </p>
      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Clear all filters
        </button>
      )}
    </div>
  )
}

// Error state component
function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center">
        <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
        <h3 className="font-semibold text-red-800 mb-2">Failed to Load Orders</h3>
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}

// Import progress dialog
function ImportProgressDialog({ isOpen, progress, results, onClose }) {
  if (!isOpen) return null

  const successCount = results.filter(r => r.success).length
  const failedCount = results.filter(r => !r.success).length

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {progress.completed ? 'Import Complete' : 'Importing Orders...'}
          </h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {/* Progress bar */}
          {!progress.completed && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Summary */}
          {progress.completed && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-green-700">{successCount}</div>
                <div className="text-sm text-green-600">Successful</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                <XCircle className="h-6 w-6 text-red-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-red-700">{failedCount}</div>
                <div className="text-sm text-red-600">Failed</div>
              </div>
            </div>
          )}

          {/* Results list */}
          {results.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Results:</h4>
              {results.map((result, index) => (
                <div 
                  key={index}
                  className={`
                    flex items-start gap-2 p-2 rounded text-sm
                    ${result.success ? 'bg-green-50' : 'bg-red-50'}
                  `}
                >
                  {result.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">{result.noorder}</div>
                    {result.success ? (
                      <div className="text-green-600 text-xs">
                        Imported successfully
                        {result.patientCreated && ' • Patient created'}
                        {result.patientUpdated && ' • Patient updated'}
                        {result.doctorCreated && ' • Doctor created'}
                      </div>
                    ) : (
                      <div className="text-red-600 text-xs">
                        {result.errors?.join(', ') || 'Import failed'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={!progress.completed}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {progress.completed ? 'Close' : 'Please wait...'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrderBrowser({ connectionStatus }) {
  // State
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [importStatuses, setImportStatuses] = useState({})
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState(() => {
    // Default to today
    return new Date().toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => {
    // Default to today
    return new Date().toISOString().split('T')[0]
  })
  
  // Selection
  const [selectedOrders, setSelectedOrders] = useState(new Set())
  
  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalOrders, setTotalOrders] = useState(0)

  // Import state
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, completed: false })
  const [importResults, setImportResults] = useState([])
  const [showImportDialog, setShowImportDialog] = useState(false)

  // Patient diff dialog
  const patientDiffDialog = usePatientDiffDialog()

  // Load orders from Khanza API
  const loadOrders = useCallback(async () => {
    if (connectionStatus !== 'connected') {
      setError('Not connected to Khanza API. Please check your connection settings.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = {
        tgl_mulai: dateFrom,
        tgl_akhir: dateTo,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }

      const result = await listRadiologi(params)
      
      // Handle different response formats
      let orderList = Array.isArray(result) ? result : (result?.data || result?.orders || [])
      
      // Apply local search filter if needed
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        orderList = orderList.filter(order => {
          const searchFields = [
            order.noorder,
            order.no_rawat,
            order.no_rkm_medis,
            order.nm_pasien,
            order.nm_perawatan,
            order.nm_dokter,
            order.dokter_perujuk,
          ]
          return searchFields.some(field => 
            field && String(field).toLowerCase().includes(query)
          )
        })
      }

      setOrders(orderList)
      setTotalOrders(result?.total || orderList.length)
      
      // Check import status for each order
      checkImportStatuses(orderList)
      
    } catch (err) {
      console.error('Failed to load orders:', err)
      setError(err.message || 'Failed to load orders from Khanza API')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [connectionStatus, dateFrom, dateTo, searchQuery, page, pageSize])

  // Check import status for orders
  const checkImportStatuses = async (orderList) => {
    const statuses = {}
    
    // Mark all as checking initially
    orderList.forEach(order => {
      statuses[order.noorder] = { checking: true, imported: false }
    })
    setImportStatuses(statuses)

    // Check each order's import status
    for (const order of orderList) {
      try {
        const imported = await isOrderImported(order.noorder)
        setImportStatuses(prev => ({
          ...prev,
          [order.noorder]: { checking: false, imported }
        }))
      } catch (err) {
        console.error(`Failed to check import status for ${order.noorder}:`, err)
        setImportStatuses(prev => ({
          ...prev,
          [order.noorder]: { checking: false, imported: false }
        }))
      }
    }
  }

  // Load orders when filters change
  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Handle order selection
  const handleSelectOrder = (order) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(order.noorder)) {
        newSet.delete(order.noorder)
      } else {
        newSet.add(order.noorder)
      }
      return newSet
    })
  }

  // Handle select all
  const handleSelectAll = () => {
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set())
    } else {
      setSelectedOrders(new Set(orders.map(o => o.noorder)))
    }
  }

  // Clear filters
  const clearFilters = () => {
    setSearchQuery('')
    setDateFrom(new Date().toISOString().split('T')[0])
    setDateTo(new Date().toISOString().split('T')[0])
    setPage(1)
  }

  // Check if any filters are active
  const hasActiveFilters = searchQuery.trim() !== ''

  // Calculate pagination
  const totalPages = Math.ceil(totalOrders / pageSize)

  // Handle batch import
  const handleBatchImport = async () => {
    if (selectedOrders.size === 0) {
      notify({
        type: 'warning',
        message: 'No orders selected',
        detail: 'Please select at least one order to import'
      })
      return
    }

    const orderNumbers = Array.from(selectedOrders)
    
    setImporting(true)
    setImportProgress({ current: 0, total: orderNumbers.length, completed: false })
    setImportResults([])
    setShowImportDialog(true)

    const results = []

    for (let i = 0; i < orderNumbers.length; i++) {
      const noorder = orderNumbers[i]
      setImportProgress(prev => ({ ...prev, current: i + 1 }))

      try {
        // First validate the order
        const validation = await validateOrder(noorder)
        
        // Check if patient diff dialog is needed
        if (validation.valid && validation.patientDiff?.hasDifferences) {
          // Show patient diff dialog and wait for user decision
          const decision = await patientDiffDialog.showDiffDialog(
            validation.patientData?.existing,
            validation.patientData?.khanza,
            validation.patientDiff
          )

          if (decision.action === 'cancel') {
            results.push({
              noorder,
              success: false,
              errors: ['Import cancelled by user']
            })
            continue
          }

          // Import with user's decision
          const result = await importOrder(noorder, {
            updatePatientIfDifferent: decision.updatePatient,
            skipValidation: true // Already validated
          })
          results.push(result)
        } else if (validation.valid) {
          // No patient diff, proceed with import
          const result = await importOrder(noorder, { skipValidation: true })
          results.push(result)
        } else {
          // Validation failed
          results.push({
            noorder,
            success: false,
            errors: validation.errors,
            warnings: validation.warnings
          })
        }
      } catch (err) {
        console.error(`Failed to import order ${noorder}:`, err)
        results.push({
          noorder,
          success: false,
          errors: [err.message || 'Import failed']
        })
      }

      // Update results in real-time
      setImportResults([...results])
    }

    setImportProgress(prev => ({ ...prev, completed: true }))
    setImporting(false)

    // Show summary notification
    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success).length

    if (successCount > 0) {
      notify({
        type: 'success',
        message: `Import completed`,
        detail: `${successCount} order(s) imported successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`
      })
    } else {
      notify({
        type: 'error',
        message: 'Import failed',
        detail: `All ${failedCount} order(s) failed to import`
      })
    }

    // Clear selection and refresh
    setSelectedOrders(new Set())
    loadOrders()
  }

  // Handle import dialog close
  const handleImportDialogClose = () => {
    setShowImportDialog(false)
    setImportResults([])
    setImportProgress({ current: 0, total: 0, completed: false })
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Date Range */}
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by order no, patient, procedure..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadOrders}
            disabled={loading || connectionStatus !== 'connected'}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Active filters indicator */}
        {hasActiveFilters && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <Filter size={14} />
            <span>Filters active</span>
            <button
              onClick={clearFilters}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Selection toolbar */}
      {orders.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedOrders.size === orders.length && orders.length > 0}
                onChange={handleSelectAll}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Select all ({orders.length})
            </label>
            {selectedOrders.size > 0 && (
              <span className="text-sm text-gray-600">
                {selectedOrders.size} selected
              </span>
            )}
          </div>

          {selectedOrders.size > 0 && (
            <button
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
              onClick={handleBatchImport}
              disabled={importing}
            >
              {importing ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Import Selected ({selectedOrders.size})
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Orders list */}
      <div className="min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={32} className="animate-spin text-blue-500" />
            <span className="ml-3 text-gray-600">Loading orders...</span>
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={loadOrders} />
        ) : orders.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} onClearFilters={clearFilters} />
        ) : (
          <OrderCardList
            orders={orders}
            importStatuses={importStatuses}
            selectedOrders={selectedOrders}
            onSelectOrder={handleSelectOrder}
            showCheckbox={true}
            compact={false}
          />
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && orders.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="text-sm text-gray-600">
            Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalOrders)} of {totalOrders} orders
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 py-1 text-sm">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Import Progress Dialog */}
      <ImportProgressDialog
        isOpen={showImportDialog}
        progress={importProgress}
        results={importResults}
        onClose={handleImportDialogClose}
      />

      {/* Patient Diff Dialog */}
      {patientDiffDialog.isOpen && patientDiffDialog.dialogData && (
        <PatientDiffDialog
          pacsPatient={patientDiffDialog.dialogData.pacsPatient}
          khanzaPatient={patientDiffDialog.dialogData.khanzaPatient}
          differences={patientDiffDialog.dialogData.differences}
          onConfirmUpdate={patientDiffDialog.handleConfirmUpdate}
          onDeclineUpdate={patientDiffDialog.handleDeclineUpdate}
          onClose={patientDiffDialog.handleClose}
          loading={importing}
        />
      )}
    </div>
  )
}
