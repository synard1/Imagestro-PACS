import { useState, useEffect } from 'react';
import { useBackendHealth } from '../../hooks/useBackend';

/**
 * Refined PacsHealthIndicator
 * Uses shared background worker health status to reduce network noise
 */
export default function PacsHealthIndicator() {
  const { status, registry } = useBackendHealth({ intervalMs: 60000 }); // Check every 1 minute
  const USE_BACKEND = import.meta.env.VITE_USE_PACS_BACKEND === 'true';
  
  // Use 'nodes' or 'studies' as proxy for PACS health from registry
  const pacsStatus = status['nodes'] || status['studies'] || { healthy: false };
  const isHealthy = pacsStatus.healthy;
  const isUnknown = !pacsStatus.healthy && !pacsStatus.error;

  if (!USE_BACKEND) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
        <span>Mock Mode</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2 text-sm" title={pacsStatus.error || 'Connection OK'}>
      <div className={`w-2 h-2 rounded-full ${
        isHealthy ? 'bg-green-500' : (isUnknown ? 'bg-amber-400 animate-pulse' : 'bg-red-500')
      }`}></div>
      <span className={isHealthy ? 'text-green-700' : (isUnknown ? 'text-amber-700' : 'text-red-700')}>
        PACS {isHealthy ? 'Connected' : (isUnknown ? 'Checking...' : 'Offline')}
      </span>
    </div>
  );
}
