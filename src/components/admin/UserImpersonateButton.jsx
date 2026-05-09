/**
 * UserImpersonateButton Component
 * 
 * Button component for impersonating a user from user list or user detail page.
 * Displays an "Impersonate" button with disabled state when nested impersonate is active.
 * Includes tooltip explaining the feature.
 * Opens ImpersonateDialog when clicked.
 * 
 * Requirements: 1.1, 9.1, 9.2, 10.1, 10.2, 10.5
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import ImpersonateDialog from './ImpersonateDialog';
import { startImpersonate, isCurrentlyImpersonating } from '../../services/impersonateService';
import { useToast } from '../ToastProvider';
import { logger } from '../../utils/logger';

export default function UserImpersonateButton({
  user,
  onImpersonateStart = null,
  className = ''
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const toast = useToast();

  // Check if nested impersonate is active
  const isNestedImpersonateActive = isCurrentlyImpersonating();

  // Validate user object
  if (!user || !user.id) {
    logger.warn('[UserImpersonateButton] Invalid user object provided');
    return null;
  }

  // Don't show button for superadmin users
  if (user.role === 'superadmin' || user.role === 'admin') {
    return null;
  }

  // Handle impersonate confirmation
  const handleConfirmImpersonate = async (reason) => {
    try {
      setIsLoading(true);
      logger.info('[UserImpersonateButton] Starting impersonate:', {
        targetUserId: user.id,
        targetUserName: user.name,
        reason: reason
      });

      // Call impersonate service
      const session = await startImpersonate(user.id, reason);

      logger.info('[UserImpersonateButton] Impersonate started successfully:', {
        sessionId: session.sessionId,
        targetUserId: session.targetUserId
      });

      // Close dialog
      setShowDialog(false);

      // Show success toast
      toast.success(`Now impersonating ${user.name}. All actions will be logged.`);

      // Call callback if provided
      if (typeof onImpersonateStart === 'function') {
        onImpersonateStart(session);
      }

      // Wait for all state updates to be persisted to localStorage
      logger.info('[UserImpersonateButton] Waiting for state persistence...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Increased to 1 second

      // Verify state is saved before redirect
      const savedAuth = localStorage.getItem('auth.session.v1');
      const savedUser = localStorage.getItem('app.currentUser');
      const savedSession = localStorage.getItem('impersonate.session.v1');

      logger.info('[UserImpersonateButton] Verifying saved state:', {
        hasAuth: !!savedAuth,
        hasUser: !!savedUser,
        hasSession: !!savedSession
      });

      if (!savedAuth || !savedUser || !savedSession) {
        logger.error('[UserImpersonateButton] State not saved properly!', {
          savedAuth: !!savedAuth,
          savedUser: !!savedUser,
          savedSession: !!savedSession
        });
        throw new Error('Failed to save impersonate state');
      }

      // Redirect to dashboard and force reload to apply new context
      logger.info('[UserImpersonateButton] Redirecting to dashboard...');

      // Set flag to indicate impersonate redirect
      sessionStorage.setItem('impersonate.redirecting', 'true');

      // Use href assignment to trigger full page load
      // This ensures all components re-initialize with new user context
      window.location.href = '/dashboard';
    } catch (error) {
      logger.error('[UserImpersonateButton] Error starting impersonate:', error);

      // IMPORTANT: Clean up any partial impersonate state
      // This prevents inconsistent state where session exists but impersonate failed
      try {
        localStorage.removeItem('impersonate.session.v1');
        localStorage.removeItem('impersonate.original_auth.v1');
        sessionStorage.removeItem('impersonate.redirecting');
        logger.info('[UserImpersonateButton] Cleaned up partial impersonate state');
      } catch (cleanupError) {
        logger.error('[UserImpersonateButton] Error cleaning up state:', cleanupError);
      }

      // Close dialog first to ensure toast is visible
      setShowDialog(false);

      // Wait a bit for dialog to close before showing toast
      await new Promise(resolve => setTimeout(resolve, 200));

      // Map error codes to user-friendly messages
      let errorMessage = error.message;
      if (error.message === 'NESTED_IMPERSONATE_NOT_ALLOWED') {
        errorMessage = 'You must stop the current impersonate session first';
      } else if (error.message === 'USER_NOT_FOUND') {
        errorMessage = 'User not found';
      } else if (error.message === 'USER_INACTIVE') {
        errorMessage = 'This user is inactive and cannot be impersonated';
      } else if (error.message === 'CANNOT_IMPERSONATE_SUPERADMIN') {
        errorMessage = 'Cannot impersonate superadmin users';
      }

      toast.error(`Failed to impersonate: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle cancel
  const handleCancelImpersonate = () => {
    logger.info('[UserImpersonateButton] Impersonate dialog cancelled');
    setShowDialog(false);
  };

  // Handle button click
  const handleButtonClick = () => {
    if (isNestedImpersonateActive) {
      logger.warn('[UserImpersonateButton] Nested impersonate attempted while already impersonating');
      toast.warning('You must stop the current impersonate session first');
      return;
    }

    logger.info('[UserImpersonateButton] Opening impersonate dialog for user:', {
      userId: user.id,
      userName: user.name
    });

    setShowDialog(true);
  };

  return (
    <>
      {/* Tooltip container */}
      <div className="relative inline-block group">
        {/* Button */}
        <button
          onClick={handleButtonClick}
          disabled={isNestedImpersonateActive || isLoading}
          className={`
            inline-flex items-center gap-2 px-3 py-2 text-sm font-medium
            rounded-lg transition-all duration-200
            ${isNestedImpersonateActive || isLoading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
              : 'bg-amber-50 text-amber-700 hover:bg-amber-100 active:scale-95'
            }
            border border-amber-200
            focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-0
            ${className}
          `}
          title={
            isNestedImpersonateActive
              ? 'Stop current impersonate session first'
              : 'Impersonate this user to test their permissions'
          }
          aria-label={`Impersonate ${user.name}`}
        >
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span>Impersonate</span>
        </button>

        {/* Tooltip */}
        <div
          className={`
            absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2
            px-3 py-2 bg-gray-900 text-white text-xs rounded-lg
            whitespace-nowrap pointer-events-none
            transition-opacity duration-200 z-50
            ${showTooltip ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          `}
        >
          {isNestedImpersonateActive
            ? 'Stop current impersonate session first'
            : 'Temporarily access the system as this user'}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900" />
        </div>
      </div>

      {/* Impersonate Dialog */}
      {showDialog && (
        <ImpersonateDialog
          targetUser={user}
          onConfirm={handleConfirmImpersonate}
          onCancel={handleCancelImpersonate}
          isLoading={isLoading}
        />
      )}
    </>
  );
}
