/**
 * External Systems List Component
 * 
 * Displays a list of external systems with filtering, searching, and pagination.
 * Allows users to view, edit, and delete external systems.
 * Includes connection status indicators and quick test connection action.
 * Supports backup/restore functionality with export/import.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 17.2, 19.1, 19.2, 19.3, 19.4
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useServiceMode, useService } from '../../hooks/useServiceMode.jsx';
import useExternalSystemsCRUD from '../../hooks/useExternalSystemsCRUD';
import * as mockExternalSystemsService from '../../services/mock/mockExternalSystemsService';
import * as realExternalSystemsService from '../../services/externalSystemsService';
import { testConnection as testRealConnection } from '../../services/connectionTestService';
import ImportConfigDialog from './components/ImportConfigDialog';
import ExternalSystemModal from './ExternalSystemModal';
import { notify } from '../../services/http';
import { useToast } from '../../components/ToastProvider';

// Provider icons mapping
const PROVIDER_ICONS = {
  khanza: '🏥',
  gos: '🔷',
  generic: '⚙️',
};

// System type colors
const TYPE_COLORS = {
  SIMRS: 'bg-blue-100 text-blue-800',
  HIS: 'bg-purple-100 text-purple-800',
  RIS: 'bg-green-100 text-green-800',
  PACS: 'bg-orange-100 text-orange-800',
  LIS: 'bg-pink-100 text-pink-800',
  EMR: 'bg-cyan-100 text-cyan-800',
};

// Connection status colors
const CONNECTION_STATUS_COLORS = {
  connected: 'bg-green-500',
  disconnected: 'bg-red-500',
  unknown: 'bg-gray-400',
  testing: 'bg-yellow-500 animate-pulse',
};

export default function ExternalSystemsList({
  systems: initialSystems = [],
  loading: initialLoading = false,
  error: initialError = null,
  onSelectSystem = () => { },
  onCreateNew = () => { },
  onRefresh = () => { },
}) {
  const { isMockMode, isUsingFallback } = useServiceMode();
  const crud = useExternalSystemsCRUD();
  const { notify: showToast } = useToast();

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(null);

  // Use CRUD hook data if available, otherwise use props
  const systems = crud.systems.length > 0 ? crud.systems : initialSystems;
  const loading = crud.loading || initialLoading;

  // Load systems on mount
  useEffect(() => {
    if (crud.systems.length === 0) {
      crud.fetchSystems();
    }
  }, []);

  // Track fetch errors
  const [fetchError, setFetchError] = useState(initialError);

  useEffect(() => {
    if (initialError) {
      setFetchError(initialError);
    }
  }, [initialError]);

  useEffect(() => {
    if (crud.error) {
      setFetchError(crud.error);
    }
  }, [crud.error]);

  // Get appropriate service based on mode
  const externalSystemsService = useService(mockExternalSystemsService, realExternalSystemsService);

  const [filters, setFilters] = useState({
    type: '',
    status: '',
    search: '',
    facility: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
  });

  // Connection status tracking
  const [connectionStatuses, setConnectionStatuses] = useState({});
  const [connectionResults, setConnectionResults] = useState({});
  const [testingConnections, setTestingConnections] = useState({});

  // Import/Export state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleFilterChange = useCallback((filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value,
    }));
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Handle create
  const handleCreate = useCallback(async (formData) => {
    try {
      await crud.create(formData);
      setIsModalOpen(false);
      setSelectedSystem(null);
      notify({ type: 'success', message: 'External system created successfully' });
    } catch (err) {
      console.error('Failed to create system:', err);
      notify({ type: 'error', message: err.message || 'Failed to create external system' });
    }
  }, [crud]);

  // Handle update
  const handleUpdate = useCallback(async (formData) => {
    console.log('[ExternalSystemsList] handleUpdate called with:', { selectedSystemId: selectedSystem?.id, formData });
    try {
      await crud.update(selectedSystem.id, formData);
      setIsModalOpen(false);
      setSelectedSystem(null);
      notify({ type: 'success', message: 'External system updated successfully' });
    } catch (err) {
      console.error('Failed to update system:', err);
      notify({ type: 'error', message: err.message || 'Failed to update external system' });
    }
  }, [crud, selectedSystem]);

  // Handle delete
  const handleDelete = useCallback(async (systemId) => {
    if (!window.confirm('Are you sure you want to delete this external system? This will also delete all associated mappings.')) {
      return;
    }

    setIsDeleting(systemId);
    try {
      await crud.delete(systemId);
      notify({ type: 'success', message: 'External system deleted successfully' });
    } catch (err) {
      console.error('Failed to delete system:', err);
      notify({ type: 'error', message: err.message || 'Failed to delete external system' });
    } finally {
      setIsDeleting(null);
    }
  }, [crud]);

  // Handle open modal for create
  const handleOpenCreateModal = useCallback(() => {
    setSelectedSystem(null);
    setIsModalOpen(true);
  }, []);

  // Handle open modal for edit
  const handleOpenEditModal = useCallback((system) => {
    setSelectedSystem(system);
    setIsModalOpen(true);
  }, []);

  // Test connection for a single system
  const handleTestConnection = useCallback(async (systemId, e) => {
    e?.stopPropagation();

    setTestingConnections(prev => ({ ...prev, [systemId]: true }));
    setConnectionStatuses(prev => ({ ...prev, [systemId]: 'testing' }));

    try {
      // Use appropriate service based on mode
      let result;
      if (isMockMode) {
        result = await mockExternalSystemsService.testConnection(systemId);
      } else {
        result = await testRealConnection(systemId);
      }

      setConnectionStatuses(prev => ({
        ...prev,
        [systemId]: result.success ? 'connected' : 'disconnected',
      }));

      // Store results
      setConnectionResults(prev => ({
        ...prev,
        [systemId]: result
      }));

      // Show toast notification
      if (result.success) {
        showToast({
          type: 'success',
          message: 'Connection Successful',
          detail: result.message || `Connected in ${result.responseTime}ms`,
          ttl: 5000,
        });
      } else {
        showToast({
          type: 'error',
          message: 'Connection Failed',
          detail: result.error || 'Unable to connect to the external system',
          ttl: 6000,
        });
      }
    } catch (error) {
      setConnectionStatuses(prev => ({ ...prev, [systemId]: 'disconnected' }));
      showToast({
        type: 'error',
        message: 'Connection Test Error',
        detail: error.message || 'An unexpected error occurred',
        ttl: 6000,
      });
    } finally {
      setTestingConnections(prev => ({ ...prev, [systemId]: false }));
    }
  }, [isMockMode, showToast]);

  // Auto-test connections when systems are loaded
  useEffect(() => {
    if (crud.systems.length > 0 && !loading && Object.keys(connectionStatuses).length === 0) {
      // Test connection for all active systems
      const testConnections = async () => {
        for (const system of crud.systems) {
          if (system.is_active) {
            try {
              let result;
              if (isMockMode) {
                result = await mockExternalSystemsService.testConnection(system.id);
              } else {
                result = await testRealConnection(system.id);
              }
              setConnectionStatuses(prev => ({
                ...prev,
                [system.id]: result.success ? 'connected' : 'disconnected',
              }));
            } catch (error) {
              setConnectionStatuses(prev => ({
                ...prev,
                [system.id]: 'disconnected',
              }));
            }
          }
        }
      };
      testConnections();
    }
  }, [crud.systems.length, loading, isMockMode]);

  // Export all systems to JSON file
  const handleExportAll = useCallback(async () => {
    setIsExporting(true);

    try {
      const exportData = await externalSystemsService.exportAllSystems();

      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `external-systems-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export configuration: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  }, []);

  // Preview import data
  const handlePreviewImport = useCallback(async (importData) => {
    return await externalSystemsService.previewImport(importData);
  }, [externalSystemsService]);

  // Import systems from JSON
  const handleImport = useCallback(async (importData, options) => {
    const result = await externalSystemsService.importSystems(importData, options);
    // Refresh the list after import
    onRefresh();
    return result;
  }, [externalSystemsService, onRefresh]);

  // Filter systems based on current filters
  const filteredSystems = useMemo(() => {
    return systems.filter(system => {
      if (filters.type && system.type !== filters.type) return false;
      if (filters.status === 'active' && !system.is_active) return false;
      if (filters.status === 'inactive' && system.is_active) return false;
      if (filters.facility && system.facility_code !== filters.facility) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return (
          system.code?.toLowerCase().includes(searchLower) ||
          system.name?.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [systems, filters]);

  // Get unique facilities for filter dropdown
  const uniqueFacilities = useMemo(() => {
    const facilities = new Set();
    systems.forEach(sys => {
      if (sys.facility_code) {
        facilities.add(JSON.stringify({ code: sys.facility_code, name: sys.facility_name }));
      }
    });
    return Array.from(facilities).map(f => JSON.parse(f));
  }, [systems]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredSystems.length / pagination.pageSize);
  const startIndex = (pagination.page - 1) * pagination.pageSize;
  const endIndex = startIndex + pagination.pageSize;
  const paginatedSystems = filteredSystems.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setPagination(prev => ({
      ...prev,
      page: Math.max(1, prev.page - 1),
    }));
  };

  const handleNextPage = () => {
    setPagination(prev => ({
      ...prev,
      page: Math.min(totalPages, prev.page + 1),
    }));
  };

  const handlePageSizeChange = (newPageSize) => {
    setPagination({
      page: 1,
      pageSize: newPageSize,
    });
  };

  // Get connection status for a system
  const getConnectionStatus = (systemId, isActive) => {
    if (!isActive) return 'disconnected';
    return connectionStatuses[systemId] || 'unknown';
  };

  if (loading && !fetchError && systems.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Error state when backend is not connected
  if (fetchError && systems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
        <div className="p-4 bg-red-50 rounded-full mb-6">
          <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Connection Error</h3>
        <p className="text-gray-500 text-center mb-8 max-w-md">
          Unable to load external systems configuration. {fetchError}
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reload Page
          </button>
          <button
            onClick={() => {
              setFetchError(null);
              crud.fetchSystems();
            }}
            disabled={crud.loading}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20 transition-all font-medium flex items-center gap-2"
          >
            {crud.loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry Connection
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">External Systems</h1>
          <p className="text-sm text-gray-500 mt-1">Manage integrations with HIS, PACS, and other medical systems</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportAll}
            disabled={isExporting || systems.length === 0}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Export Configuration"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            onClick={() => setIsImportDialogOpen(true)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Import Configuration"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
          <div className="h-6 w-px bg-gray-200 mx-1"></div>
          <button
            onClick={() => {
              setFetchError(null);
              crud.fetchSystems();
            }}
            disabled={crud.loading}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Refresh Data"
          >
            <svg className={`w-5 h-5 ${crud.loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm shadow-blue-600/20 transition-all font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add System
          </button>
        </div>
      </div>

      {/* Mock Mode Banner */}
      {isMockMode && (
        <div className={`rounded-lg px-4 py-3 flex items-center gap-3 ${isUsingFallback
          ? 'bg-amber-50 border border-amber-200 text-amber-800'
          : 'bg-indigo-50 border border-indigo-100 text-indigo-800'
          }`}>
          <span className={`flex h-2 w-2 rounded-full ${isUsingFallback ? 'bg-amber-500' : 'bg-indigo-500'
            }`}></span>
          <p className="text-sm font-medium">
            {isUsingFallback
              ? 'Backend unavailable. Using local mock data.'
              : 'Development Mode: Using mock data.'}
          </p>
        </div>
      )}

      {/* Main Content Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

        {/* Filters Toolbar */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col lg:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search systems..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-gray-300 transition-colors"
            >
              <option value="">All Types</option>
              <option value="SIMRS">SIMRS</option>
              <option value="HIS">HIS</option>
              <option value="RIS">RIS</option>
              <option value="PACS">PACS</option>
              <option value="LIS">LIS</option>
              <option value="EMR">EMR</option>
            </select>

            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-gray-300 transition-colors"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <select
              value={filters.facility}
              onChange={(e) => handleFilterChange('facility', e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-gray-300 transition-colors"
            >
              <option value="">All Facilities</option>
              {uniqueFacilities.map(facility => (
                <option key={facility.code} value={facility.code}>
                  {facility.name || facility.code}
                </option>
              ))}
            </select>

            {/* Clear Filters Button - Only show if filters are active */}
            {(filters.type || filters.status || filters.search || filters.facility) && (
              <button
                onClick={() => {
                  setFilters({ type: '', status: '', search: '', facility: '' });
                  setSearchInput('');
                }}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        {loading && !fetchError && systems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-sm text-gray-500 font-medium">Loading external systems...</p>
          </div>
        ) : filteredSystems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No systems found</h3>
            <p className="text-gray-500 max-w-sm mb-6">
              {systems.length === 0
                ? 'Get started by adding a new external system.'
                : 'No systems match your current search filters.'}
            </p>
            {systems.length === 0 && (
              <button
                onClick={onCreateNew}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Add External System
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50 text-xs uppercase cursor-default">
                  <th className="px-6 py-4 font-semibold text-gray-500 tracking-wider">System Info</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 tracking-wider">Type</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 tracking-wider">Provider</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 tracking-wider">Status</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 tracking-wider">Connection</th>
                  <th className="px-6 py-4 font-semibold text-gray-500 tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedSystems.map((system) => {
                  const connStatus = getConnectionStatus(system.id, system.is_active);
                  const isTesting = testingConnections[system.id];

                  return (
                    <tr
                      key={system.id}
                      onClick={() => onSelectSystem(system.id)}
                      className="group hover:bg-gray-50/80 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{system.code}</span>
                          <span className="text-sm text-gray-500">{system.name}</span>
                          {connectionResults[system.id] && (connectionResults[system.id].doctor_count !== undefined || connectionResults[system.id].patient_count !== undefined) && (
                            <div className="mt-1 flex gap-2">
                              <span className="inline-flex items-center text-[10px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                                👨‍⚕️ {connectionResults[system.id].doctor_count || 0} Doctors
                              </span>
                              <span className="inline-flex items-center text-[10px] font-medium bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100">
                                👥 {connectionResults[system.id].patient_count || 0} Patients
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[system.type]
                          ? TYPE_COLORS[system.type].replace('bg-', 'bg-opacity-10 border-').replace('text-', 'bg-')
                          : 'bg-gray-100 border-gray-200 text-gray-800'
                          }`}>
                          {system.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <span>{PROVIDER_ICONS[system.provider] || '📦'}</span>
                          <span className="capitalize">{system.provider || 'Generic'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${system.is_active ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                          <span className={`text-sm ${system.is_active ? 'text-gray-900' : 'text-gray-500'}`}>
                            {system.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ring-2 ring-white ${CONNECTION_STATUS_COLORS[connStatus] || CONNECTION_STATUS_COLORS.unknown}`}
                          ></span>
                          <span className="text-sm text-gray-600 capitalize">
                            {connStatus === 'testing' ? 'Testing...' : connStatus}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 transition-opacity">
                          <button
                            onClick={(e) => handleTestConnection(system.id, e)}
                            disabled={isTesting || !system.is_active}
                            className={`p-1.5 rounded-md transition-colors ${isTesting || !system.is_active
                              ? 'text-gray-400 cursor-not-allowed'
                              : 'text-blue-600 hover:bg-blue-50'
                              }`}
                            title="Test Connection"
                          >
                            <svg className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(system);
                            }}
                            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(system.id);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredSystems.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-white text-sm">
            <div className="text-gray-500">
              Showing <span className="font-medium text-gray-900">{startIndex + 1}</span> to <span className="font-medium text-gray-900">{Math.min(endIndex, filteredSystems.length)}</span> of <span className="font-medium text-gray-900">{filteredSystems.length}</span> results
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousPage}
                disabled={pagination.page === 1}
                className="px-3 py-1 border border-gray-200 rounded-md text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPagination(prev => ({ ...prev, page: i + 1 }))}
                    className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${pagination.page === i + 1
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                onClick={handleNextPage}
                disabled={pagination.page >= totalPages}
                className="px-3 py-1 border border-gray-200 rounded-md text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Import Configuration Dialog */}
      <ImportConfigDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImport={handleImport}
        previewImport={handlePreviewImport}
      />

      {/* Create/Edit Modal */}
      <ExternalSystemModal
        isOpen={isModalOpen}
        system={selectedSystem}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSystem(null);
        }}
        onSubmit={async (formData) => {
          if (selectedSystem) {
            await handleUpdate(formData);
          } else {
            await handleCreate(formData);
          }
        }}
        loading={crud.loading}
      />
    </div>
  );
}
