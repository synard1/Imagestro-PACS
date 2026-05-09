import { useState } from 'react'
import { getStatusConfig, getAvailableTransitions, isValidTransition, getAllStatuses } from '../config/orderStatus'

/**
 * StatusChanger - UI component for changing order status
 * Validates transitions based on workflow rules
 */
export default function StatusChanger({ currentStatus, onStatusChange, disabled = false, showNotes = true }) {
  const [selectedStatus, setSelectedStatus] = useState('')
  const [notes, setNotes] = useState('')
  const [isChanging, setIsChanging] = useState(false)

  const currentConfig = getStatusConfig(currentStatus)
  const availableTransitions = getAvailableTransitions(currentStatus, false)

  const handleChange = async () => {
    if (!selectedStatus) {
      alert('Please select a new status')
      return
    }

    if (!isValidTransition(currentStatus, selectedStatus, false)) {
      alert('Invalid status transition')
      return
    }

    setIsChanging(true)
    try {
      await onStatusChange({
        status: selectedStatus,
        notes: notes.trim(),
        timestamp: new Date().toISOString()
      })
      setSelectedStatus('')
      setNotes('')
    } catch (e) {
      alert(`Failed to change status: ${e.message}`)
    } finally {
      setIsChanging(false)
    }
  }

  if (availableTransitions.length === 0) {
    return (
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>🔒</span>
          <span>
            Status <strong className={currentConfig.textColor}>{currentConfig.label}</strong> is final. No further transitions available.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Current Status */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">Current Status:</span>
        <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-semibold ${currentConfig.bgColor} ${currentConfig.textColor}`}>
          <span>{currentConfig.icon}</span>
          <span>{currentConfig.label}</span>
        </span>
      </div>

      {/* Status Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Change Status To:
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {availableTransitions.map(transition => (
            <button
              key={transition.key}
              type="button"
              disabled={disabled || isChanging}
              onClick={() => setSelectedStatus(transition.key)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                selectedStatus === transition.key
                  ? `${transition.bgColor} border-${transition.color}-500 shadow-md`
                  : 'bg-white border-slate-200 hover:border-slate-300'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{transition.icon}</span>
                <span className={`font-semibold text-sm ${selectedStatus === transition.key ? transition.textColor : 'text-slate-700'}`}>
                  {transition.label}
                </span>
              </div>
              <div className="text-xs text-slate-600">
                {transition.description}
              </div>
              {transition.dicom && (
                <div className="mt-1 text-[10px] text-slate-500 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  DICOM {transition.mpps ? 'MPPS' : 'SPS'}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Notes (optional) */}
      {showNotes && selectedStatus && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Notes (optional)
          </label>
          <textarea
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={3}
            placeholder="Add notes about this status change..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={disabled || isChanging}
          />
        </div>
      )}

      {/* Actions */}
      {selectedStatus && (
        <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={handleChange}
            disabled={disabled || isChanging}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isChanging ? 'Changing...' : 'Change Status'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedStatus('')
              setNotes('')
            }}
            disabled={disabled || isChanging}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
