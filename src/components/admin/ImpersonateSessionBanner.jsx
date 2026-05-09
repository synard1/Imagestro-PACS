/**
 * ImpersonateSessionBanner Component
 * 
 * Displays a prominent banner when a superadmin is impersonating another user.
 * Shows original superadmin name, target user name, start time, and countdown timer.
 * Includes a "Stop Impersonating" button to end the session.
 * 
 * Requirements: 2.1, 2.2, 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { useState, useEffect } from 'react';
import { getImpersonateSession, getImpersonateTimeRemaining } from '../../services/impersonate-storage';
import { stopImpersonate } from '../../services/impersonateService';
import { useToast } from '../ToastProvider';
import { AlertTriangle, X } from 'lucide-react';
import { logger } from '../../utils/logger';

export default function ImpersonateSessionBanner() {
  const [session, setSession] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  // Load session data on mount and set up interval
  useEffect(() => {
    const loadSession = () => {
      const currentSession = getImpersonateSession();
      setSession(currentSession);

      if (currentSession) {
        const remaining = getImpersonateTimeRemaining();
        setTimeRemaining(remaining);
      }
    };

    // Initial load
    loadSession();

    // Update countdown every second
    const interval = setInterval(() => {
      const currentSession = getImpersonateSession();

      if (currentSession) {
        const remaining = getImpersonateTimeRemaining();
        setTimeRemaining(remaining);
        setSession(currentSession);

        // If session expired, clear it
        if (remaining === 0) {
          setSession(null);
          clearInterval(interval);
        }
      } else {
        setSession(null);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Format time remaining for display
  const formatTimeRemaining = (ms) => {
    if (ms <= 0) return '0m 0s';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  };

  // Format start time for display
  const formatStartTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (e) {
      return 'Unknown';
    }
  };

  // Handle stop impersonate
  const handleStopImpersonate = async () => {
    try {
      setIsLoading(true);
      logger.info('[ImpersonateSessionBanner] Stopping impersonate session');

      await stopImpersonate();

      setSession(null);
      toast.success('Impersonate session stopped. Returning to your account.');

      // Wait for all state updates to be persisted to localStorage
      logger.info('[ImpersonateSessionBanner] Waiting for state restoration...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Increased to 1 second

      // Verify state is restored before redirect
      const savedAuth = localStorage.getItem('auth.session.v1');
      const savedUser = localStorage.getItem('app.currentUser');
      const noSession = !localStorage.getItem('impersonate.session.v1');

      logger.info('[ImpersonateSessionBanner] Verifying restored state:', {
        hasAuth: !!savedAuth,
        hasUser: !!savedUser,
        sessionCleared: noSession
      });

      if (!savedAuth || !savedUser) {
        logger.error('[ImpersonateSessionBanner] State not restored properly!', {
          savedAuth: !!savedAuth,
          savedUser: !!savedUser
        });
        throw new Error('Failed to restore original state');
      }

      // Redirect to dashboard
      logger.info('[ImpersonateSessionBanner] Redirecting to dashboard...');
      window.location.href = '/dashboard';
    } catch (error) {
      logger.error('[ImpersonateSessionBanner] Error stopping impersonate:', error);
      toast.error(`Failed to stop impersonate: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render if no active session
  if (!session) {
    return null;
  }

  // Determine warning state based on time remaining
  const isWarning = timeRemaining < 5 * 60 * 1000; // Less than 5 minutes
  const isCritical = timeRemaining < 1 * 60 * 1000; // Less than 1 minute

  return (
    <div
      className={`
        w-full px-4 py-3 flex items-center justify-between gap-4
        border-b-2 shadow-md
        ${isCritical
          ? 'bg-red-100 border-red-500 text-red-900'
          : isWarning
            ? 'bg-orange-100 border-orange-500 text-orange-900'
            : 'bg-red-100 border-red-500 text-red-900'
        }
      `}
    >
      {/* Left section: Icon and info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <AlertTriangle
          size={24}
          className={`flex-shrink-0 ${isCritical ? 'animate-pulse' : ''}`}
        />

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">
            Impersonating: <span className="font-bold">{session.targetUserName}</span>
          </div>
          <div className="text-xs opacity-90 truncate">
            Original Admin: <span className="font-medium">{session.originalUserName}</span>
            {' • '}
            Started: <span className="font-medium">{formatStartTime(session.startTime)}</span>
          </div>
        </div>
      </div>

      {/* Middle section: Timer */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right">
          <div className="text-xs opacity-90">Time Remaining</div>
          <div className={`font-mono font-bold text-sm ${isCritical ? 'animate-pulse' : ''}`}>
            {formatTimeRemaining(timeRemaining)}
          </div>
        </div>
      </div>

      {/* Right section: Stop button */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleStopImpersonate}
          disabled={isLoading}
          className={`
            px-4 py-2 rounded-lg font-medium text-sm
            transition-all duration-200
            ${isLoading
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:opacity-90 active:scale-95'
            }
            ${isCritical
              ? 'bg-red-600 text-white hover:bg-red-700'
              : isWarning
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-red-600 text-white hover:bg-red-700'
            }
          `}
          title="Stop impersonating and return to your account"
        >
          {isLoading ? 'Stopping...' : 'Stop Impersonating'}
        </button>
      </div>
    </div>
  );
}
