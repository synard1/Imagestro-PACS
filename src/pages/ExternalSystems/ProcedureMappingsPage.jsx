/**
 * Procedure Mappings Page
 * 
 * Standalone page for managing procedure mappings between external systems and PACS.
 * Accessible from external systems list with system selection.
 * 
 * Features:
 * - System selector dropdown
 * - Comprehensive procedure mapping management
 * - Search, filter, and pagination
 * - PACS procedure dropdown with auto-fill
 * - Import/Export functionality
 * - Backend integration
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceMode, useService } from '../../hooks/useServiceMode';
import * as mockExternalSystemsService from '../../services/mock/mockExternalSystemsService';
import * as realExternalSystemsService from '../../services/externalSystemsService';
import ProcedureMappingsTab from './tabs/ProcedureMappingsTab';
import { logger } from '../../utils/logger';

export default function ProcedureMappingsPage() {
  const navigate = useNavigate();
  const { isMockMode } = useServiceMode();
  
  // State
  const [systems, setSystems] = useState([]);
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [loadingSystems, setLoadingSystems] = useState(true);
  const [error, setError] = useState(null);

  // Get service
  const externalSystemsService = useService(mockExternalSystemsService, realExternalSystemsService);

  // Load external systems
  const loadSystems = useCallback(async () => {
    setLoadingSystems(true);
    setError(null);

    try {
      const result = await externalSystemsService.listExternalSystems({ pageSize: 1000 });
      const systemsList = result.items || result || [];
      setSystems(systemsList);
      
      // Auto-select first system if available
      if (systemsList.length > 0 && !selectedSystemId) {
        setSelectedSystemId(systemsList[0].id);
      }

      logger.info('[ProcedureMappingsPage]', `Loaded ${systemsList.length} external systems`);
    } catch (err) {
      setError(err.message || 'Failed to load external systems');
      logger.error('[ProcedureMappingsPage]', 'Load systems failed:', err);
    } finally {
      setLoadingSystems(false);
    }
  }, [externalSystemsService, selectedSystemId]);

  // Load systems on mount
  useEffect(() => {
    loadSystems();
  }, [loadSystems]);

  const selectedSystem = systems.find(s => s.id === selectedSystemId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Procedure Mappings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage mappings between external systems and PACS procedures</p>
        </div>
        <button
          onClick={() => navigate('/external-systems')}
          className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          ← Back to Systems
        </button>
      </div>

      {/* System Selector */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select External System
        </label>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <select
              value={selectedSystemId}
              onChange={(e) => setSelectedSystemId(e.target.value)}
              disabled={loadingSystems}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">-- Select a system --</option>
              {systems.map(system => (
                <option key={system.id} value={system.id}>
                  {system.code} - {system.name} ({system.type})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={loadSystems}
            disabled={loadingSystems}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingSystems ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* System Info */}
        {selectedSystem && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Code</p>
                <p className="font-medium text-gray-900">{selectedSystem.code}</p>
              </div>
              <div>
                <p className="text-gray-600">Type</p>
                <p className="font-medium text-gray-900">{selectedSystem.type}</p>
              </div>
              <div>
                <p className="text-gray-600">Provider</p>
                <p className="font-medium text-gray-900 capitalize">{selectedSystem.provider}</p>
              </div>
              <div>
                <p className="text-gray-600">Status</p>
                <p className={`font-medium ${selectedSystem.is_active ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedSystem.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error State */}
      {error && !selectedSystemId && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Content */}
      {selectedSystemId ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <ProcedureMappingsTab systemId={selectedSystemId} />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No System Selected</h3>
          <p className="text-gray-500">
            {loadingSystems ? 'Loading systems...' : 'Select an external system to manage its procedure mappings.'}
          </p>
        </div>
      )}
    </div>
  );
}
