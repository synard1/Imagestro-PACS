import { useState, useEffect } from 'react';
import { 
  SignalIcon,
  ServerIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import ConnectionStatus from '../common/ConnectionStatus';

export default function StatusBar({ minimal = false }) {
  const [status, setStatus] = useState({
    pacsConnection: 'connected',
    storageUsed: 65,
    activeTasks: 3,
    lastSync: new Date().toLocaleTimeString()
  });

  useEffect(() => {
    // Update status periodically
    const interval = setInterval(() => {
      setStatus(prev => ({
        ...prev,
        lastSync: new Date().toLocaleTimeString()
      }));
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  if (minimal) {
    return (
      <div className="bg-gray-900 text-gray-300 px-4 py-1 text-xs flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <ConnectionStatus status={status.pacsConnection} />
        </div>
        <div>Last sync: {status.lastSync}</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 text-gray-300 px-4 py-2 text-sm border-t border-gray-700">
      <div className="flex items-center justify-between">
        {/* Left Section */}
        <div className="flex items-center space-x-6">
          {/* PACS Connection */}
          <div className="flex items-center space-x-2">
            <SignalIcon className={`h-4 w-4 ${
              status.pacsConnection === 'connected' ? 'text-green-500' : 'text-red-500'
            }`} />
            <span className="text-xs">
              PACS: <span className="font-medium">
                {status.pacsConnection === 'connected' ? 'Connected' : 'Disconnected'}
              </span>
            </span>
          </div>

          {/* Storage */}
          <div className="flex items-center space-x-2">
            <ServerIcon className="h-4 w-4 text-blue-400" />
            <span className="text-xs">
              Storage: <span className="font-medium">{status.storageUsed}%</span>
            </span>
            <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full ${
                  status.storageUsed > 80 ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${status.storageUsed}%` }}
              />
            </div>
          </div>

          {/* Active Tasks */}
          <div className="flex items-center space-x-2">
            <CloudArrowUpIcon className="h-4 w-4 text-yellow-400" />
            <span className="text-xs">
              Tasks: <span className="font-medium">{status.activeTasks}</span>
            </span>
          </div>
        </div>

        {/* Center Section */}
        <div className="flex items-center space-x-4">
          {status.activeTasks > 0 && (
            <div className="flex items-center space-x-2 text-yellow-400">
              <div className="animate-pulse w-2 h-2 bg-yellow-400 rounded-full"></div>
              <span className="text-xs">Processing...</span>
            </div>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center space-x-6">
          <span className="text-xs text-gray-400">
            Last sync: {status.lastSync}
          </span>
          <span className="text-xs text-gray-400">
            v1.0.0
          </span>
        </div>
      </div>
    </div>
  );
}
