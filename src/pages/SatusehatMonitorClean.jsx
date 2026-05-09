import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMonitorRows } from '../services/satusehatMonitorService'
import { satusehatHealthCheck, SATUSEHAT_STATUS } from '../services/satusehatHealthCheck'
import { apiClient } from '../services/http'
import { satusehatService } from '../services/satusehatService'
import LoadingScreen from '../components/LoadingScreen'
import { ChevronDown, Send, CheckCircle, Eye, RefreshCw, FileText, Activity } from 'lucide-react'

export default function SatusehatMonitor() {
  const [orders, setOrders] = useState([])
  const [openDropdown, setOpenDropdown] = useState(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [loading, setLoading] = useState(false)
  const [responseModal, setResponseModal] = useState({ open: false, content: null })
  const [isUsingCache, setIsUsingCache] = useState(false)
  const [totalOrders, setTotalOrders] = useState(0)
  const [lastUpdateTime, setLastUpdateTime] = useState(null)
  const [healthStatus, setHealthStatus] = useState(null)
  const [monitorHealth, setMonitorHealth] = useState(null)
  const [uploadingOrderId, setUploadingOrderId] = useState(null)
  const [orderReadiness, setOrderReadiness] = useState({})
  const [readinessLoadingOrderId, setReadinessLoadingOrderId] = useState(null)
  const [readinessModal, setReadinessModal] = useState({ open: false, orderId: null, data: null })
  const [encounterModal, setEncounterModal] = useState({ open: false, order: null, registration: '', loading: false, result: null, manualEncounterId: '', injectLoading: false, injectResult: null })
  const [serviceModal, setServiceModal] = useState({ open: false, order: null, registration: '', loading: false, result: null, manualServiceRequestId: '', injectLoading: false, injectResult: null })

  // Pagination and search states
  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [modalityFilter, setModalityFilter] = useState('')
  const [syncStatusFilter, setSyncStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const CACHE_KEY = 'satusehat_orders_cache'
  const CACHE_TTL = 5 * 60 * 1000
  const DEFAULT_LIMIT = 50

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

  const getOrderId = (order) => {
    return order?.order_id || order?.id || null
  }

  const getOrderIdentifier = (order) => {
    return order?.order_id || order?.accession_number || order?.order_number || order?.id || null
  }

  const load = async (forceRefresh = false) => {
    setLoading(true)
    setIsUsingCache(false)

    try {
      const currentHealth = await satusehatHealthCheck.checkHealth()
      setHealthStatus(currentHealth)

      if (!forceRefresh) {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached)
            const age = Date.now() - timestamp
            if (age < CACHE_TTL) {
              setOrders(data.orders)
              setTotalOrders(data.total)
              setIsUsingCache(true)
              setLastUpdateTime(timestamp)
              setLoading(false)
              return
            }
          } catch { }
        }
      }

      const ordersData = await listMonitorRows({ forceRefresh })
      setOrders(ordersData)
      setTotalOrders(ordersData.length)

      const now = Date.now()
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ orders: ordersData, total: ordersData.length, timestamp: now }))
        setLastUpdateTime(now)
      } catch { }
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

  const fetchOrderReadiness = async (order, openModal = true) => {
    try {
      const oid = getOrderId(order)
      if (!oid) {
        if (openModal) setReadinessModal({ open: true, orderId: null, data: { error: 'Order ID tidak tersedia' } })
        return
      }
      setReadinessLoadingOrderId(oid)
      const client = apiClient('orders')
      const resp = await client.get(`/orders/${oid}/satusehat-readiness`)
      const readiness = resp && resp.readiness ? resp.readiness : resp
      setOrderReadiness(prev => ({ ...prev, [oid]: readiness }))
      if (openModal) setReadinessModal({ open: true, orderId: oid, data: readiness })
    } catch (error) {
      const oid = getOrderId(order)
      if (openModal) setReadinessModal({ open: true, orderId: oid, data: { error: error.message } })
    } finally {
      setReadinessLoadingOrderId(null)
    }
  }

  const openReadinessModal = (orderId) => {
    const data = orderReadiness[orderId]
    setReadinessModal({ open: true, orderId, data })
  }

  const openEncounterModal = (order) => {
    const registration = order?.registration_number || ''
    setEncounterModal({ open: true, order, registration, loading: false, result: null, manualEncounterId: '', injectLoading: false, injectResult: null })
  }

  const requestSimrsEncounter = async () => {
    const order = encounterModal.order
    const identifier = getOrderIdentifier(order)
    const registration = (encounterModal.registration || '').trim()
    if (!identifier) {
      setEncounterModal(prev => ({ ...prev, result: { error: 'Identifier order tidak ditemukan' } }))
      return
    }
    if (!registration) {
      setEncounterModal(prev => ({ ...prev, result: { error: 'registration_number wajib diisi' } }))
      return
    }
    try {
      setEncounterModal(prev => ({ ...prev, loading: true, result: null }))
      const client = apiClient('orders')
      const resp = await client.post(`/orders/${identifier}/simrs-encounter`, {
        source: 'simrs',
        registration_number: registration,
        fetch: true,
      })
      setEncounterModal(prev => ({ ...prev, loading: false, result: resp }))
      await fetchOrderReadiness(order, false)
    } catch (error) {
      setEncounterModal(prev => ({ ...prev, loading: false, result: { error: error.message } }))
    }
  }

  const injectEncounterId = async () => {
    const order = encounterModal.order
    const identifier = getOrderIdentifier(order)
    let eid = (encounterModal.manualEncounterId || '').trim()
    if (!identifier) {
      setEncounterModal(prev => ({ ...prev, injectResult: { error: 'Identifier order tidak ditemukan' } }))
      return
    }
    if (!eid) {
      setEncounterModal(prev => ({ ...prev, injectResult: { error: 'Encounter ID wajib diisi' } }))
      return
    }
    if (!eid.startsWith('Encounter/')) {
      eid = `Encounter/${eid}`
    }
    try {
      setEncounterModal(prev => ({ ...prev, injectLoading: true, injectResult: null }))
      const client = apiClient('orders')
      const resp = await client.put(`/orders/${identifier}/satusehat-refs`, {
        satusehat_encounter_id: eid,
      })
      setEncounterModal(prev => ({ ...prev, injectLoading: false, injectResult: resp }))
      await fetchOrderReadiness(order, false)
    } catch (error) {
      setEncounterModal(prev => ({ ...prev, injectLoading: false, injectResult: { error: error.message } }))
    }
  }

  const openReadinessFromEncounterModal = () => {
    const oid = getOrderId(encounterModal.order)
    setEncounterModal({ open: false, order: null, registration: '', loading: false, result: null, manualEncounterId: '', injectLoading: false, injectResult: null })
    if (oid && orderReadiness[oid]) {
      setTimeout(() => {
        openReadinessModal(oid)
      }, 0)
    }
  }

  const openServiceModal = (order) => {
    const registration = order?.registration_number || ''
    setServiceModal({ open: true, order, registration, loading: false, result: null, manualServiceRequestId: '', injectLoading: false, injectResult: null })
  }

  const requestSimrsServiceRequest = async () => {
    const order = serviceModal.order
    const identifier = getOrderIdentifier(order)
    const registration = (serviceModal.registration || '').trim()
    if (!identifier) {
      setServiceModal(prev => ({ ...prev, result: { error: 'Identifier order tidak ditemukan' } }))
      return
    }
    if (!registration) {
      setServiceModal(prev => ({ ...prev, result: { error: 'registration_number wajib diisi' } }))
      return
    }
    try {
      setServiceModal(prev => ({ ...prev, loading: true, result: null }))
      const client = apiClient('orders')
      const resp = await client.post(`/orders/${identifier}/request-servicerequest-from-simrs`, {
        registration_number: registration,
      })
      setServiceModal(prev => ({ ...prev, loading: false, result: resp }))
      await fetchOrderReadiness(order, false)
    } catch (error) {
      setServiceModal(prev => ({ ...prev, loading: false, result: { error: error.message } }))
    }
  }

  const injectServiceRequestId = async () => {
    const order = serviceModal.order
    const identifier = getOrderIdentifier(order)
    let srid = (serviceModal.manualServiceRequestId || '').trim()
    if (!identifier) {
      setServiceModal(prev => ({ ...prev, injectResult: { error: 'Identifier order tidak ditemukan' } }))
      return
    }
    if (!srid) {
      setServiceModal(prev => ({ ...prev, injectResult: { error: 'ServiceRequest ID wajib diisi' } }))
      return
    }
    if (!srid.startsWith('ServiceRequest/')) {
      srid = `ServiceRequest/${srid}`
    }
    try {
      setServiceModal(prev => ({ ...prev, injectLoading: true, injectResult: null }))
      const client = apiClient('orders')
      const resp = await client.put(`/orders/${identifier}/satusehat-refs`, {
        satusehat_service_request_id: srid,
      })
      setServiceModal(prev => ({ ...prev, injectLoading: false, injectResult: resp }))
      await fetchOrderReadiness(order, false)
    } catch (error) {
      setServiceModal(prev => ({ ...prev, injectLoading: false, injectResult: { error: error.message } }))
    }
  }

  const openReadinessFromServiceModal = () => {
    const oid = getOrderId(serviceModal.order)
    setServiceModal({ open: false, order: null, registration: '', loading: false, result: null, manualServiceRequestId: '', injectLoading: false, injectResult: null })
    if (oid && orderReadiness[oid]) {
      setTimeout(() => {
        openReadinessModal(oid)
      }, 0)
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

  // State to track orders sent to router successfully
  const [sentToRouter, setSentToRouter] = useState({})

  // Function to send order to SatuSehat
  const sendToSatusehat = async (order) => {
    const orderId = getOrderId(order)
    if (!orderId) return

    try {
      setUploadingOrderId(orderId) // Reuse uploading state for loading indicator

      const payload = {
        study_uid: order.study_instance_uid,
        // Add other fields if available/needed
        accession_number: order.accession_number,
        patient_id: order.patient_id
      }

      const result = await satusehatService.sendToRouter(payload)

      if (result.success) {
        // Mark as sent to router to hide buttons
        setSentToRouter(prev => ({ ...prev, [orderId]: true }))

        // Show success message
        // You might want to show details like "Sent: X, Failed: Y"
        const msg = `Berhasil kirim ke Router. Total: ${result.total}, Terkirim: ${result.sent}`
        alert(msg) // Or use a proper notification toast if available
      } else {
        throw new Error(result.message || 'Gagal mengirim ke router')
      }

    } catch (error) {
      console.error('[SatusehatMonitor] Send to SatuSehat failed:', error)
      alert(`Send to SatuSehat failed: ${error.message}`)
    } finally {
      setUploadingOrderId(null)
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
    const init = async () => {
      try {
        const h = await satusehatHealthCheck.checkHealth()
        setHealthStatus(h)
        await load()
      } catch (e) {
        console.error('Failed to initialize dashboard:', e)
      }
    }
    init()
    checkMonitorApiHealth()
    const healthInterval = setInterval(async () => {
      const h = await satusehatHealthCheck.checkHealth()
      setHealthStatus(h)
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
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SatuSehat Monitor</h1>
          <p className="mt-1 text-sm text-gray-500">Monitor integrasi order ke SatuSehat dengan real-time status</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/orders"
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Back to Orders
          </Link>
          <button
            onClick={() => load(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Search and Filter Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Patient</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search patient / accession..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Modality</label>
            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Sync Status</label>
            <select
              value={syncStatusFilter}
              onChange={(e) => setSyncStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="">All Status</option>
              <option value="synced">Synced</option>
              <option value="not_synced">Not Synced</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
          <button
            onClick={clearFilters}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
          >
            <RefreshCw size={16} className="mr-2" />
            Clear Filters
          </button>
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

      <div className="mb-4 text-xs">
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
              <button onClick={() => setResponseModal({ open: true, content: healthStatus.details })} className="ml-2 underline">View Details</button>
            )}
            <div className="text-xs opacity-75">
              Last checked: {new Date(healthStatus.lastCheck).toLocaleTimeString()}
              {healthStatus.isCached && ' (cached)'}
            </div>
          </div>
        )} */}

        {/* {monitorHealth && (
          <div className={`px-3 py-2 rounded mb-2 ${monitorHealth.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {monitorHealth.ok ? (
              <span>Monitor API healthy ({monitorHealth.responseTime}ms)</span>
            ) : (
              <span>Monitor API error: {monitorHealth.error}</span>
            )}
          </div>
        )} */}

        {lastUpdateTime && (
          <div className="px-3 py-2 rounded bg-blue-50 text-blue-700 mb-2">
            {isUsingCache ? 'Showing cached data' : 'Data refreshed'} at {new Date(lastUpdateTime).toLocaleTimeString()}
            {isUsingCache && ' (auto-refreshes every 5 minutes). Click Refresh to update now.'}
          </div>
        )}
        <div className="px-3 py-2 rounded bg-blue-50 text-blue-700">
          Showing {filteredOrders.length} of {totalOrders} orders (page {currentPage} of {totalPages || 1})
        </div>
      </div>

      <div className="card overflow-auto">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order No.</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Accession</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mod.</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sync</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Study ID</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Created</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={10} className="text-center py-8"><LoadingScreen message="Loading orders..." /></td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-500">No orders found</td></tr>
              ) : filteredOrders.map((order, index) => (
                <tr key={getOrderId(order) || `${index}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3 text-xs text-gray-500">{offset + index + 1}</td>
                  <td className="px-3 py-3">
                    <div className="text-xs font-mono text-gray-900">{order.order_number}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-xs font-mono text-gray-700">{order.accession_number}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm font-medium text-gray-900">{order.patient_name}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {order.modality}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(order.status)}`}>
                      {normalizeStatus(order.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {order.satusehat_synced ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle size={12} className="mr-1" />
                        Synced
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs hidden lg:table-cell">
                    {order.imaging_study_id ? (
                      <button
                        onClick={() => setResponseModal({ open: true, content: { imaging_study_id: order.imaging_study_id } })}
                        className="inline-flex items-center p-1 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                        title="View Imaging Study ID"
                      >
                        <Eye size={14} />
                      </button>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 hidden md:table-cell">
                    <div className="whitespace-nowrap">{new Date(order.created_at).toLocaleDateString()}</div>
                    <div className="text-gray-400">{new Date(order.created_at).toLocaleTimeString()}</div>
                  </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    {/* Primary Actions - Always visible */}
                    {!order.satusehat_synced && orderReadiness[getOrderId(order)]?.ready_to_sync && (
                      <button
                        onClick={() => sendToSatusehat(order)}
                        className="p-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        title="Send to SatuSehat"
                      >
                        <Send size={14} />
                      </button>
                    )}

                    {!order.satusehat_synced && !orderReadiness[getOrderId(order)]?.ready_to_sync && (
                      <button
                        onClick={() => fetchOrderReadiness(order)}
                        disabled={readinessLoadingOrderId === getOrderId(order)}
                        className={`p-1.5 rounded transition-colors ${readinessLoadingOrderId === getOrderId(order)
                          ? 'bg-gray-300 text-gray-600'
                          : 'bg-amber-600 text-white hover:bg-amber-700'
                          }`}
                        title={readinessLoadingOrderId === getOrderId(order) ? 'Checking...' : 'Check Validation'}
                      >
                        <RefreshCw size={14} className={readinessLoadingOrderId === getOrderId(order) ? 'animate-spin' : ''} />
                      </button>
                    )}

                    {order.satusehat_synced && (
                      <span className="p-1.5 rounded bg-green-100 text-green-600" title="Synced">
                        <CheckCircle size={14} />
                      </span>
                    )}

                    {orderReadiness[getOrderId(order)] && (
                      <button
                        onClick={() => openReadinessModal(getOrderId(order))}
                        className="p-1.5 rounded bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                        title="View Validation"
                      >
                        <Eye size={14} />
                      </button>
                    )}

                    {/* Secondary Actions - Dropdown Menu */}
                    {((orderReadiness[getOrderId(order)]?.validation?.encounter?.status !== 'ready' && !sentToRouter[getOrderId(order)] && !order.satusehat_synced) ||
                      ((orderReadiness[getOrderId(order)]?.validation?.service_request?.status !== 'synced' || !orderReadiness[getOrderId(order)]?.validation?.service_request?.value) && !sentToRouter[getOrderId(order)] && !order.satusehat_synced) ||
                      order.satusehat_sync_details) && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const spaceAbove = rect.top;
                            const dropdownHeight = 150; // Approximate height

                            let top = rect.bottom + window.scrollY + 4;
                            if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
                              // Open upward if not enough space below
                              top = rect.top + window.scrollY - dropdownHeight - 4;
                            }

                            setDropdownPosition({
                              top: top,
                              left: rect.right - 224 // 224px = w-56 width
                            });
                            setOpenDropdown(openDropdown === getOrderId(order) ? null : getOrderId(order));
                          }}
                          className="p-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          title="More Actions"
                        >
                          <ChevronDown size={14} />
                        </button>

                        {openDropdown === getOrderId(order) && (
                          <>
                            {/* Backdrop */}
                            <div
                              className="fixed inset-0 z-[100]"
                              onClick={() => setOpenDropdown(null)}
                            />
                            {/* Dropdown Menu - Absolute positioned relative to button */}
                            <div
                              className="fixed z-[101] w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1"
                              style={{
                                top: `${dropdownPosition.top}px`,
                                left: `${dropdownPosition.left}px`
                              }}
                            >
                              {orderReadiness[getOrderId(order)]?.validation?.encounter?.status !== 'ready' && !sentToRouter[getOrderId(order)] && !order.satusehat_synced && (
                                <button
                                  onClick={() => {
                                    openEncounterModal(order)
                                    setOpenDropdown(null)
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 transition-colors"
                                >
                                  <Activity size={14} />
                                  <span>Get Encounter SIMRS</span>
                                </button>
                              )}

                              {(orderReadiness[getOrderId(order)]?.validation?.service_request?.status !== 'synced' || !orderReadiness[getOrderId(order)]?.validation?.service_request?.value) && !sentToRouter[getOrderId(order)] && !order.satusehat_synced && (
                                <button
                                  onClick={() => {
                                    openServiceModal(order)
                                    setOpenDropdown(null)
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2 transition-colors"
                                >
                                  <FileText size={14} />
                                  <span>Request ServiceRequest</span>
                                </button>
                              )}

                              {order.satusehat_sync_details && (
                                <button
                                  onClick={() => {
                                    viewResponse(order.satusehat_sync_details)
                                    setOpenDropdown(null)
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                                >
                                  <Eye size={14} />
                                  <span>View Response</span>
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
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

      {readinessModal.open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setReadinessModal({ open: false, orderId: null, data: null })} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Validasi Sinkronisasi SatuSehat</h2>
                <p className="text-xs text-gray-500">Ringkasan kesiapan data sebelum upload/send</p>
              </div>
              <div className="px-6 py-4 max-h-[70vh] overflow-y-auto text-sm">
                {readinessModal.data && readinessModal.data.error && (
                  <div className="px-3 py-2 rounded bg-red-50 text-red-700 mb-3">{readinessModal.data.error}</div>
                )}
                {readinessModal.data && readinessModal.data.ready_to_sync !== undefined && (
                  <div className={`px-3 py-2 rounded mb-3 ${readinessModal.data.ready_to_sync ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    <div className="font-medium">{readinessModal.data.ready_to_sync ? 'Siap untuk sinkronisasi' : 'Belum siap untuk sinkronisasi'}</div>
                    {readinessModal.data.message && (<div className="text-xs opacity-80">{readinessModal.data.message}</div>)}
                  </div>
                )}
                {readinessModal.data && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {readinessModal.data.order_number && (
                      <div className="p-3 rounded border">
                        <div className="text-xs text-gray-500">Order Number</div>
                        <div className="font-mono">{readinessModal.data.order_number}</div>
                      </div>
                    )}
                    {readinessModal.data.accession_number && (
                      <div className="p-3 rounded border">
                        <div className="text-xs text-gray-500">Accession Number</div>
                        <div className="font-mono">{readinessModal.data.accession_number}</div>
                      </div>
                    )}
                    {readinessModal.data.patient_name && (
                      <div className="p-3 rounded border">
                        <div className="text-xs text-gray-500">Patient</div>
                        <div>{readinessModal.data.patient_name}</div>
                      </div>
                    )}
                    {readinessModal.data.modality && (
                      <div className="p-3 rounded border">
                        <div className="text-xs text-gray-500">Modality</div>
                        <div>{readinessModal.data.modality}</div>
                      </div>
                    )}
                  </div>
                )}
                {readinessModal.data && readinessModal.data.recommendations && readinessModal.data.recommendations.length > 0 && (
                  <div className="mb-4">
                    <div className="font-medium mb-2">Rekomendasi</div>
                    <ul className="list-disc ml-5 space-y-1">
                      {readinessModal.data.recommendations.map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {readinessModal.data && readinessModal.data.validation && (
                  <div className="space-y-3">
                    {Object.entries(readinessModal.data.validation).map(([key, section]) => (
                      <div key={key} className="border rounded">
                        <div className="px-3 py-2 border-b flex items-center justify-between">
                          <div className="font-medium capitalize">{key.replace(/_/g, ' ')}</div>
                          <span className={`px-2 py-0.5 rounded text-xs ${section.status === 'ready' ? 'bg-green-100 text-green-700' : section.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                            {section.status}
                          </span>
                        </div>
                        <div className="px-3 py-3 text-sm">
                          {section.message && (<div className="mb-2">{section.message}</div>)}
                          {section.missing_fields && section.missing_fields.length > 0 && (
                            <div className="mb-2">
                              <div className="text-xs text-gray-500">Missing fields</div>
                              <div className="font-mono text-xs">{section.missing_fields.join(', ')}</div>
                            </div>
                          )}
                          {section.value !== undefined && section.value !== null && (
                            <div className="text-xs text-gray-500">Value: <span className="font-mono">{String(section.value)}</span></div>
                          )}
                          {section.files && Array.isArray(section.files) && section.files.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs text-gray-500 mb-1">Files</div>
                              <ul className="text-xs space-y-1">
                                {section.files.map((f) => (
                                  <li key={f.id} className="flex justify-between gap-2">
                                    <span>{f.filename}</span>
                                    <span className="font-mono">{f.size_bytes} B</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {section.count !== undefined && (
                            <div className="text-xs text-gray-500 mt-2">Count: {section.count}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t flex justify-end gap-2">
                <button
                  onClick={() => setReadinessModal({ open: false, orderId: null, data: null })}
                  className="px-3 py-2 rounded bg-slate-200 text-sm"
                >
                  Tutup
                </button>
                {readinessModal.data && readinessModal.data.ready_to_sync && !(() => {
                  // Find the order by orderId to check if it's already synced
                  const order = orders.find(o => getOrderId(o) === readinessModal.orderId)
                  return order?.satusehat_synced
                })() && (
                    <button
                      onClick={() => {
                        setReadinessModal({ open: false, orderId: null, data: null })
                      }}
                      className="px-3 py-2 rounded bg-emerald-600 text-white text-sm"
                    >
                      Lanjutkan
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {encounterModal.open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEncounterModal({ open: false, order: null, registration: '', loading: false, result: null })} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Ambil Encounter SIMRS</h2>
                <p className="text-xs text-gray-500">Masukkan registration_number untuk menarik encounter dari SIMRS</p>
              </div>
              <div className="px-6 py-4 space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Order Identifier</div>
                  <div className="font-mono text-sm">{getOrderIdentifier(encounterModal.order)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                  <input
                    type="text"
                    value={encounterModal.registration}
                    onChange={(e) => setEncounterModal(prev => ({ ...prev, registration: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="REG-YYYY-NNNN"
                  />
                </div>
                {encounterModal.result && encounterModal.result.error && (
                  <div className="px-3 py-2 rounded bg-red-50 text-red-700 text-sm">{encounterModal.result.error}</div>
                )}
                {encounterModal.result && !encounterModal.result.error && (
                  <div className="px-3 py-2 rounded bg-green-50 text-green-700 text-sm">Berhasil request encounter dari SIMRS</div>
                )}
                {(encounterModal.result && encounterModal.result.error) && (
                  <div className="mt-3 border-t pt-3">
                    <div className="text-sm font-medium mb-2">Inject Encounter ID (manual)</div>
                    <div className="text-xs text-gray-500 mb-2">Tempel ID Encounter dari SIMRS, contoh: <span className="font-mono">Encounter/9c51e4ed-...</span> atau hanya UUID.</div>
                    <input
                      type="text"
                      value={encounterModal.manualEncounterId}
                      onChange={(e) => setEncounterModal(prev => ({ ...prev, manualEncounterId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Encounter/<id> atau <id>"
                    />
                    {encounterModal.injectResult && encounterModal.injectResult.error && (
                      <div className="px-3 py-2 rounded bg-red-50 text-red-700 text-sm mt-2">{encounterModal.injectResult.error}</div>
                    )}
                    {encounterModal.injectResult && !encounterModal.injectResult.error && (
                      <div className="px-3 py-2 rounded bg-green-50 text-green-700 text-sm mt-2">Berhasil inject Encounter ID</div>
                    )}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t flex justify-end gap-2">
                <button
                  onClick={() => setEncounterModal({ open: false, order: null, registration: '', loading: false, result: null })}
                  className="px-3 py-2 rounded bg-slate-200 text-sm"
                >
                  Tutup
                </button>
                <button
                  onClick={requestSimrsEncounter}
                  disabled={encounterModal.loading}
                  className={`px-3 py-2 rounded text-sm ${encounterModal.loading ? 'bg-gray-300 text-slate-600' : 'bg-indigo-600 text-white'}`}
                >
                  {encounterModal.loading ? 'Meminta...' : 'Request Encounter'}
                </button>
                {(encounterModal.result && encounterModal.result.error) && (
                  <button
                    onClick={injectEncounterId}
                    disabled={encounterModal.injectLoading}
                    className={`px-3 py-2 rounded text-sm ${encounterModal.injectLoading ? 'bg-gray-300 text-slate-600' : 'bg-emerald-600 text-white'}`}
                  >
                    {encounterModal.injectLoading ? 'Mengirim...' : 'Inject Encounter ID'}
                  </button>
                )}
                {(() => {
                  const oid = getOrderId(encounterModal.order)
                  const hasReadiness = oid && orderReadiness[oid]
                  const success = (encounterModal.result && !encounterModal.result.error) || (encounterModal.injectResult && !encounterModal.injectResult.error)
                  if (hasReadiness && success) {
                    return (
                      <button
                        onClick={openReadinessFromEncounterModal}
                        className="px-3 py-2 rounded bg-slate-800 text-white text-sm"
                      >
                        Lihat Validasi
                      </button>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {serviceModal.open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setServiceModal({ open: false, order: null, registration: '', loading: false, result: null, manualServiceRequestId: '', injectLoading: false, injectResult: null })} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Minta ServiceRequest ke SIMRS</h2>
                <p className="text-xs text-gray-500">Masukkan registration_number untuk meminta ServiceRequest</p>
              </div>
              <div className="px-6 py-4 space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Order Identifier</div>
                  <div className="font-mono text-sm">{getOrderIdentifier(serviceModal.order)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                  <input
                    type="text"
                    value={serviceModal.registration}
                    onChange={(e) => setServiceModal(prev => ({ ...prev, registration: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="REG-YYYY-NNNN"
                  />
                </div>
                {serviceModal.result && serviceModal.result.error && (
                  <div className="px-3 py-2 rounded bg-red-50 text-red-700 text-sm">{serviceModal.result.error}</div>
                )}
                {serviceModal.result && !serviceModal.result.error && (
                  <div className="px-3 py-2 rounded bg-green-50 text-green-700 text-sm">Berhasil request ServiceRequest dari SIMRS</div>
                )}
                {(serviceModal.result && serviceModal.result.error) && (
                  <div className="mt-3 border-t pt-3">
                    <div className="text-sm font-medium mb-2">Inject ServiceRequest ID (manual)</div>
                    <div className="text-xs text-gray-500 mb-2">Tempel ID ServiceRequest dari SIMRS, contoh: <span className="font-mono">ServiceRequest/abcd-1234</span> atau hanya UUID.</div>
                    <input
                      type="text"
                      value={serviceModal.manualServiceRequestId}
                      onChange={(e) => setServiceModal(prev => ({ ...prev, manualServiceRequestId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="ServiceRequest/<id> atau <id>"
                    />
                    {serviceModal.injectResult && serviceModal.injectResult.error && (
                      <div className="px-3 py-2 rounded bg-red-50 text-red-700 text-sm mt-2">{serviceModal.injectResult.error}</div>
                    )}
                    {serviceModal.injectResult && !serviceModal.injectResult.error && (
                      <div className="px-3 py-2 rounded bg-green-50 text-green-700 text-sm mt-2">Berhasil inject ServiceRequest ID</div>
                    )}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t flex justify-end gap-2">
                <button
                  onClick={() => setServiceModal({ open: false, order: null, registration: '', loading: false, result: null, manualServiceRequestId: '', injectLoading: false, injectResult: null })}
                  className="px-3 py-2 rounded bg-slate-200 text-sm"
                >
                  Tutup
                </button>
                <button
                  onClick={requestSimrsServiceRequest}
                  disabled={serviceModal.loading}
                  className={`px-3 py-2 rounded text-sm ${serviceModal.loading ? 'bg-gray-300 text-slate-600' : 'bg-purple-600 text-white'}`}
                >
                  {serviceModal.loading ? 'Meminta...' : 'Request ServiceRequest'}
                </button>
                {(serviceModal.result && serviceModal.result.error) && (
                  <button
                    onClick={injectServiceRequestId}
                    disabled={serviceModal.injectLoading}
                    className={`px-3 py-2 rounded text-sm ${serviceModal.injectLoading ? 'bg-gray-300 text-slate-600' : 'bg-emerald-600 text-white'}`}
                  >
                    {serviceModal.injectLoading ? 'Mengirim...' : 'Inject ServiceRequest ID'}
                  </button>
                )}
                {(() => {
                  const oid = getOrderId(serviceModal.order)
                  const hasReadiness = oid && orderReadiness[oid]
                  const success = (serviceModal.result && !serviceModal.result.error) || (serviceModal.injectResult && !serviceModal.injectResult.error)
                  if (hasReadiness && success) {
                    return (
                      <button
                        onClick={openReadinessFromServiceModal}
                        className="px-3 py-2 rounded bg-slate-800 text-white text-sm"
                      >
                        Lihat Validasi
                      </button>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

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
