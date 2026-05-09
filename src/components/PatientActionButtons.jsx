import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import PermissionGate from './common/PermissionGate'

/**
 * PatientActionButtons - Clean icon-based action buttons for patient list
 * Consistent design with OrderActionButtons
 */
export default function PatientActionButtons({
  patient,
  onDelete,
  isProtected,
  compact = false
}) {
  const nav = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  const viewButtonClicked = useRef(false)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleDelete = () => {
    setShowMenu(false)
    onDelete?.(patient)
  }

  // Handle edit action with protection check
  const handleEdit = () => {
    if (isProtected) {
      alert('This patient data is protected for SATUSEHAT testing and cannot be modified.')
      return
    }
    // Use patient.id for navigation, fallback to mrn if id is not available
    nav(`/patients/${patient.id || patient.mrn}`)
  }

  // Handle view action with protection against double clicks
  const handleView = () => {
    // Prevent double navigation
    if (viewButtonClicked.current) return
    viewButtonClicked.current = true
    
    // Reset the flag after a short delay to allow future clicks
    setTimeout(() => {
      viewButtonClicked.current = false
    }, 1000)
    
    nav(`/patients/${patient.id || patient.mrn}`)
  }

  return (
    <div className="flex items-center gap-1" ref={menuRef}>
      {/* Primary Action: View */}
      <button
        onClick={handleView}
        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="View patient details"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </button>

      {/* Secondary Action: Edit */}
      <PermissionGate perm="patient.update">
        <button
          onClick={handleEdit}
          className={`p-1.5 rounded-lg transition-colors ${
            isProtected 
              ? 'text-gray-400 cursor-not-allowed' 
              : 'text-indigo-600 hover:bg-indigo-50'
          }`}
          title={isProtected ? "Protected patient data - editing disabled" : "Edit patient"}
          disabled={isProtected}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </PermissionGate>

      {/* More Actions Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title="More actions"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {showMenu && (
          <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-50 py-1">
            {/* View Medical History */}
            <button
              onClick={() => {
                setShowMenu(false)
                alert('Medical history feature coming soon')
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Medical History</span>
            </button>

            {/* View Orders */}
            <button
              onClick={() => {
                setShowMenu(false)
                nav(`/orders?patient=${patient.mrn}`)
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>View Orders</span>
            </button>

            {/* Create Order */}
            <PermissionGate perm="order.create">
              <button
                onClick={() => {
                  setShowMenu(false)
                  nav(`/orders/new?patient=${patient.mrn}`)
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-3 text-green-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="font-medium">Create Order</span>
              </button>
            </PermissionGate>

            <div className="border-t border-slate-200 my-1"></div>

            {/* Print Patient Card */}
            <button
              onClick={() => {
                setShowMenu(false)
                window.print()
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Print Patient Card</span>
            </button>

            {/* Export Patient Data */}
            <PermissionGate perm="patient.export">
              <button
                onClick={() => {
                  setShowMenu(false)
                  alert('Export feature coming soon')
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export Data</span>
              </button>
            </PermissionGate>

            <div className="border-t border-slate-200 my-1"></div>

            {/* Delete Patient */}
            <PermissionGate perm="patient.delete">
              <button
                onClick={handleDelete}
                disabled={isProtected}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 ${
                  isProtected
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'hover:bg-red-50 text-red-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="font-medium">
                  {isProtected ? 'Protected - Cannot Delete' : 'Delete Patient'}
                </span>
              </button>
            </PermissionGate>
          </div>
        )}
      </div>
    </div>
  )
}