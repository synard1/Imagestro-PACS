/**
 * Import Status Badge Component
 * 
 * Displays the import status of a Khanza order:
 * - Checking: Shows loading spinner while checking status
 * - Already Imported: Green badge indicating order was imported
 * - Ready to Import: Blue badge indicating order can be imported
 * - Failed: Red badge indicating import failed
 * - Partial: Yellow badge indicating partial import
 * 
 * Requirements: 1.4 - Import status indicator
 */

import { RefreshCw, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react'

/**
 * Import status types
 */
export const IMPORT_STATUS = {
  CHECKING: 'checking',
  IMPORTED: 'imported',
  READY: 'ready',
  FAILED: 'failed',
  PARTIAL: 'partial',
}

/**
 * Status configuration for styling and display
 */
const STATUS_CONFIG = {
  [IMPORT_STATUS.CHECKING]: {
    label: 'Checking...',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
    icon: RefreshCw,
    iconClass: 'animate-spin',
  },
  [IMPORT_STATUS.IMPORTED]: {
    label: 'Already Imported',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    icon: CheckCircle2,
    iconClass: '',
  },
  [IMPORT_STATUS.READY]: {
    label: 'Ready to Import',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    icon: Clock,
    iconClass: '',
  },
  [IMPORT_STATUS.FAILED]: {
    label: 'Import Failed',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    icon: XCircle,
    iconClass: '',
  },
  [IMPORT_STATUS.PARTIAL]: {
    label: 'Partial Import',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    icon: AlertTriangle,
    iconClass: '',
  },
}

/**
 * Determine the status type from import status object
 * @param {Object} importStatus - Import status object
 * @returns {string} Status type
 */
export const getStatusType = (importStatus) => {
  if (!importStatus) return IMPORT_STATUS.READY
  if (importStatus.checking) return IMPORT_STATUS.CHECKING
  if (importStatus.status === 'failed') return IMPORT_STATUS.FAILED
  if (importStatus.status === 'partial') return IMPORT_STATUS.PARTIAL
  if (importStatus.imported || importStatus.status === 'success') return IMPORT_STATUS.IMPORTED
  return IMPORT_STATUS.READY
}

/**
 * ImportStatusBadge Component
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isImported - Whether the order is already imported
 * @param {boolean} props.isChecking - Whether the status is being checked
 * @param {string} props.status - Direct status string (success, failed, partial)
 * @param {Object} props.importStatus - Full import status object
 * @param {string} props.size - Badge size (sm, md, lg)
 * @param {boolean} props.showLabel - Whether to show the label text
 * @param {string} props.className - Additional CSS classes
 */
export default function ImportStatusBadge({
  isImported,
  isChecking,
  status,
  importStatus,
  size = 'md',
  showLabel = true,
  className = '',
}) {
  // Determine status type
  let statusType = IMPORT_STATUS.READY
  
  if (importStatus) {
    statusType = getStatusType(importStatus)
  } else if (isChecking) {
    statusType = IMPORT_STATUS.CHECKING
  } else if (status === 'failed') {
    statusType = IMPORT_STATUS.FAILED
  } else if (status === 'partial') {
    statusType = IMPORT_STATUS.PARTIAL
  } else if (isImported || status === 'success') {
    statusType = IMPORT_STATUS.IMPORTED
  }

  const config = STATUS_CONFIG[statusType]
  const Icon = config.icon

  // Size classes
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }

  const iconSizes = {
    sm: 10,
    md: 12,
    lg: 14,
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${config.bgColor} ${config.textColor}
        ${sizeClasses[size]}
        ${className}
      `}
      title={config.label}
    >
      <Icon size={iconSizes[size]} className={config.iconClass} />
      {showLabel && <span>{config.label}</span>}
    </span>
  )
}

/**
 * Compact version for table cells
 */
export function ImportStatusDot({ isImported, isChecking, status, importStatus }) {
  let statusType = IMPORT_STATUS.READY
  
  if (importStatus) {
    statusType = getStatusType(importStatus)
  } else if (isChecking) {
    statusType = IMPORT_STATUS.CHECKING
  } else if (status === 'failed') {
    statusType = IMPORT_STATUS.FAILED
  } else if (status === 'partial') {
    statusType = IMPORT_STATUS.PARTIAL
  } else if (isImported || status === 'success') {
    statusType = IMPORT_STATUS.IMPORTED
  }

  const config = STATUS_CONFIG[statusType]
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${config.bgColor}`}
      title={config.label}
    >
      <Icon size={14} className={`${config.textColor} ${config.iconClass}`} />
    </span>
  )
}
