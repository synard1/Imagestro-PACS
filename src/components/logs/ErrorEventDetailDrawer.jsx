import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePermissions } from '../../hooks/usePermissions'
import { SeverityBadge } from './SeverityBadge'
import { resolveErrorEvent } from '../../services/logsService'

/**
 * ErrorEventDetailDrawer — Slide-over drawer showing full error event details.
 *
 * @param {Object} props
 * @param {Object|null} props.event - The error event record to display
 * @param {boolean} props.open - Whether the drawer is open
 * @param {Function} props.onClose - Called when the drawer should close
 * @param {Function} [props.onResolved] - Called after the event is successfully resolved
 */
export function ErrorEventDetailDrawer({ event, open, onClose, onResolved }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState(null)

  const canResolve = hasPermission(['logs.admin', 'logs:admin'], true)

  const handleResolve = async () => {
    if (!event?.id) return
    setResolving(true)
    setResolveError(null)
    try {
      await resolveErrorEvent(event.id)
      if (onResolved) onResolved(event.id)
    } catch (err) {
      setResolveError(err?.message || t('logs_resolve_error', 'Gagal menandai sebagai resolved.'))
    } finally {
      setResolving(false)
    }
  }

  const formatTimestamp = (val) => {
    if (!val) return '-'
    const d = typeof val === 'number' ? new Date(val) : new Date(val)
    return d.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'medium' })
  }

  const parseMetadata = (meta) => {
    if (!meta) return null
    if (typeof meta === 'string') {
      try {
        return JSON.parse(meta)
      } catch {
        return meta
      }
    }
    return meta
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-neutral-900 border-l border-neutral-700 shadow-xl overflow-y-auto transition-transform"
        role="dialog"
        aria-modal="true"
        aria-labelledby="error-drawer-title"
      >
        {/* Header */}
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-700 px-5 py-4 flex items-center justify-between z-10">
          <h2 id="error-drawer-title" className="text-lg font-semibold text-neutral-100">
            {t('logs_error_detail_title', 'Detail Error Event')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 transition-colors"
            aria-label={t('logs_close', 'Tutup')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {event ? (
          <div className="px-5 py-4 space-y-5">
            {/* Severity + Status */}
            <div className="flex items-center gap-3">
              <SeverityBadge severity={event.severity} />
              {event.resolved_at ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900/60 text-green-300">
                  {t('logs_resolved', 'Resolved')}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-700 text-neutral-300">
                  {t('logs_unresolved', 'Belum Resolved')}
                </span>
              )}
            </div>

            {/* Key fields */}
            <div className="grid grid-cols-1 gap-3">
              <DetailField label={t('logs_field_id', 'ID')} value={event.id} mono />
              <DetailField label={t('logs_field_timestamp', 'Waktu')} value={formatTimestamp(event.timestamp)} />
              <DetailField label={t('logs_field_worker', 'Worker')} value={event.worker} />
              <DetailField label={t('logs_field_error_type', 'Tipe Error')} value={event.error_type} />
              <DetailField label={t('logs_field_error_code', 'Kode Error')} value={event.error_code} />
              <DetailField label={t('logs_field_message', 'Pesan')} value={event.message} />
              <DetailField label={t('logs_field_request_id', 'Request ID')} value={event.request_id} mono />
              <DetailField label={t('logs_field_user_id', 'User ID')} value={event.user_id} mono />
              <DetailField label={t('logs_field_tenant_id', 'Tenant ID')} value={event.tenant_id} mono />
            </div>

            {/* Stack trace */}
            {event.stack_trace && (
              <div>
                <h3 className="text-sm font-medium text-neutral-300 mb-2">
                  {t('logs_field_stack_trace', 'Stack Trace')}
                </h3>
                <pre className="bg-neutral-950 border border-neutral-700 rounded p-3 text-xs text-neutral-300 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                  {event.stack_trace}
                </pre>
              </div>
            )}

            {/* Metadata */}
            {event.metadata && (
              <div>
                <h3 className="text-sm font-medium text-neutral-300 mb-2">
                  {t('logs_field_metadata', 'Metadata')}
                </h3>
                <pre className="bg-neutral-950 border border-neutral-700 rounded p-3 text-xs text-neutral-300 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                  {JSON.stringify(parseMetadata(event.metadata), null, 2)}
                </pre>
              </div>
            )}

            {/* Resolution info */}
            {event.resolved_at && (
              <div className="bg-green-950/30 border border-green-800/50 rounded p-3 space-y-1">
                <h3 className="text-sm font-medium text-green-300">
                  {t('logs_resolution_info', 'Informasi Resolusi')}
                </h3>
                <DetailField
                  label={t('logs_field_resolved_at', 'Resolved Pada')}
                  value={formatTimestamp(event.resolved_at)}
                />
                <DetailField
                  label={t('logs_field_resolved_by', 'Resolved Oleh')}
                  value={event.resolved_by}
                  mono
                />
              </div>
            )}

            {/* Resolve action */}
            {canResolve && !event.resolved_at && (
              <div className="pt-3 border-t border-neutral-700">
                {resolveError && (
                  <p className="text-sm text-red-400 mb-2">{resolveError}</p>
                )}
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={resolving}
                  className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors flex items-center gap-2"
                >
                  {resolving && (
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {t('logs_resolve_btn', 'Tandai Sebagai Resolved')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-neutral-500">
            {t('logs_no_event_selected', 'Tidak ada event yang dipilih.')}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Simple field display component.
 */
function DetailField({ label, value, mono = false }) {
  if (!value && value !== 0) return null
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`text-sm text-neutral-200 mt-0.5 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
