import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { getConfig, getConfigSync } from '../../services/config';
import { loadRegistry } from '../../services/api-registry';
import { fetchJson } from '../../services/http';
import StudyCard from './StudyCard';

/**
 * Worklist Widget - Collapsible sidebar widget
 * Shows today's pending studies from backend API
 * Configurable from Settings page
 */
export default function WorklistWidget({ isOpen, onToggle }) {
  const [worklist, setWorklist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Get initial config synchronously
  const initialConfig = getConfigSync();
  
  const [widgetConfig, setWidgetConfig] = useState(() => {
    return {
      enabled: initialConfig?.worklistWidget?.enabled ?? true,
      apiUrl: initialConfig?.worklistWidget?.apiUrl || `${import.meta.env.VITE_MAIN_API_BACKEND_URL || ''}/api/worklist`,
      refreshInterval: initialConfig?.worklistWidget?.refreshInterval || 30000,
      maxItems: initialConfig?.worklistWidget?.maxItems || 10,
      autoRefresh: initialConfig?.worklistWidget?.autoRefresh ?? true,
      useBackendApi: initialConfig?.worklistWidget?.useBackendApi ?? true
    };
  });
  
  const [floatingMenuEnabled, setFloatingMenuEnabled] = useState(() => {
    return initialConfig?.floatingWorklistWidget?.enabled ?? true;
  });

  const navigate = useNavigate();
  const configCheckIntervalRef = useRef(null);

  // Load widget configuration from settings (with caching to avoid excessive API calls)
  const loadWidgetConfig = useCallback(async () => {
    try {
      // Use getConfig which has built-in caching (30s TTL)
      const config = await getConfig();

      if (config.worklistWidget) {
        setWidgetConfig(prev => {
          const newConfig = { ...prev, ...config.worklistWidget };
          return newConfig;
        });
      }
      
      if (config.floatingWorklistWidget !== undefined) {
        setFloatingMenuEnabled(config.floatingWorklistWidget.enabled ?? true);
      }
    } catch (error) {
      console.error('Failed to load widget config:', error);
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    loadWidgetConfig();
    
    // Listen for background config updates
    const handleConfigUpdate = (event) => {
      // console.log('[WorklistWidget] Config updated from event:', event.detail);
      loadWidgetConfig();
    };
    
    window.addEventListener('app-config-updated', handleConfigUpdate);
    return () => window.removeEventListener('app-config-updated', handleConfigUpdate);
  }, [loadWidgetConfig]);

  // Poll for config changes every 30 seconds (respects cache TTL)
  useEffect(() => {
    configCheckIntervalRef.current = setInterval(() => {
      loadWidgetConfig();
    }, 30000); // 30 seconds - matches cache TTL

    return () => {
      if (configCheckIntervalRef.current) {
        clearInterval(configCheckIntervalRef.current);
      }
    };
  }, [loadWidgetConfig]);

  // Load worklist data
  const loadWorklist = useCallback(async () => {
    if (!widgetConfig.enabled) return;

    setLoading(true);
    setError(null);

    try {
      let orders = [];

      // Try backend API if enabled and configured
      if (widgetConfig.useBackendApi && widgetConfig.apiUrl) {
        try {
          const response = await fetchJson(widgetConfig.apiUrl);
          orders = Array.isArray(response) ? response : (response.data || []);
          // console.log('[WorklistWidget] Loaded from backend:', orders.length, 'items');
        } catch (apiError) {
          console.warn('[WorklistWidget] Backend API failed, falling back to api.listWorklist:', apiError.message);
          // Fallback to internal API service
          orders = await api.listWorklist();
        }
      } else {
        // Use internal API service (handles mock/backend internally)
        orders = await api.listWorklist();
      }

      // Filter active worklist items (not completed/cancelled)
      const pending = orders.filter(o =>
        !['completed', 'cancelled', 'delivered'].includes(o.status)
      );

      // Map to study format and limit items
      const mappedStudies = pending.slice(0, widgetConfig.maxItems).map(order => ({
        id: order.id,
        patientName: order.patient_name || order.patientName,
        patientId: order.patient_id || order.patientId || order.mrn,
        studyDescription: order.requested_procedure || order.procedure,
        studyDate: order.scheduled_start_at?.split(' ')[0] || order.studyDate,
        modality: order.modality,
        status: order.status,
        _offline: order._offline
      }));

      setWorklist(mappedStudies);
    } catch (error) {
      console.error('[WorklistWidget] Failed to load worklist:', error);
      setError(error.message || 'Failed to load worklist');
    } finally {
      setLoading(false);
    }
  }, [widgetConfig]);

  // Load worklist when widget opens
  useEffect(() => {
    if (isOpen && widgetConfig.enabled) {
      loadWorklist();
    }
  }, [isOpen, widgetConfig.enabled, loadWorklist]);

  // Auto-refresh worklist at configured interval
  useEffect(() => {
    if (!isOpen || !widgetConfig.enabled || !widgetConfig.refreshInterval) return;

    const intervalId = setInterval(() => {
      loadWorklist();
    }, widgetConfig.refreshInterval);

    return () => clearInterval(intervalId);
  }, [isOpen, widgetConfig.enabled, widgetConfig.refreshInterval, loadWorklist]);

  if (!isOpen) {
    // Don't show floating button if the widget is disabled OR floating menu is disabled OR global registry disabled
    const registry = loadRegistry();
    if (!widgetConfig.enabled || !floatingMenuEnabled || registry.worklist?.enabled !== true) {
      return null;
    }

    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-2 py-4 rounded-l-lg shadow-lg hover:bg-blue-700 z-40"
        title="Open Worklist"
      >
        <div className="text-xs font-semibold writing-mode-vertical">WORKLIST</div>
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l border-slate-200 shadow-xl z-40 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-sm">Worklist</h3>
            <p className="text-xs text-slate-500">
              {worklist.length} pending {worklist.length === 1 ? 'study' : 'studies'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadWorklist}
              disabled={loading}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              title="Refresh worklist"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={onToggle}
              className="text-slate-400 hover:text-slate-600"
              title="Close worklist"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* API Source Indicator */}
        {widgetConfig.useBackendApi && widgetConfig.apiUrl && (
          <div className="mt-2 px-2 py-1 bg-green-50 border border-green-200 rounded text-xs">
            <span className="text-green-700">Backend API</span>
            <span className="text-slate-500 ml-1">• Auto-refresh: {widgetConfig.refreshInterval / 1000}s</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-2 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Worklist Items */}
      <div className="flex-1 overflow-y-auto">
        {loading && worklist.length === 0 ? (
          <div className="p-4 text-center text-slate-500">
            <div className="animate-pulse">Loading worklist...</div>
          </div>
        ) : worklist.length === 0 ? (
          <div className="p-4 text-center text-slate-500">
            <div className="text-4xl mb-2">✅</div>
            <div className="text-sm">No pending studies</div>
            {!widgetConfig.enabled && (
              <div className="text-xs mt-2 text-amber-600">Widget is disabled in Settings</div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {worklist.map((study) => (
              <div key={study.id} className="relative">
                {study._offline && (
                  <div className="absolute top-2 right-2 px-1 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
                    Offline
                  </div>
                )}
                <StudyCard study={study} compact />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-200">
        <button
          onClick={() => {
            navigate('/worklist');
            onToggle();
          }}
          className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          View Full Worklist
        </button>
      </div>
    </div>
  );
}
