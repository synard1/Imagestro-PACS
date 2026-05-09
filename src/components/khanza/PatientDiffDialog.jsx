/**
 * Patient Diff Dialog Component
 * 
 * Shows differences between patient data in PACS and SIMRS Khanza.
 * Allows user to:
 * - View side-by-side comparison of patient data
 * - Choose to update PACS data with Khanza data
 * - Proceed with import using existing PACS data
 * 
 * Requirements: 5.2, 5.3, 5.4 - Patient data sync confirmation
 */

import { useState } from 'react'
import { 
  XMarkIcon, 
  ArrowRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { User, Calendar, MapPin, Phone, Hash } from 'lucide-react'

/**
 * Field configuration for display
 */
const FIELD_CONFIG = {
  patient_name: {
    label: 'Patient Name',
    icon: User,
  },
  patient_sex: {
    label: 'Gender',
    icon: User,
    format: (value) => {
      if (value === 'M' || value === 'male') return 'Male (Laki-laki)'
      if (value === 'F' || value === 'female') return 'Female (Perempuan)'
      return value || '-'
    },
  },
  patient_birthdate: {
    label: 'Birth Date',
    icon: Calendar,
    format: (value) => {
      if (!value) return '-'
      try {
        const date = new Date(value)
        if (isNaN(date.getTime())) return value
        return date.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      } catch {
        return value
      }
    },
  },
  patient_address: {
    label: 'Address',
    icon: MapPin,
  },
  patient_phone: {
    label: 'Phone',
    icon: Phone,
  },
  mrn: {
    label: 'Medical Record Number',
    icon: Hash,
  },
}

/**
 * Single field comparison row
 */
function DiffRow({ field, pacsValue, khanzaValue, hasDiff }) {
  const config = FIELD_CONFIG[field] || { label: field, icon: Hash }
  const Icon = config.icon
  const formatValue = config.format || ((v) => v || '-')

  return (
    <div className={`
      grid grid-cols-[1fr,auto,1fr] gap-4 p-3 rounded-lg
      ${hasDiff ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}
    `}>
      {/* PACS Value */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
          <Icon size={12} />
          <span>{config.label}</span>
          <span className="text-gray-400">(PACS)</span>
        </div>
        <div className={`text-sm ${hasDiff ? 'text-gray-600' : 'text-gray-900'}`}>
          {formatValue(pacsValue)}
        </div>
      </div>

      {/* Arrow indicator */}
      <div className="flex items-center justify-center">
        {hasDiff ? (
          <ArrowRightIcon className="h-4 w-4 text-amber-500" />
        ) : (
          <CheckCircleIcon className="h-4 w-4 text-green-500" />
        )}
      </div>

      {/* Khanza Value */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
          <Icon size={12} />
          <span>{config.label}</span>
          <span className="text-gray-400">(SIMRS)</span>
        </div>
        <div className={`text-sm ${hasDiff ? 'text-amber-700 font-medium' : 'text-gray-900'}`}>
          {formatValue(khanzaValue)}
        </div>
      </div>
    </div>
  )
}

/**
 * PatientDiffDialog Component
 * 
 * @param {Object} props - Component props
 * @param {Object} props.pacsPatient - Patient data from PACS
 * @param {Object} props.khanzaPatient - Patient data from Khanza (mapped)
 * @param {Object} props.differences - Difference object with hasDifferences and differences array
 * @param {Function} props.onConfirmUpdate - Called when user confirms update
 * @param {Function} props.onDeclineUpdate - Called when user declines update
 * @param {Function} props.onClose - Called when dialog is closed
 * @param {boolean} props.loading - Whether an action is in progress
 */
export default function PatientDiffDialog({
  pacsPatient,
  khanzaPatient,
  differences,
  onConfirmUpdate,
  onDeclineUpdate,
  onClose,
  loading = false,
}) {
  const [selectedAction, setSelectedAction] = useState(null)

  // Fields to compare
  const fieldsToCompare = [
    'mrn',
    'patient_name',
    'patient_sex',
    'patient_birthdate',
    'patient_address',
    'patient_phone',
  ]

  // Build diff map for quick lookup
  const diffMap = new Map()
  if (differences?.differences) {
    differences.differences.forEach(diff => {
      // Map field labels back to field keys
      const fieldKey = Object.entries(FIELD_CONFIG).find(
        ([, config]) => config.label === diff.field
      )?.[0]
      if (fieldKey) {
        diffMap.set(fieldKey, diff)
      }
    })
  }

  const handleConfirm = async () => {
    setSelectedAction('update')
    if (onConfirmUpdate) {
      await onConfirmUpdate()
    }
  }

  const handleDecline = async () => {
    setSelectedAction('keep')
    if (onDeclineUpdate) {
      await onDeclineUpdate()
    }
  }

  const diffCount = differences?.differences?.length || 0

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-full">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Patient Data Differences Found
              </h3>
              <p className="text-sm text-gray-500">
                {diffCount} field{diffCount !== 1 ? 's' : ''} differ between PACS and SIMRS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Patient identifier */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <User size={16} className="text-blue-600" />
              <span className="text-blue-700 font-medium">
                {khanzaPatient?.patient_name || pacsPatient?.name || 'Unknown Patient'}
              </span>
              <span className="text-blue-600">
                (MRN: {khanzaPatient?.mrn || pacsPatient?.mrn || '-'})
              </span>
            </div>
          </div>

          {/* Comparison table */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr,auto,1fr] gap-4 px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div>Current PACS Data</div>
              <div></div>
              <div>SIMRS Khanza Data</div>
            </div>

            {fieldsToCompare.map((field) => {
              // Get values from both sources
              let pacsValue, khanzaValue
              
              // Map field names to actual object properties
              switch (field) {
                case 'mrn':
                  pacsValue = pacsPatient?.mrn || pacsPatient?.medical_record_number
                  khanzaValue = khanzaPatient?.mrn
                  break
                case 'patient_name':
                  pacsValue = pacsPatient?.name || pacsPatient?.patient_name
                  khanzaValue = khanzaPatient?.patient_name
                  break
                case 'patient_sex':
                  pacsValue = pacsPatient?.gender || pacsPatient?.sex
                  khanzaValue = khanzaPatient?.patient_sex
                  break
                case 'patient_birthdate':
                  pacsValue = pacsPatient?.birth_date || pacsPatient?.birthdate
                  khanzaValue = khanzaPatient?.patient_birthdate
                  break
                case 'patient_address':
                  pacsValue = pacsPatient?.address
                  khanzaValue = khanzaPatient?.patient_address
                  break
                case 'patient_phone':
                  pacsValue = pacsPatient?.phone
                  khanzaValue = khanzaPatient?.patient_phone
                  break
                default:
                  pacsValue = pacsPatient?.[field]
                  khanzaValue = khanzaPatient?.[field]
              }

              const hasDiff = diffMap.has(field)

              return (
                <DiffRow
                  key={field}
                  field={field}
                  pacsValue={pacsValue}
                  khanzaValue={khanzaValue}
                  hasDiff={hasDiff}
                />
              )
            })}
          </div>

          {/* Info message */}
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-sm text-gray-600">
              <strong>What would you like to do?</strong>
            </p>
            <ul className="mt-2 text-sm text-gray-500 space-y-1">
              <li className="flex items-start gap-2">
                <ArrowPathIcon className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Update PACS:</strong> Replace PACS patient data with SIMRS data
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Keep PACS:</strong> Proceed with import using existing PACS data
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDecline}
            disabled={loading}
            className={`
              px-4 py-2 text-sm font-medium rounded-lg transition-colors
              ${selectedAction === 'keep' && loading
                ? 'bg-green-100 text-green-700'
                : 'bg-white text-green-700 border border-green-300 hover:bg-green-50'
              }
              disabled:opacity-50
            `}
          >
            {selectedAction === 'keep' && loading ? (
              <span className="flex items-center gap-2">
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                Processing...
              </span>
            ) : (
              'Keep PACS Data'
            )}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`
              px-4 py-2 text-sm font-medium rounded-lg transition-colors
              ${selectedAction === 'update' && loading
                ? 'bg-blue-400 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
              disabled:opacity-50
            `}
          >
            {selectedAction === 'update' && loading ? (
              <span className="flex items-center gap-2">
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                Updating...
              </span>
            ) : (
              'Update PACS Data'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Hook for managing patient diff dialog state
 */
export function usePatientDiffDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [dialogData, setDialogData] = useState(null)
  const [resolvePromise, setResolvePromise] = useState(null)

  const showDiffDialog = (pacsPatient, khanzaPatient, differences) => {
    return new Promise((resolve) => {
      setDialogData({ pacsPatient, khanzaPatient, differences })
      setResolvePromise(() => resolve)
      setIsOpen(true)
    })
  }

  const handleConfirmUpdate = () => {
    if (resolvePromise) {
      resolvePromise({ action: 'update', updatePatient: true })
    }
    setIsOpen(false)
    setDialogData(null)
  }

  const handleDeclineUpdate = () => {
    if (resolvePromise) {
      resolvePromise({ action: 'keep', updatePatient: false })
    }
    setIsOpen(false)
    setDialogData(null)
  }

  const handleClose = () => {
    if (resolvePromise) {
      resolvePromise({ action: 'cancel', updatePatient: false })
    }
    setIsOpen(false)
    setDialogData(null)
  }

  return {
    isOpen,
    dialogData,
    showDiffDialog,
    handleConfirmUpdate,
    handleDeclineUpdate,
    handleClose,
  }
}
