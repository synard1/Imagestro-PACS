/**
 * Order Card Component
 * 
 * Displays a single Khanza radiology order with:
 * - Order number and request date/time
 * - Patient information (name, MRN)
 * - Procedure information
 * - Referring doctor
 * - Import status indicator
 * - Selection checkbox for batch import
 * 
 * Requirements: 1.3, 2.1 - Order display and selection for import
 */

import React from 'react'
import { User, FileText, Stethoscope, Calendar, Hash, Building2, AlertTriangle } from 'lucide-react'
import ImportStatusBadge from './ImportStatusBadge'

/**
 * Format date to Indonesian locale
 * @param {string} dateStr - Date string
 * @returns {string} Formatted date
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    // Handle various date formats
    let date
    if (dateStr.includes('-')) {
      // ISO format or DD-MM-YYYY
      const parts = dateStr.split('-')
      if (parts[0].length === 4) {
        // ISO format YYYY-MM-DD
        date = new Date(dateStr)
      } else {
        // Indonesian format DD-MM-YYYY
        date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
      }
    } else {
      date = new Date(dateStr)
    }

    if (isNaN(date.getTime())) return dateStr

    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/**
 * OrderCard Component
 * 
 * @param {Object} props - Component props
 * @param {Object} props.order - Order data from Khanza API
 * @param {Object} props.importStatus - Import status object
 * @param {Object} props.procedureMap - Map of procedure codes to names
 * @param {Set} props.unmappedCodes - Set of unmapped procedure codes
 * @param {boolean} props.isSelected - Whether the order is selected
 * @param {Function} props.onSelect - Selection handler
 * @param {Function} props.onClick - Click handler for viewing details
 * @param {boolean} props.showCheckbox - Whether to show selection checkbox
 * @param {boolean} props.compact - Use compact layout
 * @param {string} props.className - Additional CSS classes
 */
