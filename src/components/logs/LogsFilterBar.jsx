import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

const LOG_LEVELS = ['debug', 'info', 'warn', 'error']
const SEVERITIES = ['low', 'medium', 'high', 'critical']
const WORKERS = [
  'api-gateway-v2',
  'auth-worker',
  'master-data-worker',
  'accession-worker',
  'tenant-seeding-worker',
  'order-worker',
  'logs-retention-worker',
]

/**
 * Filter bar for the Log Viewer page.
 * Provides time range, level, worker, request_id, and severity filters.
 *
 * @param {Object} props
 * @param {Function} props.onFilterChange - Called with the current filter state
 * @param {boolean} [props.showSeverity=false] - Show severity filter (errors tab)
 * @param {Object} [props.initialFilters] - Initial filter values
 */
export function LogsFilterBar({ onFilterChange, showSeverity = false, initialFilters = {} }) {
  const { t } = useTranslation()

  const getDefaultFrom = () => {
    const d = new Date()
    d.setHours(d.getHours() - 1)
    return d.toISOString().slice(0, 16)
  }

  const [from, setFrom] = useState(initialFilters.from || getDefaultFrom())
  const [to, setTo] = useState(initialFilters.to || new Date().toISOString().slice(0, 16))
  const [level, setLevel] = useState(initialFilters.level || '')
  const [worker, setWorker] = useState(initialFilters.worker || '')
  const [requestId, setRequestId] = useState(initialFilters.request_id || '')
  const [severity, setSeverity] = useState(initialFilters.severity || '')

  const handleApply = useCallback(() => {
    const filters = {}
    if (from) filters.from = new Date(from).toISOString()
    if (to) filters.to = new Date(to).toISOString()
    if (level) filters.level = level
    if (worker) filters.worker = worker
    if (requestId) filters.request_id = requestId
    if (showSeverity && severity) filters.severity = severity
    onFilterChange(filters)
  }, [from, to, level, worker, requestId, severity, showSeverity, onFilterChange])

  const handleReset = useCallback(() => {
    setFrom(getDefaultFrom())
    setTo(new Date().toISOString().slice(0, 16))
    setLevel('')
    setWorker('')
    setRequestId('')
    setSeverity('')
    onFilterChange({})
  }, [onFilterChange])

  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Time range: From */}
        <div className="flex flex-col">
          <label className="text-xs text-neutral-400 mb-1" htmlFor="logs-filter-from">
            {t('logs_filter_from', 'Dari')}
          </label>
          <input
            id="logs-filter-from"
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-neutral-900 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Time range: To */}
        <div className="flex flex-col">
          <label className="text-xs text-neutral-400 mb-1" htmlFor="logs-filter-to">
            {t('logs_filter_to', 'Sampai')}
          </label>
          <input
            id="logs-filter-to"
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-neutral-900 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Level dropdown */}
        <div className="flex flex-col">
          <label className="text-xs text-neutral-400 mb-1" htmlFor="logs-filter-level">
            {t('logs_filter_level', 'Level')}
          </label>
          <select
            id="logs-filter-level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="bg-neutral-900 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">{t('logs_filter_all_levels', 'Semua Level')}</option>
            {LOG_LEVELS.map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Worker dropdown */}
        <div className="flex flex-col">
          <label className="text-xs text-neutral-400 mb-1" htmlFor="logs-filter-worker">
            {t('logs_filter_worker', 'Worker')}
          </label>
          <select
            id="logs-filter-worker"
            value={worker}
            onChange={(e) => setWorker(e.target.value)}
            className="bg-neutral-900 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">{t('logs_filter_all_workers', 'Semua Worker')}</option>
            {WORKERS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>

        {/* Request ID input */}
        <div className="flex flex-col">
          <label className="text-xs text-neutral-400 mb-1" htmlFor="logs-filter-request-id">
            {t('logs_filter_request_id', 'Request ID')}
          </label>
          <input
            id="logs-filter-request-id"
            type="text"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
            placeholder="UUIDv7..."
            className="bg-neutral-900 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Severity dropdown (errors tab only) */}
        {showSeverity && (
          <div className="flex flex-col">
            <label className="text-xs text-neutral-400 mb-1" htmlFor="logs-filter-severity">
              {t('logs_filter_severity', 'Severity')}
            </label>
            <select
              id="logs-filter-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="bg-neutral-900 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">{t('logs_filter_all_severities', 'Semua Severity')}</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-700">
        <button
          type="button"
          onClick={handleApply}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
        >
          {t('logs_filter_apply', 'Terapkan')}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-sm rounded transition-colors"
        >
          {t('logs_filter_reset', 'Reset')}
        </button>
      </div>
    </div>
  )
}
