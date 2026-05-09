/**
 * Session Info Component
 * 
 * Displays session information in the header:
 * - Time until session expires
 * - Idle time
 * - Session status
 */

import { useState, useEffect, useRef } from 'react';
import sessionManager from '../services/sessionManager';
import { Clock, Activity, AlertCircle } from 'lucide-react';

export default function SessionInfo({ compact = false }) {
    const [sessionInfo, setSessionInfo] = useState(null);
    const [showDetails, setShowDetails] = useState(false);
    const popupRef = useRef(null);

    useEffect(() => {
        // Update session info every 10 seconds
        const updateInfo = () => {
            try {
                const info = sessionManager.getSessionInfo();
                setSessionInfo(info);
            } catch (error) {
                console.error('[SessionInfo] Failed to get session info:', error);
            }
        };

        // Initial update
        updateInfo();

        // Set interval
        const interval = setInterval(updateInfo, 10000); // Every 10 seconds

        return () => clearInterval(interval);
    }, []);

    // Click outside to close popup
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (popupRef.current && !popupRef.current.contains(event.target)) {
                setShowDetails(false);
            }
        };

        // Add event listener when popup is shown
        if (showDetails) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        // Cleanup
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showDetails]);

    if (!sessionInfo || !sessionInfo.isActive) {
        return null;
    }

    // Format time remaining
    const formatTime = (seconds) => {
        if (!seconds || seconds <= 0) return '0m';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    // Get color based on time remaining
    const getTimeColor = (seconds) => {
        if (!seconds) return 'text-gray-600';

        const minutes = seconds / 60;
        if (minutes <= 2) return 'text-red-600';
        if (minutes <= 5) return 'text-orange-600';
        if (minutes <= 15) return 'text-yellow-600';
        return 'text-green-600';
    };

    // Get idle color
    const getIdleColor = (seconds) => {
        if (!seconds) return 'text-gray-600';

        const minutes = seconds / 60;
        if (minutes >= 13) return 'text-red-600';
        if (minutes >= 10) return 'text-orange-600';
        if (minutes >= 5) return 'text-yellow-600';
        return 'text-green-600';
    };

    const timeUntilExpiration = sessionInfo.timeUntilExpiration || 0;
    const idleTime = sessionInfo.idleTime || 0;
    const timeColor = getTimeColor(timeUntilExpiration);
    const idleColor = getIdleColor(idleTime);

    // Compact mode - just show icon with time
    if (compact) {
        return (
            <div className="relative" ref={popupRef}>
                <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/50 cursor-pointer hover:bg-white/80 transition-colors"
                    onClick={() => setShowDetails(!showDetails)}
                    title="Session Information"
                >
                    <Clock size={16} className={timeColor} />
                    <span className={`text-sm font-medium ${timeColor}`}>
                        {formatTime(timeUntilExpiration)}
                    </span>
                </div>

                {showDetails && (
                    <div className="absolute top-full right-0 mt-2 p-3 bg-white rounded-lg shadow-lg border border-gray-200 z-50 min-w-[250px]">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Session Expires:</span>
                                <span className={`text-sm font-semibold ${timeColor}`}>
                                    {formatTime(timeUntilExpiration)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Idle Time:</span>
                                <span className={`text-sm font-semibold ${idleColor}`}>
                                    {formatTime(idleTime)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">User:</span>
                                <span className="text-sm font-medium text-gray-800">
                                    {sessionInfo.user?.username || 'Unknown'}
                                </span>
                            </div>
                            <div className="pt-2 border-t border-gray-200">
                                <div className="text-xs text-gray-500">
                                    Role: <span className="font-medium text-gray-700">{sessionInfo.user?.role || 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Full mode - show all details
    return (
        <div className="flex items-center gap-4 px-4 py-2 bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Session Expiration */}
            <div className="flex items-center gap-2">
                <Clock size={18} className={timeColor} />
                <div>
                    <div className="text-xs text-gray-500">Expires in</div>
                    <div className={`text-sm font-semibold ${timeColor}`}>
                        {formatTime(timeUntilExpiration)}
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="h-8 w-px bg-gray-300" />

            {/* Idle Time */}
            <div className="flex items-center gap-2">
                <Activity size={18} className={idleColor} />
                <div>
                    <div className="text-xs text-gray-500">Idle</div>
                    <div className={`text-sm font-semibold ${idleColor}`}>
                        {formatTime(idleTime)}
                    </div>
                </div>
            </div>

            {/* Warning if close to timeout */}
            {(timeUntilExpiration <= 300 || idleTime >= 780) && (
                <>
                    <div className="h-8 w-px bg-gray-300" />
                    <div className="flex items-center gap-2 text-orange-600">
                        <AlertCircle size={18} />
                        <span className="text-xs font-medium">Session expiring soon!</span>
                    </div>
                </>
            )}
        </div>
    );
}
