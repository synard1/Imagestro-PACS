import { useState, useMemo } from 'react';
import {
  CalendarIcon,
  CheckCircleIcon,
  PlayIcon,
  XMarkIcon,
  ClockIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline';
import {
  updateOrderStatus,
  getAvailableTransitions,
  ORDER_STATUS,
  getStatusBadge
} from '../../services/worklistService';
import { notify } from '../../services/notifications';
import { useAuth } from '../../hooks/useAuth';
import { can, getCurrentUser } from '../../services/rbac';
import ManualStatusModal from './ManualStatusModal';

/**
 * Worklist Actions Component
 * Provides action buttons based on current order status
 */
export default function WorklistActions({
  order,
  onStatusChange,
  onReschedule,
  onCancel,
  compact = false
}) {
  const [loading, setLoading] = useState(false);
  const [showManualStatusModal, setShowManualStatusModal] = useState(false);

  // Get current user for permission checking
  const { currentUser } = useAuth() || {};

  // Permission checks - reactive to currentUser changes
  const permissions = useMemo(() => {
    const user = currentUser;
    const canChangeStatus = can('order:status', user) || can('order:update', user) || can('order:*', user) || can('worklist:update', user);
    const canReschedule = can('order:update', user) || can('order:*', user) || can('worklist:update', user);
    const canCancel = can('order:update', user) || can('order:*', user) || can('worklist:update', user);



    return { canChangeStatus, canReschedule, canCancel };
  }, [currentUser]);

  const availableTransitions = getAvailableTransitions(order.status);

  const handleStatusChange = async (newStatus) => {
    if (loading) return;

    try {
      setLoading(true);

      // Get status label for notification
      const statusConfig = getStatusBadge(newStatus);
      const statusLabel = statusConfig.label;

      // Use worklist_id (preferred) or fallback to order_id/id
      const idToUpdate = order.worklist_id || order.order_id || order.id;



      await updateOrderStatus(idToUpdate, newStatus);

      // Show success notification
      notify({
        type: 'success',
        message: `Order status updated to ${statusLabel}`,
        detail: `Order ${order.order_number || order.accession_no} has been updated successfully.`
      });

      if (onStatusChange) {
        await onStatusChange(newStatus);
      }
    } catch (error) {
      console.error('Failed to update status:', error);

      // Show error notification
      notify({
        type: 'error',
        message: 'Failed to update order status',
        detail: error.message || 'An error occurred while updating the order status. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionButton = (transition) => {
    const iconMap = {
      [ORDER_STATUS.ARRIVED]: CheckCircleIcon,
      [ORDER_STATUS.IN_PROGRESS]: PlayIcon,
      [ORDER_STATUS.COMPLETED]: CheckCircleIcon,
      [ORDER_STATUS.SCHEDULED]: CalendarIcon,
      [ORDER_STATUS.RESCHEDULED]: ClockIcon
    };

    const Icon = iconMap[transition.status] || CheckCircleIcon;

    // Enhanced tooltip messages
    const tooltipMap = {
      [ORDER_STATUS.ARRIVED]: 'Mark patient as arrived and checked in',
      [ORDER_STATUS.IN_PROGRESS]: 'Start the examination procedure',
      [ORDER_STATUS.COMPLETED]: 'Complete the examination',
      [ORDER_STATUS.SCHEDULED]: 'Schedule this order',
      [ORDER_STATUS.RESCHEDULED]: 'Reschedule to a different time',
      [ORDER_STATUS.CREATED]: 'Complete order creation',
      [ORDER_STATUS.REPORTED]: 'Mark report as created',
      [ORDER_STATUS.FINALIZED]: 'Sign and finalize the report',
      [ORDER_STATUS.DELIVERED]: 'Mark result as delivered',
      [ORDER_STATUS.NO_SHOW]: 'Mark patient as no-show'
    };

    const tooltip = tooltipMap[transition.status] || transition.label;

    return (
      <button
        key={transition.status}
        onClick={() => handleStatusChange(transition.status)}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${compact ? 'px-2 py-1 text-xs' : ''
          } ${loading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          }`}
        title={tooltip}
      >
        <Icon className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        {!compact && <span>{transition.label}</span>}
      </button>
    );
  };

  const handleManualStatusComplete = async () => {
    if (onStatusChange) {
      await onStatusChange();
    }
    setShowManualStatusModal(false);
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status transition buttons */}
        {availableTransitions.map(transition => getActionButton(transition))}

        {/* Manual Status Update button - show only for non-terminal statuses */}
        {![ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED, ORDER_STATUS.DISCONTINUED, ORDER_STATUS.DELIVERED].includes(order.status) && (
          <button
            onClick={() => setShowManualStatusModal(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${compact ? 'px-2 py-1 text-xs' : ''
              } bg-purple-600 text-white hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2`}
            title="Manually update order status (for when modality is not connected)"
          >
            <PencilSquareIcon className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            {!compact && <span>Manual</span>}
          </button>
        )}

        {/* Reschedule button - show for scheduled */}
        {order.status === ORDER_STATUS.SCHEDULED && onReschedule && (
          <button
            onClick={() => onReschedule(order)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${compact ? 'px-2 py-1 text-xs' : ''
              } bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2`}
            title="Reschedule order to a different date and time"
          >
            <ClockIcon className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            {!compact && <span>Reschedule</span>}
          </button>
        )}

        {/* Cancel button - show for non-terminal statuses */}
        {![ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED, ORDER_STATUS.DISCONTINUED, ORDER_STATUS.DELIVERED].includes(order.status) && onCancel && (
          <button
            onClick={() => onCancel(order)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${compact ? 'px-2 py-1 text-xs' : ''
              } bg-red-600 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2`}
            title="Cancel this order (requires reason)"
          >
            <XMarkIcon className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            {!compact && <span>Cancel</span>}
          </button>
        )}
      </div>

      {/* Manual Status Modal */}
      {showManualStatusModal && (
        <ManualStatusModal
          order={order}
          onClose={() => setShowManualStatusModal(false)}
          onComplete={handleManualStatusComplete}
        />
      )}
    </>
  );
}
