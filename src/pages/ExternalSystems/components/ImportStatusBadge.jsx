/**
 * Import Status Badge Component
 * 
 * Displays the import status of an order with visual indicators:
 * - "Not Imported" (gray) - Order has not been imported yet
 * - "Already Imported" (green) - Order has been successfully imported
 * - "Failed" (red) - Import attempt failed
 * 
 * Shows tooltip with import details on hover.
 * 
 * Requirements: 7.4
 */

import { useState } from 'react';
import PropTypes from 'prop-types';

// Status configurations
const STATUS_CONFIG = {
  not_imported: {
    label: 'Not Imported',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-300',
    icon: null,
  },
  imported: {
    label: 'Already Imported',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    borderColor: 'border-green-300',
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    ),
  },
  failed: {
    label: 'Failed',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    borderColor: 'border-red-300',
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    ),
  },
};

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

/**
 * ImportStatusBadge Component
 * 
 * @param {Object} props - Component props
 * @param {string} props.status - Import status: 'not_imported', 'imported', 'failed'
 * @param {Object} props.importDetails - Optional import details for tooltip
 * @param {string} props.importDetails.importedAt - Import timestamp
 * @param {string} props.importDetails.importedBy - User who imported
 * @param {string} props.importDetails.worklistItemId - Worklist item ID
 * @param {string} props.importDetails.errorMessage - Error message for failed imports
 * @param {string} props.size - Badge size: 'sm', 'md', 'lg'
 * @param {boolean} props.showTooltip - Whether to show tooltip on hover
 */
export default function ImportStatusBadge({
  status = 'not_imported',
  importDetails = null,
  size = 'md',
  showTooltip = true,
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  // Get status configuration
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_imported;

  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  // Determine if tooltip should be shown
  const hasTooltipContent = showTooltip && (
    (status === 'imported' && importDetails) ||
    (status === 'failed' && importDetails?.errorMessage)
  );

  return (
    <div className="relative inline-block">
      <span
        className={`
          inline-flex items-center gap-1 font-medium rounded-full border
          ${config.bgColor} ${config.textColor} ${config.borderColor}
          ${sizeClasses[size]}
          ${hasTooltipContent ? 'cursor-help' : ''}
        `}
        onMouseEnter={() => hasTooltipContent && setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
      >
        {config.icon}
        {config.label}
      </span>

      {/* Tooltip */}
      {tooltipVisible && hasTooltipContent && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64">
          <div className="bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg">
            {status === 'imported' && importDetails && (
              <div className="space-y-1">
                <p className="font-medium text-green-400">Import Details</p>
                {importDetails.importedAt && (
                  <p>
                    <span className="text-gray-400">Imported:</span>{' '}
                    {formatDate(importDetails.importedAt)}
                  </p>
                )}
                {importDetails.importedBy && (
                  <p>
                    <span className="text-gray-400">By:</span>{' '}
                    {importDetails.importedBy}
                  </p>
                )}
                {importDetails.worklistItemId && (
                  <p>
                    <span className="text-gray-400">Worklist ID:</span>{' '}
                    <span className="font-mono text-xs">{importDetails.worklistItemId}</span>
                  </p>
                )}
              </div>
            )}
            {status === 'failed' && importDetails?.errorMessage && (
              <div className="space-y-1">
                <p className="font-medium text-red-400">Import Failed</p>
                <p className="text-gray-300">{importDetails.errorMessage}</p>
                {importDetails.importedAt && (
                  <p className="text-gray-400 text-xs mt-2">
                    Attempted: {formatDate(importDetails.importedAt)}
                  </p>
                )}
              </div>
            )}
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ImportStatusBadge.propTypes = {
  status: PropTypes.oneOf(['not_imported', 'imported', 'failed']),
  importDetails: PropTypes.shape({
    importedAt: PropTypes.string,
    importedBy: PropTypes.string,
    worklistItemId: PropTypes.string,
    errorMessage: PropTypes.string,
  }),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  showTooltip: PropTypes.bool,
};

ImportStatusBadge.defaultProps = {
  status: 'not_imported',
  importDetails: null,
  size: 'md',
  showTooltip: true,
};

/**
 * Helper function to determine import status from order data
 * @param {Object} order - Order object
 * @returns {string} Status string
 */
export function getImportStatus(order) {
  if (!order) return 'not_imported';
  
  if (order.is_imported === true) {
    return 'imported';
  }
  
  // Check if there's a failed import in history
  if (order.import_failed === true || order.import_status === 'failed') {
    return 'failed';
  }
  
  return 'not_imported';
}

/**
 * Helper function to extract import details from order data
 * @param {Object} order - Order object
 * @returns {Object|null} Import details object
 */
export function getImportDetails(order) {
  if (!order) return null;
  
  if (order.is_imported) {
    return {
      importedAt: order.imported_at,
      importedBy: order.imported_by || order.operator_name,
      worklistItemId: order.worklist_item_id,
    };
  }
  
  if (order.import_failed || order.import_status === 'failed') {
    return {
      importedAt: order.import_attempted_at || order.imported_at,
      errorMessage: order.error_message || order.import_error,
    };
  }
  
  return null;
}
