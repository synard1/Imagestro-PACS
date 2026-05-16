import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { usePermissions } from '../../hooks/usePermissions'
import { LogsFilterBar } from '../../components/logs/LogsFilterBar'
import { LogsTable } from '../../components/logs/LogsTable'
import { ErrorEventDetailDrawer } from '../../components/logs/ErrorEventDetailDrawer'
import {
  getAppLogs,
  getErrorEvents,
  getAuditLogs,
  getMetrics,
} from '../../services/logsService'

const TABS = [
  { id: 'app_logs', labelKey: 'logs_tab_app', defaultLabel: 'App Logs' },
  { id: 'error_events', labelKey: 'logs_tab_errors', defaultLabel: 'Errors' },
  { id: 'audit', labelKey: 'logs_tab_audit', defaultLabel: 'Audit' },
  { id: 'metrics', labelKey: 'logs_tab_metrics', defaultLabel: 'Metrics' },
]

/**
 * LogsViewerPage — Admin page for viewing centralized D1 logs.
 * Gated by LOGS_VIEWER permission.
 * Route: /admin/logs
 */
export default function LogsViewerPage() {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()

  // Permission gate
  const canView = hasPermission(['logs.read', 'logs:read'], true)

  const [activeTab, setActiveTab] = useState('app_logs')
  const [data, setData] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)

  /**
   * Fetch data for the active tab with given filters.
   */
  const fetchData = useCallback(async (tabId, filterParams, cursor = null) => {
    setLoading(true)
    try {
      const params = { ...filterParams }
      if (cursor) params.cursor = cursor

      let result
      switch (tabId) {
        case 'app_logs':
          result = await getAppLogs(params)
          break
        case 'error_events':
          result = await getErrorEvents(params)
          break
        case 'audit':
          result = await getAuditLogs(params)
          break
        case 'metrics':
          result = await getMetrics(params)
          break
        default:
          result = { items: [], next_cursor: null }
      }

      const response = result?.data || result
      const items = response?.items || []
      const nc = response?.next_cursor || null

      if (cursor) {
        // Append for pagination
        setData((prev) => [...prev, ...items])
      } else {
        setData(items)
      }
      setNextCursor(nc)
    } catch (err) {
      console.error('[LogsViewer] Fetch error:', err)
      if (!cursor) setData([])
      setNextCursor(null)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Handle filter change from LogsFilterBar.
   */
  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters)
    setNextCursor(null)
    fetchData(activeTab, newFilters)
  }, [activeTab, fetchData])

  /**
   * Handle tab switch.
   */
  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId)
    setData([])
    setNextCursor(null)
    fetchData(tabId, filters)
  }, [filters, fetchData])

  /**
   * Handle "Load More" (cursor pagination).
   */
  const handleLoadMore = useCallback(() => {
    if (nextCursor) {
      fetchData(activeTab, filters, nextCursor)
    }
  }, [activeTab, filters, nextCursor, fetchData])

  /**
   * Handle row click (errors tab — open detail drawer).
   */
  const handleRowClick = useCallback((event) => {
    setSelectedEvent(event)
    setDrawerOpen(true)
  }, [])

  /**
   * Handle error event resolved.
   */
  const handleResolved = useCallback((eventId) => {
    setData((prev) =>
      prev.map((item) =>
        item.id === eventId
          ? { ...item, resolved_at: Date.now(), resolved_by: 'current_user' }
          : item
      )
    )
    setDrawerOpen(false)
    setSelectedEvent(null)
  }, [])

  // 403 fallback
  if (!canView) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-neutral-200 mb-2">
            {t('logs_forbidden_title', 'Akses Ditolak')}
          </h2>
          <p className="text-neutral-400">
            {t('logs_forbidden_message', 'Anda tidak memiliki izin untuk mengakses halaman ini. Diperlukan permission LOGS_VIEWER.')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-100">
          {t('logs_page_title', 'Log Viewer')}
        </h1>
        <p className="text-sm text-neutral-400 mt-1">
          {t('logs_page_subtitle', 'Monitor dan analisis log sistem terpusat.')}
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-700">
        <nav className="flex gap-0 -mb-px" aria-label="Log tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
              }`}
              aria-selected={activeTab === tab.id}
              role="tab"
            >
              {t(tab.labelKey, tab.defaultLabel)}
            </button>
          ))}
        </nav>
      </div>

      {/* Filter bar */}
      <LogsFilterBar
        onFilterChange={handleFilterChange}
        showSeverity={activeTab === 'error_events'}
      />

      {/* Table */}
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg overflow-hidden">
        <LogsTable
          data={data}
          tab={activeTab}
          nextCursor={nextCursor}
          loading={loading}
          onLoadMore={handleLoadMore}
          onRowClick={activeTab === 'error_events' ? handleRowClick : undefined}
        />
      </div>

      {/* Error detail drawer */}
      <ErrorEventDetailDrawer
        event={selectedEvent}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          setSelectedEvent(null)
        }}
        onResolved={handleResolved}
      />
    </div>
  )
}
