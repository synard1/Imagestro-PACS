import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ORDER_STATUS, STATUS_CONFIG, updateOrderStatus } from '../../services/worklistService';
import { notify } from '../../services/notifications';

/**
 * Manual Status Update Modal
 * Allows manual status changes for worklist items
 */
export default function ManualStatusModal({ order, onClose, onComplete }) {
  const [selectedStatus, setSelectedStatus] = useState(order.status);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Get all available statuses (exclude draft as it's not relevant for worklist)
  const allStatuses = Object.values(ORDER_STATUS).filter(
    status => status !== ORDER_STATUS.DRAFT && status !== ORDER_STATUS.CREATED
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedStatus === order.status) {
      notify({
        type: 'warning',
        message: 'No change',
        detail: 'Please select a different status'
      });
      return;
    }

    try {
      setLoading(true);

      const orderId = order.order_id || order.id;
      await updateOrderStatus(orderId, selectedStatus, notes);

      const statusConfig = STATUS_CONFIG[selectedStatus];
      notify({
        type: 'success',
        message: 'Status updated successfully',
        detail: `Order status changed to ${statusConfig?.label || selectedStatus}`
      });

      if (onComplete) {
        await onComplete();
      }
      
      onClose();
    } catch (error) {
      console.error('Failed to update status:', error);
      notify({
        type: 'error',
        message: 'Failed to update status',
        detail: error.message || 'An error occurred while updating the status'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Manual Status Update
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Order Info */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="text-sm">
              <span className="text-gray-600">Order:</span>
              <span className="ml-2 font-medium text-gray-900">
                {order.order_number || order.accession_no}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-gray-600">Patient:</span>
              <span className="ml-2 font-medium text-gray-900">
                {order.patient_name}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-gray-600">Current Status:</span>
              <span className="ml-2 font-medium text-gray-900">
                {STATUS_CONFIG[order.status]?.label || order.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Status <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              {allStatuses.map((status) => {
                const config = STATUS_CONFIG[status];
                return (
                  <option key={status} value={status}>
                    {config?.icon} {config?.label || status}
                  </option>
                );
              })}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Select the new status for this order
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add any notes about this status change..."
            />
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex gap-2">
              <span className="text-amber-600 text-lg">⚠️</span>
              <div className="text-xs text-amber-800">
                <p className="font-medium mb-1">Manual Status Update</p>
                <p>
                  This will manually update the order status. Use this when the worklist
                  is not automatically connected to the modality.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || selectedStatus === order.status}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Updating...' : 'Update Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
