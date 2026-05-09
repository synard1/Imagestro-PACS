/**
 * Patient Diff Dialog Component
 * 
 * Displays side-by-side comparison of patient data between PACS and SIMRS:
 * - Highlights differing fields
 * - "Update PACS Data" button - updates PACS with SIMRS data
 * - "Keep PACS Data" button - keeps existing PACS data
 * - "Cancel Import" button - cancels the import operation
 * 
 * Requirements: 9.2, 9.3, 9.4
 */

import { useState } from 'react';
import PropTypes from 'prop-types';

// Field labels for display
const FIELD_LABELS = {
  name: 'Patient Name',
  patient_name: 'Patient Name',
  dob: 'Date of Birth',
  patient_dob: 'Date of Birth',
  sex: 'Sex',
  patient_sex: 'Sex',
  address: 'Address',
  patient_address: 'Address',
  phone: 'Phone',
  patient_phone: 'Phone',
  email: 'Email',
  patient_email: 'Email',
  mrn: 'MRN',
  patient_mrn: 'MRN',
};

/**
 * Format date for display
 * @param {string} dateString - Date string
 * @returns {string} Formatted date
 */
const formatDate = (dateString) => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
};

/**
 * Format sex value for display
 * @param {string} sex - Sex value (M/F/L/P)
 * @returns {string} Formatted sex
 */
const formatSex = (sex) => {
  if (!sex) return '-';
  const sexMap = {
    M: 'Male',
    F: 'Female',
    L: 'Male (Laki-laki)',
    P: 'Female (Perempuan)',
  };
  return sexMap[sex.toUpperCase()] || sex;
};

/**
 * Format field value for display
 * @param {string} field - Field name
 * @param {any} value - Field value
 * @returns {string} Formatted value
 */
const formatValue = (field, value) => {
  if (value === null || value === undefined || value === '') return '-';
  
  if (field.includes('dob') || field.includes('date')) {
    return formatDate(value);
  }
  
  if (field.includes('sex')) {
    return formatSex(value);
  }
  
  return String(value);
};

/**
 * Get field label
 * @param {string} field - Field name
 * @returns {string} Field label
 */
