import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/http'
import { satusehatHealthCheck, SATUSEHAT_STATUS } from '../services/satusehatHealthCheck'
import { satusehatService } from '../services/satusehatService'
import LoadingScreen from '../components/LoadingScreen'

export default function SatusehatMonitor() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [responseModal, setResponseModal] = useState({ open: false, content: null })
  const [isUsingCache, setIsUsingCache] = useState(false)
  const [totalOrders, setTotalOrders] = useState(0)
  const [lastUpdateTime, setLastUpdateTime] = useState(null)
  const [healthStatus, setHealthStatus] = useState(null)
  const [monitorHealth, setMonitorHealth] = useState(null)
  const [uploadingOrderId, setUploadingOrderId] = useState(null)

  // Pagination and search states
  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [modalityFilter, setModalityFilter] = useState('')
  const [syncStatusFilter, setSyncStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const CACHE_KEY = 'satusehat_orders_cache'
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes cache

  // Filter orders using useMemo similar to Orders.jsx
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Search filter - check patient name and accession number
      if (searchTerm &&
        !order.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !order.accession_number.includes(searchTerm)) {
        return false
      }

      // Modality filter
      if (modalityFilter && order.modality !== modalityFilter) {
        return false
      }

      // Sync status filter
      if (syncStatusFilter === 'synced' && !order.satusehat_synced) {
        return false
      }
      if (syncStatusFilter === 'not_synced' && order.satusehat_synced) {
        return false
      }

      // Source filter
      if (sourceFilter && (order.order_source || '').toLowerCase() !== sourceFilter.toLowerCase()) {
        return false
      }

      return true
    })
  }, [orders, searchTerm, modalityFilter, syncStatusFilter, sourceFilter])

  // Function to normalize status display
  const normalizeStatus = (status) => {
    if (!status) return 'UNKNOWN';
    return status.toString().toUpperCase();
  }

  // Function to get status badge class
  const getStatusBadgeClass = (status) => {
    const normalizedStatus = normalizeStatus(status);
    switch (normalizedStatus) {
      case 'CREATED':
        return 'bg-blue-100 text-blue-700';
      case 'DELETED':
        return 'bg-red-100 text-red-700';
      case 'COMPLETED':
        return 'bg-green-100 text-green-700';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }

  const load = async (forceRefresh = false) => {
    setLoading(true)
    setIsUsingCache(false)

    try {
      // Check SatuSehat connectivity first
      const healthStatus = await satusehatHealthCheck.checkHealth()
      setHealthStatus(healthStatus)
      if (healthStatus.status !== SATUSEHAT_STATUS.OK) {
        console.warn('[SatusehatMonitor] Health status:', healthStatus.status)
      }

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached)
            const age = Date.now() - timestamp
            if (age < CACHE_TTL) {
              console.log('[SatusehatMonitor] Using cached data (age:', Math.round(age / 1000), 'seconds)')
              setOrders(data.orders)
              setTotalOrders(data.total)
              setIsUsingCache(true)
              setLastUpdateTime(timestamp)
              setLoading(false)
              return
            }
          } catch (e) {
            console.warn('[SatusehatMonitor] Invalid cache, will refresh')
          }
        }
      }

      // Fetch data from the new API endpoint with pagination and filters
      const client = apiClient('orders')

      // Build query parameters
      const params = new URLSearchParams()
      params.set('limit', limit)
      params.set('offset', offset)

      if (modalityFilter) {
        params.set('modality', modalityFilter)
      }

      if (syncStatusFilter === 'synced') {
        params.set('satusehat_synced', 'true')
      } else if (syncStatusFilter === 'not_synced') {
        params.set('satusehat_synced', 'false')
      }

      if (sourceFilter) {
        params.set('source', sourceFilter)
      }

      const queryString = params.toString()
      const url = `/orders/satusehat-status${queryString ? `?${queryString}` : ''}`

      const response = await client.get(url)

      const ordersData = response.orders || []
      setOrders(ordersData)
      setTotalOrders(response.total || ordersData.length)

      // Cache the results
      try {
        const currentTime = Date.now()
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          orders: ordersData,
          total: response.total || ordersData.length,
          timestamp: currentTime
        }))
        setLastUpdateTime(currentTime)
      } catch (e) {
        console.warn('[SatusehatMonitor] Failed to cache results:', e.message)
      }
    } catch (error) {
      console.error('[SatusehatMonitor] Failed to load data:', error)
      // Try to load from cache as fallback
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const { data, timestamp } = JSON.parse(cached)
          setOrders(data.orders)
          setTotalOrders(data.total)
          setIsUsingCache(true)
          setLastUpdateTime(timestamp)
        }
      } catch (e) {
        console.warn('[SatusehatMonitor] Failed to load cached data:', e.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const checkMonitorApiHealth = async () => {
    try {
      const client = apiClient('orders')
      const t0 = Date.now()
      const resp = await client.get('/health')
      const dt = Date.now() - t0
      setMonitorHealth({ ok: true, responseTime: dt, data: resp })
    } catch (error) {
      setMonitorHealth({ ok: false, error: error.message })
    }
  }

  // Function to view SatuSehat response details
  const viewResponse = (syncDetails) => {
    setResponseModal({ open: true, content: syncDetails })
  }

  // Function to simulate file upload for an order
  const uploadFile = async (orderId) => {
    setUploadingOrderId(orderId)
    try {
      // This is a placeholder for actual file upload functionality
      // In a real implementation, this would open a file dialog and upload files
      alert(`Upload functionality would be triggered for order ${orderId}. In a real implementation, this would open a file dialog.`)

      // For demonstration, we'll just show a success message
      // In a real implementation, you would call the upload service
      // await uploadService.uploadToOrder(orderId, file, metadata)
    } catch (error) {
      console.error('[SatusehatMonitor] Upload failed:', error)
      alert(`Upload failed: ${error.message}`)
    } finally {
      setUploadingOrderId(null)
    }
  }

  // Function to send order to SatuSehat
  const sendToSatusehat = async (order) => {
    try {
      // This would typically fetch the actual files for the order
      // For demonstration, we'll show a message
      alert(`In a real implementation, this would send order ${order.order_id} to SatuSehat. Files would be retrieved and sent using the satusehatService.`)

      // In a real implementation, you would:
      // 1. Fetch files for the order
      // 2. Send each eligible file using satusehatService.sendFile(orderId, file)
    } catch (error) {
      console.error('[SatusehatMonitor] Send to SatuSehat failed:', error)
      alert(`Send to SatuSehat failed: ${error.message}`)
    }
  }

  // Pagination functions
  const goToPage = (page) => {
    setOffset((page - 1) * limit)
  }

  const nextPage = () => {
    if (offset + limit < totalOrders) {
      setOffset(offset + limit)
    }
  }

  const prevPage = () => {
    if (offset > 0) {
      setOffset(offset - limit)
    }
  }

  // Filter and search functions
  const clearFilters = () => {
    setSearchTerm('')
    setModalityFilter('')
    setSyncStatusFilter('')
    setSourceFilter('')
    setOffset(0)
    load(true)
  }

  useEffect(() => {
    const initializeData = async () => {
      try {
        // Check health first (via health checker utility)
        const health = await satusehatHealthCheck.checkHealth()
        setHealthStatus(health)
        await load()
      } catch (e) {
        console.error('Failed to initialize dashboard:', e)
      }
    }

    initializeData()
    checkMonitorApiHealth()
    // Set up periodic health check every 2 minutes
    const healthInterval = setInterval(async () => {
      const health = await satusehatHealthCheck.checkHealth()
      setHealthStatus(health)
    }, 2 * 60 * 1000)

    return () => clearInterval(healthInterval)
  }, [limit, offset])

  // Re-fetch data when filters change
  useEffect(() => {
    load(true)
  }, [modalityFilter, syncStatusFilter, sourceFilter])

  // Calculate current page number
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(totalOrders / limit)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">SatuSehat Monitor</h1>
          <div className="text-xs text-slate-500">Pantau status integrasi order ke SatuSehat</div>
        </div>
        <div className="flex gap-2">
          <Link to="/orders" className="px-3 py-2 rounded bg-slate-200 text-sm">Back to Orders</Link>
          <button onClick={() => load(true)} className="px-3 py-2 rounded bg-slate-200 text-sm">Refresh</button>
        </div>
      </div>

      {/* Search and Filter Section */}
      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Patient</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search patient / accession"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Modality</label>
            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Modalities</option>
              <option value="CT">CT</option>
              <option value="MR">MR</option>
              <option value="CR">CR</option>
              <option value="DX">DX</option>
              <option value="US">US</option>
              <option value="XA">XA</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sync Status</label>
            <select
              value={syncStatusFilter}
              onChange={(e) => setSyncStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Status</option>
              <option value="synced">Synced</option>
              <option value="not_synced">Not Synced</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Sources</option>
              <option value="simrs">SIMRS</option>
              <option value="api">API</option>
              <option value="pacs">PACS</option>
            </select>
          </div>
        </div>
        <div className="flex justify-between">
          <div className="flex gap-2">
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Clear Filters
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Rows per page:</label>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value))
                setOffset(0) // Reset to first page
              }}
              className="px-2 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Info notice about system status, caching and limitations */}
      <div className="mb-4 text-xs">
        {/* Health Status */}
        {/* {healthStatus && (
          <div className={`px-3 py-2 rounded mb-2 ${healthStatus.status === SATUSEHAT_STATUS.OK
            ? 'bg-green-50 text-green-700'
            : healthStatus.status === SATUSEHAT_STATUS.UNAUTHORIZED
              ? 'bg-orange-50 text-orange-700'
              : 'bg-red-50 text-red-700'
            }`}>
            {healthStatus.status === SATUSEHAT_STATUS.OK
              ? 'SatuSehat integration is working properly'
              : healthStatus.status === SATUSEHAT_STATUS.UNAUTHORIZED
                ? 'SatuSehat authentication required'
                : 'SatuSehat integration error'}
            {healthStatus.details && (
              <button
                onClick={() => setResponseModal({ open: true, content: healthStatus.details })}
                className="ml-2 underline">
                View Details
              </button>
            )}
            <div className="text-xs opacity-75">
              Last checked: {new Date(healthStatus.lastCheck).toLocaleTimeString()}
              {healthStatus.isCached && ' (cached)'}
            </div>
          </div>
        )} */}

        {/* Monitor API Health */}
        {/* {monitorHealth && (
          <div className={`px-3 py-2 rounded mb-2 ${monitorHealth.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {monitorHealth.ok ? (
              <span>Monitor API healthy ({monitorHealth.responseTime}ms)</span>
            ) : (
              <span>Monitor API error: {monitorHealth.error}</span>
            )}
          </div>
        )} */}

        {/* Data Update Status */}
        {lastUpdateTime && (
          <div className="px-3 py-2 rounded bg-blue-50 text-blue-700 mb-2">
            {isUsingCache ? '📦' : '🔄'} {isUsingCache ? 'Showing cached data' : 'Data refreshed'} at {new Date(lastUpdateTime).toLocaleTimeString()}
            {isUsingCache && ' (auto-refreshes every 5 minutes). Click Refresh to update now.'}
          </div>
        )}
        <div className="px-3 py-2 rounded bg-blue-50 text-blue-700">
          Showing {filteredOrders.length} of {totalOrders} orders (page {currentPage} of {totalPages || 1})
        </div>
      </div>

      <div className="card overflow-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Order Number</th>
              <th className="px-4 py-2">Accession Number</th>
              <th className="px-4 py-2">Patient</th>
              <th className="px-4 py-2">Modality</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">SatuSehat Sync</th>
              <th className="px-4 py-2">Created At</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-6"><LoadingScreen message="Loading orders..." /></td></tr>
            ) : filteredOrders.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-6">No orders found</td></tr>
            ) : filteredOrders.map((order, index) => (
              <tr key={order.order_id}>
                <td className="px-4 py-2 text-xs">{offset + index + 1}</td>
                <td className="px-4 py-2 font-mono text-xs">{order.order_number}</td>
                <td className="px-4 py-2 font-mono text-xs">{order.accession_number}</td>
                <td className="px-4 py-2">{order.patient_name}</td>
                <td className="px-4 py-2">{order.modality}</td>
                <td className="px-4 py-2">{order.order_source || '-'}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadgeClass(order.status)}`}>
                    {normalizeStatus(order.status)}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {order.satusehat_synced ? (
                    <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">Synced</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs">Not Synced</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">
                  {new Date(order.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 flex gap-2">
                  <button
                    onClick={() => uploadFile(order.order_id)}
                    disabled={uploadingOrderId === order.order_id}
                    className={`px-2 py-1 rounded text-xs ${uploadingOrderId === order.order_id
                      ? 'bg-gray-300 text-slate-600'
                      : 'bg-blue-600 text-white'
                      }`}
                  >
                    {uploadingOrderId === order.order_id ? 'Uploading...' : 'Upload'}
                  </button>
                  <button
                    onClick={() => sendToSatusehat(order)}
                    className="px-2 py-1 rounded bg-emerald-600 text-white text-xs"
                  >
                    Send
                  </button>
                  {order.satusehat_sync_details && (
                    <button
                      onClick={() => viewResponse(order.satusehat_sync_details)}
                      className="px-2 py-1 rounded bg-slate-200 text-xs"
                    >
                      View Response
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-700">
          Showing {filteredOrders.length} of {totalOrders} orders (page {currentPage} of {totalPages || 1})
        </div>
        <div className="flex gap-2">
          <button
            onClick={prevPage}
            disabled={offset === 0}
            className={`px-4 py-2 rounded-md ${offset === 0
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
          >
            Previous
          </button>
          <div className="flex items-center">
            <span className="text-sm text-gray-700 mr-2">Page</span>
            <input
              type="number"
              min="1"
              max={totalPages || 1}
              value={currentPage}
              onChange={(e) => {
                const page = parseInt(e.target.value)
                if (page >= 1 && page <= totalPages) {
                  goToPage(page)
                }
              }}
              className="w-16 px-2 py-1 border border-gray-300 rounded-md text-center"
            />
            <span className="text-sm text-gray-700 ml-2">of {totalPages || 1}</span>
          </div>
          <button
            onClick={nextPage}
            disabled={offset + limit >= totalOrders}
            className={`px-4 py-2 rounded-md ${offset + limit >= totalOrders
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
          >
            Next
          </button>
        </div>
      </div>

      {/* Response modal */}
      {responseModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center" style={{ zIndex: 9999 }} onClick={() => setResponseModal({ open: false, content: null })}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold">SatuSehat API Response</h3>
              <button type="button" className="text-sm text-slate-500" onClick={() => setResponseModal({ open: false, content: null })}>Close</button>
            </div>
            <div className="mt-3">
              <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded border border-slate-100 max-h-72 overflow-auto">{JSON.stringify(responseModal.content, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}