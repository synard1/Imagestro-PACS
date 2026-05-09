import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { getConfig } from '../services/config'
import { getDataStorageConfig } from '../services/dataSync'
import {
  getWorklist,
  getWorklistSummary,
  ORDER_STATUS,
  PRIORITY
} from '../services/worklistService'
import WorklistStatusBadge from '../components/worklist/WorklistStatusBadge'
import WorklistPriorityBadge from '../components/worklist/WorklistPriorityBadge'
import WorklistActions from '../components/worklist/WorklistActions'
import RescheduleModal from '../components/worklist/RescheduleModal'
import CancelOrderModal from '../components/worklist/CancelOrderModal'
import DicomUploader from '../components/dicom/DicomUploader'
import {
  FunnelIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  ChartBarIcon,
  ArrowUpTrayIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'

import StorageIndicator from '../components/StorageIndicator'

export default function Worklist() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModality, setSelectedModality] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedPriority, setSelectedPriority] = useState('')
  const [selectedDate, setSelectedDate] = useState('')

  // Modals
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showDicomUploadModal, setShowDicomUploadModal] = useState(false)

  // Config
  const [appConfig, setAppConfig] = useState(null)

  // Load worklist data
  const loadWorklist = async () => {
    try {
      setLoading(true)

      const filters = {
        search: searchQuery,
        modality: selectedModality,
        status: selectedStatus,
        priority: selectedPriority,
        date: selectedDate
      }

      const [worklistData, summaryData] = await Promise.all([
        getWorklist(filters),
        getWorklistSummary(selectedDate)
      ])

      // Handle different response formats (array or object with items/data/worklists property)
      let worklistArray = Array.isArray(worklistData)
        ? worklistData
        : (worklistData?.worklists || worklistData?.items || worklistData?.data || [])

      // Map backend field names to UI field names
      worklistArray = worklistArray.map(item => {
        // Parse scheduled_at into date and time (format: "2025-11-07 16:00:00")
        let scheduledDate = item.scheduled_date || ''
        let scheduledTime = item.scheduled_time || ''
        if (item.scheduled_at && !scheduledDate) {
          const parts = item.scheduled_at.split(' ')
          scheduledDate = parts[0] || ''
          scheduledTime = parts[1]?.substring(0, 5) || '' // Get HH:MM
        }

        // Map gender to patient_sex format
        const genderMap = { 'male': 'M', 'female': 'F', 'other': 'O' }
        const patientSex = item.patient_sex || genderMap[item.gender?.toLowerCase()] || 'U'

        // Normalize status to lowercase for UI consistency
        const normalizedStatus = (item.status || 'scheduled').toLowerCase()

        return {
          ...item,
          // Map backend fields to UI fields
          accession_no: item.accession_no || item.accession_number,
          order_number: item.order_number || item.accession_number,
          // Ensure order_id and worklist_id are available
          worklist_id: item.id,
          order_id: item.order_id || item.id,
          // Normalize status to lowercase
          status: normalizedStatus,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          patient_name: item.patient_name?.replace('^', ' ') || '', // Replace ^ with space
          patient_id: item.patient_id || item.patient_medical_record_number || '',
          patient_sex: patientSex,
          patient_dob: item.patient_dob || item.patient_birth_date || '',
          modality: item.modality,
          requested_procedure: item.requested_procedure || item.procedure_description || '-',
          priority: item.priority?.toLowerCase() || 'routine',
          station_ae_title: item.station_ae_title || item.station_aet || item.scheduled_station_ae_title || ''
        }
      })

      // Local filter fallback when backend ignores query params
      const applyLocalFilters = () => {
        let filtered = [...worklistArray]

        // Search
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase()
          filtered = filtered.filter(item => {
            const fields = [
              item.patient_name,
              item.accession_no,
              item.order_number,
              item.patient_id,
              item.patient_dob,
              item.modality,
              item.requested_procedure
            ]
            return fields.some(v => (v || '').toString().toLowerCase().includes(q))
          })
        }

        // Status
        if (selectedStatus) {
          filtered = filtered.filter(item => (item.status || '').toLowerCase() === selectedStatus.toLowerCase())
        }

        // Priority
        if (selectedPriority) {
          filtered = filtered.filter(item => (item.priority || '').toLowerCase() === selectedPriority.toLowerCase())
        }

        // Modality
        if (selectedModality) {
          filtered = filtered.filter(item => (item.modality || '').toUpperCase() === selectedModality.toUpperCase())
        }

        return filtered
      }

      worklistArray = applyLocalFilters()

      // Normalize summary from backend (support multiple shapes)
      const normalizedSummary = (() => {
        const base = { total: 0, by_status: {}, by_modality: {}, by_priority: {} }

        // First try to get summary from dedicated summary endpoint
        const src = summaryData?.data || summaryData?.summary || summaryData || {}

        // If backend already provides by_status map
        if (src.by_status && Object.keys(src.by_status).length > 0) {
          return {
            total: src.total ?? 0,
            by_status: src.by_status || {},
            by_modality: src.by_modality || {},
            by_priority: src.by_priority || {}
          }
        }

        // Try to get total from worklist response pagination
        const paginationTotal = worklistData?.pagination?.total || 0

        // Fallback: derive from current rows (most reliable)
        const derived = { ...base }
        derived.total = paginationTotal || worklistArray.length

        worklistArray.forEach(item => {
          const st = item.status?.toLowerCase() || 'scheduled'
          const md = item.modality
          const pr = item.priority
          if (st) derived.by_status[st] = (derived.by_status[st] || 0) + 1
          if (md) derived.by_modality[md] = (derived.by_modality[md] || 0) + 1
          if (pr) derived.by_priority[pr] = (derived.by_priority[pr] || 0) + 1
        })
        return derived
      })()

      setRows(worklistArray)
      setSummary(normalizedSummary)
    } catch (error) {
      console.error('Failed to load worklist:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorklist()

    // Load config
    const loadConfig = async () => {
      const config = await getConfig()
      setAppConfig(config)
    }
    loadConfig()
  }, [searchQuery, selectedModality, selectedStatus, selectedPriority, selectedDate])

  // Get current storage configuration
  const storageConfig = getDataStorageConfig()

  // Modal handlers
  const handleDicomUploadClick = (order) => {
    setSelectedOrder(order)
    setShowDicomUploadModal(true)
  }

  const handleDicomUploadComplete = (result) => {
    console.log('DICOM upload complete:', result)

    // Show success notification with study info if available
    if (result.dicom_metadata) {
      const metadata = result.dicom_metadata
      console.log('Study created:', {
        patientName: metadata.patient_name,
        studyDate: metadata.study_date,
        modality: metadata.modality
      })
    }

    // Reload worklist to reflect any status changes
    loadWorklist()
  }

  const handleRescheduleClick = (order) => {
    setSelectedOrder(order)
    setShowRescheduleModal(true)
  }

  const handleCancelClick = (order) => {
    setSelectedOrder(order)
    setShowCancelModal(true)
  }

  const handleRescheduleComplete = () => {
    loadWorklist()
    setShowRescheduleModal(false)
    setSelectedOrder(null)
  }

  const handleCancelComplete = () => {
    loadWorklist()
    setShowCancelModal(false)
    setSelectedOrder(null)
  }

  const handleStatusChange = async (newStatus) => {
    // Reload worklist to reflect the status change
    await loadWorklist()
  }

  const handleCloseModal = () => {
    setShowRescheduleModal(false)
    setShowCancelModal(false)
    setShowDicomUploadModal(false)
    setSelectedOrder(null)
  }

  // Get today's date for default filter
  const today = new Date().toISOString().split('T')[0]

  if (!appConfig) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">{t('Loading configuration...')}</div></div>

  const backendEnabled = appConfig.backendEnabled
  const storageType = backendEnabled ? 'external' : (storageConfig.mode === 'server' ? 'server' : 'browser')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{t('Worklist Management')}</h1>
          <StorageIndicator storageType={storageType} />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadWorklist()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium border border-gray-200"
            title={t('Refresh worklist data from backend')}
          >
            <ArrowPathIcon className="h-4 w-4" />
            {t('Refresh Data')}
          </button>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-gray-400" />
            <input
              type="date"
              value={selectedDate || today}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('Total Orders')}</p>
                <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
              </div>
              <ChartBarIcon className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('Scheduled')}</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {((summary.by_status?.[ORDER_STATUS.SCHEDULED] || 0) + (summary.by_status?.[ORDER_STATUS.ENQUEUED] || 0))}
                </p>
              </div>
              <CalendarIcon className="h-8 w-8 text-indigo-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('In Progress')}</p>
                <p className="text-2xl font-bold text-blue-600">
                  {((summary.by_status?.[ORDER_STATUS.ARRIVED] || 0) + (summary.by_status?.[ORDER_STATUS.IN_PROGRESS] || 0))}
                </p>
              </div>
              <div className="text-2xl">🔄</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('Completed')}</p>
                <p className="text-2xl font-bold text-green-600">
                  {summary.by_status?.[ORDER_STATUS.COMPLETED] || 0}
                </p>
              </div>
              <div className="text-2xl">✅</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
        <div className="flex items-center gap-3 flex-wrap">
          <FunnelIcon className="h-5 w-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">{t('Filters:')}</span>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('Search patient, accession, order...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Modality Filter */}
          <select
            value={selectedModality}
            onChange={(e) => setSelectedModality(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">{t('All Modalities')}</option>
            <option value="CT">CT</option>
            <option value="MR">MR</option>
            <option value="CR">CR</option>
            <option value="DX">DX</option>
            <option value="US">US</option>
            <option value="MG">MG</option>
            <option value="NM">NM</option>
            <option value="PT">PT</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">{t('All Statuses')}</option>
            <option value={ORDER_STATUS.SCHEDULED}>{t('Scheduled')}</option>
            <option value={ORDER_STATUS.ENQUEUED}>{t('Enqueued')}</option>
            <option value={ORDER_STATUS.ARRIVED}>{t('Arrived')}</option>
            <option value={ORDER_STATUS.IN_PROGRESS}>{t('In Progress')}</option>
            <option value={ORDER_STATUS.COMPLETED}>{t('Completed')}</option>
          </select>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">{t('All Priorities')}</option>
            <option value={PRIORITY.STAT}>{t('STAT')}</option>
            <option value={PRIORITY.URGENT}>{t('Urgent')}</option>
            <option value={PRIORITY.ROUTINE}>{t('Routine')}</option>
          </select>

          {/* Clear Filters */}
          {(searchQuery || selectedModality || selectedStatus || selectedPriority) && (
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedModality('')
                setSelectedStatus('')
                setSelectedPriority('')
              }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {t('Clear Filters')}
            </button>
          )}
        </div>
      </div>

      {/* Worklist Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">{t('Loading worklist...')}</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-lg font-medium">{t('No worklist items found')}</p>
            <p className="text-sm">{t('Try adjusting your filters')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('No.')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('Order Info')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('Patient')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('Procedure')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('Scheduled')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('Priority')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('Status')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((order, index) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {index + 1}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{order.order_number}</div>
                        <div className="text-gray-500 font-mono text-xs">{order.accession_no}</div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{order.patient_name}</div>
                        <div className="text-gray-500 text-xs">
                          {order.patient_sex} • {order.patient_dob}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{order.requested_procedure}</div>
                        <div className="text-gray-500 text-xs flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">
                            {order.modality}
                          </span>
                          {order.station_ae_title && (
                            <span className="text-gray-400">→ {order.station_ae_title}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {order.scheduled_date && order.scheduled_time ? (
                          <>
                            <div>{order.scheduled_date}</div>
                            <div className="text-gray-500 text-xs">{order.scheduled_time}</div>
                          </>
                        ) : (
                          <span className="text-gray-400">{t('Not scheduled')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <WorklistPriorityBadge priority={order.priority} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <WorklistStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <WorklistActions
                          order={order}
                          onStatusChange={handleStatusChange}
                          onReschedule={handleRescheduleClick}
                          onCancel={handleCancelClick}
                          compact={true}
                        />
                        {![ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED, ORDER_STATUS.DISCONTINUED, ORDER_STATUS.DELIVERED].includes(order.status) && (
                          <button
                            onClick={() => handleDicomUploadClick(order)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title={t('Upload DICOM with auto tag extraction')}
                          >
                            <ArrowUpTrayIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRescheduleModal && selectedOrder && (
        <RescheduleModal
          order={selectedOrder}
          onClose={handleCloseModal}
          onComplete={handleRescheduleComplete}
        />
      )}

      {showCancelModal && selectedOrder && (
        <CancelOrderModal
          order={selectedOrder}
          onClose={handleCloseModal}
          onComplete={handleCancelComplete}
        />
      )}

      {/* DICOM Upload Modal with Auto Tag Extraction */}
      {showDicomUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{t('Upload DICOM File')}</h2>
                {selectedOrder && (
                  <p className="text-sm text-gray-600 mt-1">
                    {t('Order')}: {selectedOrder.order_number} - {selectedOrder.patient_name}
                  </p>
                )}
              </div>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <DicomUploader
                orderId={selectedOrder?.order_id || selectedOrder?.id}
                onUploadComplete={(result) => {
                  handleDicomUploadComplete(result)
                  handleCloseModal()
                }}
              />
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>{t('Auto Tag Extraction:')}</strong> {t('DICOM tags will be automatically extracted and updated following AWS HealthImaging specification. This includes patient information, study details, and series metadata.')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