const getFieldLabel = (field) => {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * PatientDiffDialog Component
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the dialog is open
 * @param {Function} props.onClose - Callback when dialog is closed
 * @param {Object} props.pacsData - Patient data from PACS
 * @param {Object} props.simrsData - Patient data from SIMRS
 * @param {Array} props.diffs - Array of diff objects with field, pacsValue, simrsValue
 * @param {Function} props.onUpdatePacs - Callback when "Update PACS Data" is clicked
 * @param {Function} props.onKeepPacs - Callback when "Keep PACS Data" is clicked
 * @param {Function} props.onCancel - Callback when "Cancel Import" is clicked
 * @param {boolean} props.loading - Whether an action is in progress
 * @param {string} props.orderNumber - Order number for display
 */
export default function PatientDiffDialog({
  isOpen = false,
  onClose = () => {},
  pacsData = {},
  simrsData = {},
  diffs = [],
  onUpdatePacs = () => {},
  onKeepPacs = () => {},
  onCancel = () => {},
  loading = false,
  orderNumber = '',
}) {
  const [selectedAction, setSelectedAction] = useState(null);

  if (!isOpen) return null;

  // Get all fields to display (both from diffs and common fields)
  const allFields = new Set([
    ...diffs.map(d => d.field),
    'name', 'patient_name',
    'dob', 'patient_dob',
    'sex', 'patient_sex',
    'mrn', 'patient_mrn',
  ]);

  // Normalize field names for comparison
  const normalizeField = (field) => {
    const mapping = {
      patient_name: 'name',
      patient_dob: 'dob',
      patient_sex: 'sex',
      patient_mrn: 'mrn',
    };
    return mapping[field] || field;
  };

  // Check if a field has differences
  const hasDiff = (field) => {
    const normalizedField = normalizeField(field);
    return diffs.some(d => normalizeField(d.field) === normalizedField);
  };

  // Get value from data object
  const getValue = (data, field) => {
    // Try direct field
    if (data[field] !== undefined) return data[field];
    
    // Try with patient_ prefix
    if (data[`patient_${field}`] !== undefined) return data[`patient_${field}`];
    
    // Try without patient_ prefix
    const withoutPrefix = field.replace('patient_', '');
    if (data[withoutPrefix] !== undefined) return data[withoutPrefix];
    
    return null;
  };

  // Fields to display in order
  const displayFields = ['name', 'mrn', 'dob', 'sex', 'address', 'phone'];

  const handleAction = async (action) => {
    setSelectedAction(action);
    try {
      if (action === 'update') {
        await onUpdatePacs();
      } else if (action === 'keep') {
        await onKeepPacs();
      } else if (action === 'cancel') {
        await onCancel();
      }
    } finally {
      setSelectedAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={!loading ? onClose : undefined}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-yellow-50">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Patient Data Mismatch
                </h3>
                <p className="text-sm text-gray-600">
                  {orderNumber && `Order: ${orderNumber} • `}
                  Patient data differs between PACS and SIMRS
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
            <p className="text-sm text-gray-600 mb-4">
              The patient information in SIMRS differs from the existing PACS record. 
              Please choose how to proceed:
            </p>

            {/* Comparison Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-1/4">
                      Field
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[37.5%]">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                        PACS (Current)
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[37.5%]">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                        SIMRS (New)
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {displayFields.map((field) => {
                    const pacsValue = getValue(pacsData, field);
                    const simrsValue = getValue(simrsData, field);
                    const isDifferent = hasDiff(field);
                    
                    // Skip if both values are empty
                    if (!pacsValue && !simrsValue) return null;

                    return (
                      <tr 
                        key={field}
                        className={isDifferent ? 'bg-yellow-50' : ''}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-700">
                          {getFieldLabel(field)}
                          {isDifferent && (
                            <span className="ml-2 text-yellow-600">⚠</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-sm ${isDifferent ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>
                          {formatValue(field, pacsValue)}
                        </td>
                        <td className={`px-4 py-3 text-sm ${isDifferent ? 'text-green-700 font-medium' : 'text-gray-600'}`}>
                          {formatValue(field, simrsValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded"></span>
                <span>Different values</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-yellow-600">⚠</span>
                <span>Field has mismatch</span>
              </div>
            </div>
          </div>

          {/* Footer with actions */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              {/* Cancel Import */}
              <button
                onClick={() => handleAction('cancel')}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {loading && selectedAction === 'cancel' ? (
                  <>
                    <span className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full"></span>
                    Cancelling...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel Import
                  </>
                )}
              </button>

              {/* Keep PACS Data */}
              <button
                onClick={() => handleAction('keep')}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {loading && selectedAction === 'keep' ? (
                  <>
                    <span className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full"></span>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Keep PACS Data
                  </>
                )}
              </button>

              {/* Update PACS Data */}
              <button
                onClick={() => handleAction('update')}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {loading && selectedAction === 'update' ? (
                  <>
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                    Updating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Update PACS Data
                  </>
                )}
              </button>
            </div>

            <p className="mt-3 text-xs text-gray-500 text-center sm:text-right">
              <strong>Update PACS Data:</strong> Replace PACS patient info with SIMRS data<br />
              <strong>Keep PACS Data:</strong> Import order using existing PACS patient info
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

PatientDiffDialog.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  pacsData: PropTypes.object,
  simrsData: PropTypes.object,
  diffs: PropTypes.arrayOf(PropTypes.shape({
    field: PropTypes.string.isRequired,
    pacsValue: PropTypes.any,
    simrsValue: PropTypes.any,
  })),
  onUpdatePacs: PropTypes.func,
  onKeepPacs: PropTypes.func,
  onCancel: PropTypes.func,
  loading: PropTypes.bool,
  orderNumber: PropTypes.string,
};

PatientDiffDialog.defaultProps = {
  isOpen: false,
  onClose: () => {},
  pacsData: {},
  simrsData: {},
  diffs: [],
  onUpdatePacs: () => {},
  onKeepPacs: () => {},
  onCancel: () => {},
  loading: false,
  orderNumber: '',
};
