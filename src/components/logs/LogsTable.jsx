import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { SeverityBadge } from './SeverityBadge'

/**
 * Column definitions for each tab type.
 */
function getColumns(tab, t, onRowClick) {
  const baseTimestamp = {
    accessorKey: 'timestamp',
    header: t('logs_col_timestamp', 'Waktu'),
    cell: ({ getValue }) => {
      const val = getValue()
      if (!val) return '-'
      const d = typeof val === 'number' ? new Date(val) : new Date(val)
      return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' })
    },
    size: 170,
  }

  const baseWorker = {
    accessorKey: 'worker',
    header: t('logs_col_worker', 'Worker'),
    size: 150,
  }

  const baseMessage = {
    accessorKey: 'message',
    header: t('logs_col_message', 'Pesan'),
    cell: ({ getValue }) => (
      <span className="truncate block max-w-[400px]" title={getValue()}>
        {getValue() || '-'}
      </span>
    ),
  }

  if (tab === 'app_logs') {
    return [
      baseTimestamp,
      {
        accessorKey: 'level',
        header: t('logs_col_level', 'Level'),
        cell: ({ getValue }) => {
          const level = getValue()
          const colors = {
            debug: 'text-neutral-400',
            info: 'text-blue-400',
            warn: 'text-yellow-400',
            error: 'text-red-400',
          }
          return (
            <span className={`font-mono text-xs ${colors[level] || 'text-neutral-300'}`}>
              {(level || '').toUpperCase()}
            </span>
          )
        },
        size: 80,
      },
      baseWorker,
      {
        accessorKey: 'endpoint',
        header: t('logs_col_endpoint', 'Endpoint'),
        size: 180,
      },
      {
        accessorKey: 'status',
        header: t('logs_col_status', 'Status'),
        size: 70,
      },
      {
        accessorKey: 'duration_ms',
        header: t('logs_col_duration', 'Durasi (ms)'),
        size: 100,
      },
      baseMessage,
    ]
  }

  if (tab === 'error_events') {
    return [
      baseTimestamp,
      {
        accessorKey: 'severity',
        header: t('logs_col_severity', 'Severity'),
        cell: ({ getValue }) => <SeverityBadge severity={getValue()} />,
        size: 100,
      },
      baseWorker,
      {
        accessorKey: 'error_type',
        header: t('logs_col_error_type', 'Tipe Error'),
        size: 150,
      },
      baseMessage,
      {
        accessorKey: 'resolved_at',
        header: t('logs_col_resolved', 'Resolved'),
        cell: ({ getValue }) => {
          const val = getValue()
          if (!val) return <span className="text-neutral-500">-</span>
          return <span className="text-green-400">✓</span>
        },
        size: 80,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onRowClick && onRowClick(row.original)}
            className="text-blue-400 hover:text-blue-300 text-xs underline"
          >
            {t('logs_detail', 'Detail')}
          </button>
        ),
        size: 70,
      },
    ]
  }

  if (tab === 'audit') {
    return [
      baseTimestamp,
      baseWorker,
      {
        accessorKey: 'action',
        header: t('logs_col_action', 'Aksi'),
        size: 160,
      },
      {
        accessorKey: 'actor_user_id',
        header: t('logs_col_actor', 'Aktor'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs truncate block max-w-[140px]" title={getValue()}>
            {getValue() || '-'}
          </span>
        ),
        size: 150,
      },
      {
        accessorKey: 'resource_type',
        header: t('logs_col_resource_type', 'Resource'),
        size: 120,
      },
      {
        accessorKey: 'resource_id',
        header: t('logs_col_resource_id', 'Resource ID'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs truncate block max-w-[140px]" title={getValue()}>
            {getValue() || '-'}
          </span>
        ),
        size: 150,
      },
    ]
  }

  if (tab === 'metrics') {
    return [
      {
        accessorKey: 'period_start',
        header: t('logs_col_period', 'Periode'),
        cell: ({ row }) => {
          const start = row.original.period_start
          const end = row.original.period_end
          if (!start) return '-'
          const s = new Date(start).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
          const e = end ? new Date(end).toLocaleTimeString('id-ID', { timeStyle: 'short' }) : ''
          return `${s} - ${e}`
        },
        size: 200,
      },
      baseWorker,
      {
        accessorKey: 'endpoint',
        header: t('logs_col_endpoint', 'Endpoint'),
        size: 180,
      },
      {
        accessorKey: 'request_count',
        header: t('logs_col_requests', 'Requests'),
        size: 90,
      },
      {
        accessorKey: 'error_count',
        header: t('logs_col_errors', 'Errors'),
        cell: ({ getValue }) => {
          const val = getValue()
          return (
            <span className={val > 0 ? 'text-red-400' : 'text-neutral-400'}>
              {val ?? 0}
            </span>
          )
        },
        size: 80,
      },
      {
        accessorKey: 'p50_duration_ms',
        header: 'P50 (ms)',
        size: 80,
      },
      {
        accessorKey: 'p95_duration_ms',
        header: 'P95 (ms)',
        size: 80,
      },
      {
        accessorKey: 'p99_duration_ms',
        header: 'P99 (ms)',
        size: 80,
      },
    ]
  }

  // Fallback
  return [baseTimestamp, baseWorker, baseMessage]
}

/**
 * LogsTable — TanStack React Table with cursor-based pagination.
 *
 * @param {Object} props
 * @param {Array} props.data - Array of log records
 * @param {string} props.tab - Current tab: app_logs | error_events | audit | metrics
 * @param {string|null} props.nextCursor - Cursor for next page (null = no more)
 * @param {boolean} props.loading - Whether data is loading
 * @param {Function} props.onLoadMore - Called when "Load More" is clicked
 * @param {Function} [props.onRowClick] - Called when a row action is clicked (errors tab)
 */
export function LogsTable({ data = [], tab, nextCursor, loading, onLoadMore, onRowClick }) {
  const { t } = useTranslation()

  const columns = useMemo(
    () => getColumns(tab, t, onRowClick),
    [tab, t, onRowClick]
  )

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-neutral-300">
        <thead className="text-xs uppercase bg-neutral-800 text-neutral-400 border-b border-neutral-700">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2.5 whitespace-nowrap"
                  style={{ width: header.column.columnDef.size }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {/* Loading state */}
          {loading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-neutral-500">
                <div className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('logs_loading', 'Memuat data...')}
                </div>
              </td>
            </tr>
          )}

          {/* Empty state */}
          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-neutral-500">
                {t('logs_empty', 'Tidak ada data log untuk filter yang dipilih.')}
              </td>
            </tr>
          )}

          {/* Data rows */}
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-neutral-800 hover:bg-neutral-800/50 transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Load More button (cursor pagination) */}
      <div className="flex items-center justify-center py-3 border-t border-neutral-700">
        {nextCursor ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="px-4 py-1.5 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-200 text-sm rounded transition-colors flex items-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {t('logs_load_more', 'Muat Lebih Banyak')}
          </button>
        ) : (
          data.length > 0 && (
            <span className="text-xs text-neutral-500">
              {t('logs_no_more', 'Semua data telah ditampilkan.')}
            </span>
          )
        )}
      </div>
    </div>
  )
}
