import { useState } from 'react';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { cancelOrder } from '../../services/worklistService';
import { notify } from '../../services/notifications';

export default function CancelOrderModal({ order, onClose, onComplete }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!reason.trim()) {
      notify({
        type: 'warning',
        message: 'Reason required',
        detail: 'Please provide a reason for cancelling this order.'
      });
      return;
    }

    try {
      setLoading(true);
      // Prioritize worklist_id for cancellations
      const idToCancel = order.worklist_id || order.id || order.order_id;
      await cancelOrder(idToCancel, reason);

      // Show success notification
      notify({
        type: 'success',
        message: 'Order cancelled successfully',
        detail: `Order ${order.order_number || order.accession_no} has been cancelled.`
      });

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Failed to cancel order:', error);

      // Show error notification
      notify({
        type: 'error',
        message: 'Failed to cancel order',
        detail: error.message || 'An error occurred while cancelling the order. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
            <h2 className="text-2xl font-bold text-gray-900">
              Cancel Order
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Warning */}
        <div className="p-6 bg-red-50 border-b border-red-200">
          <div className="flex gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-semibold mb-1">Warning: This action cannot be undone</p>
              <p>Cancelling this order will remove it from the active worklist and notify relevant staff.</p>
            </div>
          </div>
        </div>

        {/* Order Info */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Order Details
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Order Number:</span>
              <span className="font-medium text-gray-900">{order.order_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Patient:</span>
              <span className="font-medium text-gray-900">{order.patient_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Procedure:</span>
              <span className="font-medium text-gray-900">{order.requested_procedure || order.procedure_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Scheduled:</span>
              <span className="font-medium text-gray-900">
                {order.scheduled_date} {order.scheduled_time}
              </span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Cancellation *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              required
              placeholder="Please provide a detailed reason for cancelling this order..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              This reason will be recorded in the order history and audit log.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Keep Order
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className={`px-6 py-2 rounded-lg font-medium ${loading || !reason.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-red-600 text-white hover:bg-red-700'
                }`}
            >
              {loading ? 'Cancelling...' : 'Cancel Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