export default function OrderCard({
  order,
  importStatus,
  procedureMap = {},
  unmappedCodes = new Set(),
  isSelected = false,
  onSelect,
  onClick,
  showCheckbox = true,
  compact = false,
  className = '',
}) {
  if (!order) return null

  const handleCardClick = (e) => {
    // Don't trigger card click if clicking checkbox
    if (e.target.type === 'checkbox') return

    if (onClick) {
      onClick(order)
    } else if (onSelect) {
      onSelect(order)
    }
  }

  const handleCheckboxChange = (e) => {
    e.stopPropagation()
    if (onSelect) {
      onSelect(order)
    }
  }

  // Extract order data with fallbacks
  const orderNumber = order.noorder || order.no_order || '-'
  const requestDate = order.tgl_permintaan || order.request_date
  const requestTime = order.jam_permintaan || order.request_time
  const patientName = order.nm_pasien || order.patient_name || '-'
  const patientMrn = order.no_rkm_medis || order.mrn || '-'

  // Extract procedure info - handle array from new API or fallback
  const examinations = order.examinations || (Array.isArray(order.pemeriksaan) ? order.pemeriksaan : [order.pemeriksaan].filter(Boolean));
  
  // Resolve and Format for display
  const resolvedElements = examinations.map((exam, idx) => {
    const code = typeof exam === 'object' ? (exam.procedure_code || exam.kd_jenis_prw) : null;
    const name = typeof exam === 'object' 
      ? (exam.procedure_name || exam.nm_perawatan || exam.nm_tindakan || procedureMap[code]) 
      : (procedureMap[exam] || exam);
    const accession = typeof exam === 'object' ? exam.accession_number : null;
    
    const isUnmapped = code && unmappedCodes && unmappedCodes.has(code);
    
    return (
      <div key={idx} className="flex flex-col mb-1 last:mb-0">
        <div className="flex items-center gap-1">
          <span className={`text-sm ${isUnmapped ? "text-red-500 font-medium" : "text-gray-700"}`}>
            {name || '-'}
          </span>
          {isUnmapped && <AlertTriangle size={12} className="text-red-500" />}
        </div>
        {accession && (
          <span className="text-[10px] text-gray-500 font-mono leading-tight">
            {accession}
          </span>
        )}
      </div>
    );
  });

  const hasUnmapped = examinations.some(exam => {
    const code = typeof exam === 'object' ? (exam.procedure_code || exam.kd_jenis_prw) : exam;
    return unmappedCodes && unmappedCodes.has(code);
  });

  const procedureDisplay = resolvedElements.length > 0 ? resolvedElements : '-';
  
  // Simple string for compact mode
  const compactProcedureDisplay = examinations.map(exam => {
    const code = typeof exam === 'object' ? (exam.procedure_code || exam.kd_jenis_prw) : null;
    const name = typeof exam === 'object' 
      ? (exam.procedure_name || exam.nm_perawatan || exam.nm_tindakan || procedureMap[code]) 
      : (procedureMap[exam] || exam);
    return name;
  }).join(', ') || '-';

  const procedureCode = examinations.length === 1 ? (typeof examinations[0] === 'object' ? (examinations[0].procedure_code || examinations[0].kd_jenis_prw) : examinations[0]) : (examinations.length > 1 ? `${examinations.length} Procedures` : '-');
  const doctorName = order.nm_dokter || order.dokter_perujuk || order.referring_doctor || '-'
  const visitNumber = order.no_rawat || order.visit_number
  const unitName = order.nm_poli || order.unit_name

  if (compact) {
    return (
      <div
        className={`
          flex items-center gap-3 p-3 bg-white border rounded-lg transition-all
          ${isSelected
            ? 'border-blue-500 ring-1 ring-blue-200 bg-blue-50/30'
            : 'border-gray-200 hover:border-gray-300'
          }
          ${onClick || onSelect ? 'cursor-pointer' : ''}
          ${className}
        `}
        onClick={handleCardClick}
      >
        {showCheckbox && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-gray-900 truncate">
              {orderNumber}
            </span>
            <ImportStatusBadge importStatus={importStatus} size="sm" />
          </div>
          <div className="text-xs text-gray-500 truncate">
            {patientName} • {compactProcedureDisplay}
          </div>
        </div>

        <div className="text-xs text-gray-400 text-right flex-shrink-0">
          {formatDate(requestDate)}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`
        bg-white border rounded-lg p-4 transition-all
        ${isSelected
          ? 'border-blue-500 ring-2 ring-blue-200'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }
        ${onClick || onSelect ? 'cursor-pointer' : ''}
        ${className}
      `}
      onClick={handleCardClick}
    >
      {/* Header with order number and status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-gray-900">
              {orderNumber}
            </span>
            {visitNumber && (
              <span className="text-[10px] text-gray-600 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
                Reg: {visitNumber}
              </span>
            )}
            {procedureCode && procedureCode !== procedureDisplay && typeof procedureDisplay === 'string' && (
              <span className="text-xs text-gray-400 font-mono">
                ({procedureCode})
              </span>
            )}
            {hasUnmapped && (
              <span className="text-xs text-red-500 font-medium flex items-center gap-1 bg-red-50 px-1.5 py-0.5 rounded">
                <AlertTriangle size={12} /> Unmapped
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
            <Calendar size={12} />
            <span>{formatDate(requestDate)}</span>
            {requestTime && (
              <>
                <span>•</span>
                <span>{requestTime}</span>
              </>
            )}
          </div>
        </div>
        <ImportStatusBadge importStatus={importStatus} />
      </div>

      {/* Patient info */}
      <div className="flex items-center gap-2 mb-2">
        <User size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-900 truncate">{patientName}</span>
        <span className="text-xs text-gray-500 flex-shrink-0">({patientMrn})</span>
      </div>

      {/* Procedure info */}
      <div className="flex items-center gap-2 mb-2">
        <FileText size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-700 truncate">{procedureDisplay}</span>
      </div>

      {/* Referring doctor */}
      <div className="flex items-center gap-2 mb-2">
        <Stethoscope size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-600 truncate">{doctorName}</span>
      </div>

      {/* Additional info row */}
      {(visitNumber || unitName) && (
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-2">
          {visitNumber && (
            <div className="flex items-center gap-1">
              <Hash size={12} />
              <span>{visitNumber}</span>
            </div>
          )}
          {unitName && (
            <div className="flex items-center gap-1">
              <Building2 size={12} />
              <span>{unitName}</span>
            </div>
          )}
        </div>
      )}

      {/* Selection checkbox */}
      {showCheckbox && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleCheckboxChange}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Select for import
          </label>
        </div>
      )}
    </div>
  )
}

/**
 * OrderCardSkeleton - Loading placeholder
 */
export function OrderCardSkeleton({ compact = false }) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg animate-pulse">
        <div className="w-4 h-4 bg-gray-200 rounded" />
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-24 mb-1" />
          <div className="h-3 bg-gray-100 rounded w-40" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-16" />
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="h-4 bg-gray-200 rounded w-28 mb-1" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
        <div className="h-6 bg-gray-200 rounded-full w-24" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
        <div className="h-4 bg-gray-100 rounded w-2/3" />
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="h-4 bg-gray-100 rounded w-28" />
      </div>
    </div>
  )
}

/**
 * OrderCardList - Renders a list of order cards
 */
export function OrderCardList({
  orders,
  importStatuses = {},
  procedureMap = {},
  unmappedCodes = new Set(),
  selectedOrders = new Set(),
  onSelectOrder,
  onClickOrder,
  showCheckbox = true,
  compact = false,
  loading = false,
  emptyMessage = 'No orders found',
}) {
  if (loading) {
    return (
      <div className={compact ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
        {[...Array(6)].map((_, i) => (
          <OrderCardSkeleton key={i} compact={compact} />
        ))}
      </div>
    )
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <FileText size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-medium">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={compact ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
      {orders.map((order) => (
        <OrderCard
          key={order.noorder || order.no_order || order.id}
          order={order}
          importStatus={importStatuses[order.noorder || order.no_order]}
          procedureMap={procedureMap}
          unmappedCodes={unmappedCodes}
          isSelected={selectedOrders.has(order.noorder || order.no_order)}
          onSelect={onSelectOrder}
          onClick={onClickOrder}
          showCheckbox={showCheckbox}
          compact={compact}
        />
      ))}
    </div>
  )
}
