/**
 * ImpersonateDialog Component
 * 
 * Displays a confirmation dialog for impersonating a user.
 * Shows target user details (name, role, email, last login).
 * Includes an optional "Reason" text field for audit purposes.
 * 
 * Requirements: 1.2, 7.1
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, X, User, Mail, Clock, Shield } from 'lucide-react';
import { logger } from '../../utils/logger';

export default function ImpersonateDialog({
  targetUser,
  onConfirm,
  onCancel,
  isLoading = false
}) {
  const [reason, setReason] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate reason field
  const validateReason = (value) => {
    const errors = {};

    // Reason is optional, but if provided, should not exceed 500 characters
    if (value && value.length > 500) {
      errors.reason = 'Reason must not exceed 500 characters';
    }

    // Check for only whitespace
    if (value && value.trim().length === 0) {
      errors.reason = 'Reason cannot be only whitespace';
    }

    return errors;
  };

  // Handle reason change
  const handleReasonChange = (e) => {
    const value = e.target.value;
    setReason(value);

    // Clear errors when user starts typing
    if (validationErrors.reason) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.reason;
        return newErrors;
      });
    }
  };

  // Handle confirm
  const handleConfirm = async () => {
    try {
      // Validate reason
      const errors = validateReason(reason);
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return;
      }

      setIsSubmitting(true);
      logger.info('[ImpersonateDialog] Confirming impersonate:', {
        targetUserId: targetUser?.id,
        reason: reason || 'No reason provided'
      });

      // Call onConfirm with reason
      await onConfirm(reason || 'No reason provided');
    } catch (error) {
      logger.error('[ImpersonateDialog] Error confirming impersonate:', error);
      setValidationErrors({
        submit: error.message || 'Failed to start impersonate session'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    logger.info('[ImpersonateDialog] Cancelling impersonate dialog');
    onCancel();
  };

  // Format last login date
  const formatLastLogin = (date) => {
    if (!date) return 'Never';
    try {
      const d = new Date(date);
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Unknown';
    }
  };

  if (!targetUser) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="impersonate-dialog-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden transform transition-all animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50 flex items-center justify-between">
          <h3
            id="impersonate-dialog-title"
            className="text-lg font-semibold text-gray-900 flex items-center gap-2"
          >
            <AlertTriangle size={20} className="text-amber-600" />
            Confirm Impersonate
          </h3>
          <button
            onClick={handleCancel}
            disabled={isSubmitting || isLoading}
            className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Warning message */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800 leading-relaxed">
              You are about to impersonate <span className="font-semibold">{targetUser.name}</span>.
              <br />
              All actions will be logged for audit purposes.
            </p>
          </div>

          {/* User details */}
          <div className="space-y-3 bg-gray-50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <User size={18} className="text-gray-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-600 uppercase tracking-wide">Name</div>
                <div className="text-sm font-medium text-gray-900 truncate">
                  {targetUser.name}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Shield size={18} className="text-gray-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-600 uppercase tracking-wide">Role</div>
                <div className="text-sm font-medium text-gray-900 capitalize">
                  {targetUser.role || 'N/A'}
                </div>
              </div>
            </div>

            {targetUser.email && (
              <div className="flex items-start gap-3">
                <Mail size={18} className="text-gray-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-600 uppercase tracking-wide">Email</div>
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {targetUser.email}
                  </div>
                </div>
              </div>
            )}

            {targetUser.lastLogin && (
              <div className="flex items-start gap-3">
                <Clock size={18} className="text-gray-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-600 uppercase tracking-wide">Last Login</div>
                  <div className="text-sm font-medium text-gray-900">
                    {formatLastLogin(targetUser.lastLogin)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Reason field */}
          <div>
            <label htmlFor="impersonate-reason" className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Impersonating <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              id="impersonate-reason"
              value={reason}
              onChange={handleReasonChange}
              placeholder="e.g., Testing radiologist features, Troubleshooting user issue..."
              disabled={isSubmitting || isLoading}
              className={`
                w-full px-3 py-2 border rounded-lg text-sm
                placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0
                transition-colors resize-none
                ${validationErrors.reason
                  ? 'border-red-300 focus:ring-red-500 bg-red-50'
                  : 'border-gray-300 focus:ring-amber-500 focus:border-amber-500'
                }
                ${isSubmitting || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              rows="3"
              maxLength="500"
            />
            {validationErrors.reason && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <span className="inline-block">⚠</span>
                {validationErrors.reason}
              </p>
            )}
            <div className="mt-1 text-xs text-gray-500 text-right">
              {reason.length}/500 characters
            </div>
          </div>

          {/* Submit error */}
          {validationErrors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">
                {validationErrors.submit}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            disabled={isSubmitting || isLoading}
            className={`
              px-5 py-2.5 text-sm font-medium text-gray-700 bg-white
              border border-gray-300 rounded-lg
              hover:bg-gray-50 hover:border-gray-400
              focus:outline-none focus:ring-2 focus:ring-gray-200
              transition-all
              ${isSubmitting || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || isLoading}
            className={`
              px-5 py-2.5 text-sm font-medium text-white
              bg-amber-600 rounded-lg
              hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-0
              transition-all shadow-sm
              ${isSubmitting || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isSubmitting || isLoading ? 'Impersonating...' : 'Confirm Impersonate'}
          </button>
        </div>
      </div>

      {/* Inline styles for animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.15s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
