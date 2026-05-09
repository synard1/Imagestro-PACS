/**
 * Order Card Component
 * 
 * Displays order information in a card format with:
 * - Order Number, Patient Name, MRN, Procedure, Referring Doctor, Request Date/Time
 * - ImportStatusBadge component
 * - Checkbox for selection
 * - "Import" quick action button
 * 
 * Requirements: 7.3
 */

import PropTypes from 'prop-types';
import ImportStatusBadge, { getImportStatus, getImportDetails } from './ImportStatusBadge';

// Priority badge colors
const PRIORITY_CONFIG = {
  routine: {
    label: 'Routine',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
  },
  urgent: {
    label: 'Urgent',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
  },
  stat: {
    label: 'STAT',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
  },
};

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
const formatDate = (dateString) => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
};

/**
 * Format time for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted time string
 */
const formatTime = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

/**
 * OrderCard Component
 * 
 * @param {Object} props - Component props
 * @param {Object} props.order - Order data object
 * @param {boolean} props.selected - Whether the order is selected
 * @param {Function} props.onSelect - Callback when selection changes
 * @param {Function} props.onImport - Callback when import button is clicked
 * @param {boolean} props.importing - Whether import is in progress
 * @param {boolean} props.disabled - Whether the card is disabled
 * @param {string} props.viewMode - View mode: 'card' or 'table'
 */
export default function OrderCard({
  order,
  selected = false,
  onSelect = () => {},
  onImport = () => {},
  importing = false,
  disabled = false,
  viewMode = 'card',
}) {
  if (!order) return null;

  const importStatus = getImportStatus(order);
  const importDetails = getImportDetails(order);
  const isImported = importStatus === 'imported';
  const priorityConfig = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.routine;

  // Table row view
  if (viewMode === 'table') {
    return (
      <tr className={`
        border-b border-gray-200 hover:bg-gray-50 transition
        ${selected ? 'bg-blue-50' : ''}
        ${disabled ? 'opacity-50' : ''}
      `}>
        {/* Checkbox */}
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(order.id, e.target.checked)}
            disabled={disabled || isImported}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
        </td>

        {/* Order Number */}
        <td className="px-4 py-3">
          <div className="font-medium text-gray-900">{order.order_number}</div>
          <div className="text-xs text-gray-500">{order.visit_number}</div>
        </td>

        {/* Patient */}
        <td className="px-4 py-3">
          <div className="font-medium text-gray-900">{order.patient_name}</div>
          <div className="text-xs text-gray-500">MRN: {order.patient_mrn}</div>
        </td>

        {/* Procedure */}
        <td className="px-4 py-3">
          <div className="text-gray-900">{order.procedure_name}</div>
          <div className="text-xs text-gray-500">{order.procedure_code}</div>
        </td>

        {/* Referring Doctor */}
        <td className="px-4 py-3">
          <div className="text-gray-700 text-sm">{order.doctor_name || order.referring_doctor_name || '-'}</div>
        </td>

        {/* Request Date/Time */}
        <td className="px-4 py-3">
          <div className="text-gray-900">{formatDate(order.order_date || order.request_date)}</div>
          <div className="text-xs text-gray-500">{order.order_time || formatTime(order.request_date)}</div>
        </td>

        {/* Priority */}
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${priorityConfig.bgColor} ${priorityConfig.textColor}`}>
            {priorityConfig.label}
          </span>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <ImportStatusBadge
            status={importStatus}
            importDetails={importDetails}
            size="sm"
          />
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          {!isImported && (
            <button
              onClick={() => onImport(order.id)}
              disabled={disabled || importing}
              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              {importing ? (
                <>
                  <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                  Importing...
                </>
              ) : (
                'Import'
              )}
            </button>
          )}
        </td>
      </tr>
    );
  }

  // Card view (default)
  return (
    <div className={`
      bg-white rounded-lg border shadow-sm p-4 transition
      ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}
      ${disabled ? 'opacity-50' : 'hover:shadow-md'}
    `}>
      {/* Header with checkbox and status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(order.id, e.target.checked)}
            disabled={disabled || isImported}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 h-5 w-5"
          />
          <div>
            <div className="font-semibold text-gray-900">{order.order_number}</div>
            <div className="text-xs text-gray-500">{order.visit_number}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${priorityConfig.bgColor} ${priorityConfig.textColor}`}>
            {priorityConfig.label}
          </span>
          <ImportStatusBadge
            status={importStatus}
            importDetails={importDetails}
            size="sm"
          />
        </div>
      </div>

      {/* Patient Info */}
      <div className="mb-3 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="font-medium text-gray-900">{order.patient_name}</span>
        </div>
        <div className="text-sm text-gray-600 ml-6">
          MRN: {order.patient_mrn}
          {order.patient_sex && ` • ${order.patient_sex === 'M' ? 'Male' : 'Female'}`}
          {order.patient_dob && ` • DOB: ${formatDate(order.patient_dob)}`}
        </div>
      </div>

      {/* Procedure Info */}
      <div className="mb-3">
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="font-medium text-gray-900">{order.procedure_name}</span>
          <span className="text-gray-500">({order.procedure_code})</span>
        </div>
      </div>

      {/* Referring Doctor */}
      {(order.doctor_name || order.referring_doctor_name) && (
        <div className="mb-3">
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-gray-700">{order.doctor_name || order.referring_doctor_name}</span>
          </div>
        </div>
      )}

      {/* Clinical Indication */}
      {order.clinical_indication && (
        <div className="mb-3 text-sm text-gray-600 italic">
          "{order.clinical_indication}"
        </div>
      )}

      {/* Footer with date and action */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="text-sm text-gray-500">
          <span className="font-medium">Request:</span> {formatDate(order.order_date || order.request_date)} {order.order_time || formatTime(order.request_date)}
        </div>
        {!isImported && (
          <button
            onClick={() => onImport(order.id)}
            disabled={disabled || importing}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {importing ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                Importing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

OrderCard.propTypes = {
  order: PropTypes.shape({
    id: PropTypes.string.isRequired,
    order_number: PropTypes.string.isRequired,
    visit_number: PropTypes.string,
    patient_mrn: PropTypes.string.isRequired,
    patient_name: PropTypes.string.isRequired,
    patient_dob: PropTypes.string,
    patient_sex: PropTypes.string,
    procedure_code: PropTypes.string.isRequired,
    procedure_name: PropTypes.string.isRequired,
    referring_doctor_code: PropTypes.string,
    referring_doctor_name: PropTypes.string,
    doctor_name: PropTypes.string,
    clinical_indication: PropTypes.string,
    priority: PropTypes.oneOf(['routine', 'urgent', 'stat']),
    request_date: PropTypes.string,
    order_date: PropTypes.string,
    order_time: PropTypes.string,
    scheduled_date: PropTypes.string,
    is_imported: PropTypes.bool,
    imported_at: PropTypes.string,
    worklist_item_id: PropTypes.string,
  }).isRequired,
  selected: PropTypes.bool,
  onSelect: PropTypes.func,
  onImport: PropTypes.func,
  importing: PropTypes.bool,
  disabled: PropTypes.bool,
  viewMode: PropTypes.oneOf(['card', 'table']),
};

OrderCard.defaultProps = {
  selected: false,
  onSelect: () => {},
  onImport: () => {},
  importing: false,
  disabled: false,
  viewMode: 'card',
};
