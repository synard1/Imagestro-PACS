import { useState, useEffect } from 'react';
import { XMarkIcon, CalendarIcon, ClockIcon } from '@heroicons/react/24/outline';
import { rescheduleOrder, getAvailableSlots } from '../../services/worklistService';
import { notify } from '../../services/notifications';
import { sanitizeInput, secureLog } from '../../utils/security';
import { withTimeout, TIMEOUT_PRESETS } from '../../utils/timeout';
import DOMPurify from 'dompurify';

export default function RescheduleModal({ order, onClose, onComplete }) {
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [reason, setReason] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Reset form when modal closes (cleanup)
  useEffect(() => {
    return () => {
      // Clear form data on unmount for privacy
      setNewDate('');
      setNewTime('');
      setReason('');
      setAvailableSlots([]);
    };
  }, []);

  // Load available slots when date changes (with race condition prevention)
  useEffect(() => {
    let cancelled = false;

    const loadSlots = async () => {
      if (!newDate || cancelled) return;

      try {
        setLoadingSlots(true);
        const result = await withTimeout(
          getAvailableSlots(null, newDate),
          TIMEOUT_PRESETS.NORMAL,
          'Load available slots'
        );

        if (!cancelled) {
          setAvailableSlots(result.slots || []);
        }
      } catch (error) {
        if (!cancelled) {
          secureLog('Failed to load slots:', error, 'error');

          const isTimeout = error.message && error.message.includes('timed out');

          notify({
            type: 'error',
            message: isTimeout ? 'Request timeout' : 'Failed to load available slots',
            detail: isTimeout
              ? 'The request took too long. Please check your connection and try again.'
              : 'Could not retrieve available time slots. Please try again.'
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      }
    };

    if (newDate) {
      loadSlots();
    }

    return () => {
      cancelled = true;
    };
  }, [newDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!newDate || !newTime) {
      notify({
        type: 'warning',
        message: 'Missing required fields',
        detail: 'Please select both date and time for rescheduling.'
      });
      return;
    }

    try {
      setLoading(true);
      const newScheduledAt = `${newDate} ${newTime}`;
      // Prioritize worklist_id for rescheduling
      const idToReschedule = order.worklist_id || order.id || order.order_id;

      // Add timeout to prevent hanging requests
      await withTimeout(
        rescheduleOrder(idToReschedule, newScheduledAt, reason),
        TIMEOUT_PRESETS.LONG,
        'Reschedule order'
      );

      // Show success notification
      notify({
        type: 'success',
        message: 'Order rescheduled successfully',
        detail: `Order ${order.order_number || order.accession_no} has been rescheduled to ${newDate} at ${newTime}.`
      });

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      secureLog('Failed to reschedule:', error, 'error');

      const isTimeout = error.message && error.message.includes('timed out');

      // Show error notification
      notify({
        type: 'error',
        message: isTimeout ? 'Request timeout' : 'Failed to reschedule order',
        detail: isTimeout
          ? 'The request took too long. Please check your connection and try again.'
          : error.message || 'An error occurred while rescheduling the order. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  // Date validation
  const today = new Date();
  const minDate = today.toISOString().split('T')[0];

  // Max date: 3 months from today
  const maxDate = new Date(today);
  maxDate.setMonth(maxDate.getMonth() + 3);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  // Validate date selection
  const handleDateChange = (selectedDate) => {
    const selected = new Date(selectedDate);
    const max = new Date(maxDateStr);

    if (selected > max) {
      notify({
        type: 'warning',
        message: 'Invalid date',
        detail: 'Cannot schedule more than 3 months ahead. Please select an earlier date.'
      });
      return;
    }

    setNewDate(selectedDate);
  };

  // Handle reason input with validation
  const handleReasonChange = (value) => {
    const maxLength = 500;
    if (value.length <= maxLength) {
      setReason(sanitizeInput(value, 'reason'));
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-modal-title"
      aria-describedby="reschedule-modal-description"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-6 w-6 text-blue-600" aria-hidden="true" />
            <h2
              id="reschedule-modal-title"
              className="text-2xl font-bold text-gray-900"
            >
              Reschedule Order
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close reschedule modal"
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {/* Order Info */}
        <div
          id="reschedule-modal-description"
          className="p-6 bg-blue-50 border-b border-blue-200"
        >
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            Current Schedule
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-blue-700 font-medium">Patient:</span>{' '}
              <span
                className="text-blue-900"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(order.patient_name || '') }}
              />
            </div>
            <div>
              <span className="text-blue-700 font-medium">Order:</span>{' '}
              <span
                className="text-blue-900"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(order.order_number || '') }}
              />
            </div>
            <div>
              <span className="text-blue-700 font-medium">Procedure:</span>{' '}
              <span
                className="text-blue-900"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(order.requested_procedure || order.procedure_name || '') }}
              />
            </div>
            <div>
              <span className="text-blue-700 font-medium">Current Schedule:</span>{' '}
              <span className="text-blue-900">
                <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(order.scheduled_date || '') }} />
                {' '}
                <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(order.scheduled_time || '') }} />
              </span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* New Date */}
          <div>
            <label
              htmlFor="reschedule-date"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              New Date *
            </label>
            <input
              id="reschedule-date"
              type="date"
              value={newDate}
              onChange={(e) => handleDateChange(e.target.value)}
              min={minDate}
              max={maxDateStr}
              required
              aria-required="true"
              aria-describedby="reschedule-date-help"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p
              id="reschedule-date-help"
              className="text-xs text-gray-500 mt-1"
            >
              Maximum 3 months from today
            </p>
          </div>

          {/* Available Slots */}
          {newDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available Time Slots *
              </label>
              {loadingSlots ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Loading available slots...
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="text-sm text-gray-500 py-4">No available slots for this date</div>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setNewTime(slot.slot_start_time)}
                      disabled={!slot.is_available}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors ${newTime === slot.slot_start_time
                        ? 'bg-blue-600 text-white border-blue-600'
                        : slot.is_available
                          ? 'bg-white text-gray-700 border-gray-300 hover:border-blue-500'
                          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        }`}
                    >
                      <ClockIcon className="h-4 w-4 inline mr-1" />
                      {slot.slot_start_time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Manual Time Input (fallback) */}
          <div>
            <label
              htmlFor="reschedule-time"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Or Enter Time Manually *
            </label>
            <input
              id="reschedule-time"
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              required
              aria-required="true"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Reason */}
          <div>
            <label
              htmlFor="reschedule-reason"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Reason for Rescheduling
            </label>
            <textarea
              id="reschedule-reason"
              value={reason}
              onChange={(e) => handleReasonChange(e.target.value)}
              rows={3}
              maxLength={500}
              aria-describedby="reschedule-reason-help"
              placeholder="e.g., Patient request, equipment maintenance, emergency case. Only alphanumeric and basic punctuation allowed."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div
              id="reschedule-reason-help"
              className="text-xs text-gray-500 mt-1"
            >
              {reason.length}/500 characters • Allowed: letters, numbers, and punctuation (.,:-;!?()'")
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !newDate || !newTime}
              className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 ${loading || !newDate || !newTime
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
            >
              {loading && (
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {loading ? 'Rescheduling...' : 'Reschedule Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
