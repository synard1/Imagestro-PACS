/**
 * Enhanced Mappings Page
 * 
 * Unified mapping management interface for all external systems.
 * Consolidates features from standalone /mappings and External Systems tab.
 * 
 * Features:
 * - System context selector (All Systems or specific system)
 * - Mapping type tabs (Procedures, Doctors, Operators)
 * - Advanced search and filtering
 * - Pagination
 * - Inline add/edit with Select2
 * - Export/Import JSON
 * - Cross-system view capability
 * 
 * Requirements: 4.1, 5.1, 6.1, 15.1, 15.4
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useServiceMode, useService } from '../hooks/useServiceMode';
import * as mockMappingService from '../services/mock/mockMappingService';
import * as realMappingService from '../services/unifiedMappingService';
import * as mockExternalSystemsService from '../services/mock/mockExternalSystemsService';
import { listExternalSystems as listRealExternalSystems } from '../services/externalSystemsService';
import ProcedureMappingTable from './ExternalSystems/components/ProcedureMappingTable';
import DoctorMappingTable from './ExternalSystems/components/DoctorMappingTable';
import OperatorMappingTable from './ExternalSystems/components/OperatorMappingTable';
import UnmappedProceduresTable from './ExternalSystems/components/UnmappedProceduresTable';
import UnmappedPatientsTable from './ExternalSystems/components/UnmappedPatientsTable';
import { useToast } from '../components/ToastProvider';
import { logger } from '../utils/logger';

// Mapping type constants
const MAPPING_TYPES = {
    PROCEDURES: 'procedures',
    DOCTORS: 'doctors',
    OPERATORS: 'operators',
    UNMAPPED: 'unmapped',
    UNMAPPED_PATIENTS: 'unmapped_patients',
};

/**
 * Enhanced Mappings Page Component
 */
export default function MappingsEnhanced() {
    const { isMockMode } = useServiceMode();
    const { notify } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();

    // State
    const [systems, setSystems] = useState([]);
    const [loadingSystems, setLoadingSystems] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedSystemId, setSelectedSystemId] = useState(
        searchParams.get('system') || ''
    );
    const [activeTab, setActiveTab] = useState(
        searchParams.get('type') || MAPPING_TYPES.PROCEDURES
    );

    // Get services
    const mappingService = useService(mockMappingService, realMappingService);
    const externalSystemsService = useMemo(() => {
        if (isMockMode) {
            return {
                listExternalSystems: mockExternalSystemsService.listExternalSystems,
            };
        }
        return {
            listExternalSystems: listRealExternalSystems,
        };
    }, [isMockMode]);

    // Load external systems for dropdown
    const loadSystems = useCallback(async () => {
        setLoadingSystems(true);
        try {
            const result = await externalSystemsService.listExternalSystems();
            const systemsList = Array.isArray(result) ? result : (result.items || []);
            setSystems(systemsList);
            logger.info('[MappingsEnhanced]', `Loaded ${systemsList.length} external systems`);
        } catch (err) {
            logger.error('[MappingsEnhanced]', 'Failed to load systems', err);
            notify({ type: 'error', message: 'Failed to load external systems', detail: err.message });
            setSystems([]);
        } finally {
            setLoadingSystems(false);
        }
    }, [externalSystemsService, notify]);

    // Handle refresh
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            // Reload systems
            await loadSystems();

            // Dispatch custom event to trigger refresh in child components
            if (selectedSystemId) {
                const event = new CustomEvent('mappings-refresh', {
                    detail: { systemId: selectedSystemId, type: activeTab }
                });
                window.dispatchEvent(event);
            }

            notify({ type: 'success', message: 'Mappings refreshed successfully' });
            logger.info('[MappingsEnhanced]', 'Refresh completed');
        } catch (err) {
            logger.error('[MappingsEnhanced]', 'Refresh failed', err);
            notify({ type: 'error', message: 'Failed to refresh mappings', detail: err.message });
        } finally {
            setRefreshing(false);
        }
    }, [loadSystems, selectedSystemId, activeTab, notify]);

    // Load systems on mount
    useEffect(() => {
        loadSystems();
    }, [loadSystems]);

    // Handle system change
    const handleSystemChange = useCallback((systemId) => {
        setSelectedSystemId(systemId);
        // Update URL query params
        const newParams = new URLSearchParams(searchParams);
        if (systemId) {
            newParams.set('system', systemId);
        } else {
            newParams.delete('system');
        }
        setSearchParams(newParams);
    }, [searchParams, setSearchParams]);

    // Handle tab change
    const handleTabChange = useCallback((tab) => {
        setActiveTab(tab);
        // Update URL query params
        const newParams = new URLSearchParams(searchParams);
        newParams.set('type', tab);
        setSearchParams(newParams);
    }, [searchParams, setSearchParams]);

    // Get selected system info
    const selectedSystem = useMemo(() => {
        return systems.find(s => s.id === selectedSystemId);
    }, [systems, selectedSystemId]);

    // Get tab label
    const getTabLabel = (tab) => {
        switch (tab) {
            case MAPPING_TYPES.PROCEDURES:
                return 'Procedures';
            case MAPPING_TYPES.DOCTORS:
                return 'Doctors';
            case MAPPING_TYPES.OPERATORS:
                return 'Operators';
            case MAPPING_TYPES.UNMAPPED:
                return 'Unmapped Procedures';
            case MAPPING_TYPES.UNMAPPED_PATIENTS:
                return 'Unmapped Patients';
            default:
                return tab;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Mapping Management</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Manage procedure, doctor, and operator mappings across all external systems
                    </p>
                </div>

                {/* System Selector and Refresh Button */}
                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">System:</label>
                    <select
                        value={selectedSystemId}
                        onChange={(e) => handleSystemChange(e.target.value)}
                        disabled={loadingSystems}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]"
                    >
                        <option value="">All Systems</option>
                        {systems.map(system => (
                            <option key={system.id} value={system.id}>
                                {system.code} - {system.name}
                            </option>
                        ))}
                    </select>

                    {/* Refresh Button */}
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing || loadingSystems}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        title="Refresh mappings"
                    >
                        <svg
                            className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        <span className="hidden sm:inline">Refresh</span>
                    </button>
                </div>
            </div>

            {/* System Context Info */}
            {selectedSystem && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-blue-900">
                                Viewing mappings for: {selectedSystem.code} - {selectedSystem.name}
                            </p>
                            <p className="text-xs text-blue-700 mt-1">
                                Provider: {selectedSystem.provider} | Type: {selectedSystem.type}
                                {selectedSystem.facility_name && ` | Facility: ${selectedSystem.facility_name}`}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Cross-System Warning */}
            {!selectedSystemId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-amber-900">
                                Cross-System View
                            </p>
                            <p className="text-xs text-amber-700 mt-1">
                                You are viewing mappings across all external systems. Select a specific system for better performance and to add new mappings.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Mapping Type Tabs */}
            <div className="border-b border-gray-200 bg-white rounded-t-lg shadow-sm">
                <div className="flex gap-6 px-6 overflow-x-auto">
                    {Object.values(MAPPING_TYPES).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => handleTabChange(tab)}
                            className={`relative px-4 py-4 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === tab
                                ? 'text-blue-600'
                                : 'text-gray-500 hover:text-gray-800'
                                }`}
                        >
                            {getTabLabel(tab)}
                            {activeTab === tab && (
                                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-b-lg rounded-t-sm shadow-sm border border-gray-200 border-t-0">
                {/* Procedures Tab */}
                {activeTab === MAPPING_TYPES.PROCEDURES && (
                    selectedSystemId ? (
                        <ProcedureMappingTable systemId={selectedSystemId} />
                    ) : (
                        <CrossSystemProcedureView systems={systems} />
                    )
                )}

                {/* Doctors Tab */}
                {activeTab === MAPPING_TYPES.DOCTORS && (
                    selectedSystemId ? (
                        <DoctorMappingTable systemId={selectedSystemId} />
                    ) : (
                        <CrossSystemDoctorView systems={systems} />
                    )
                )}

                {/* Operators Tab */}
                {activeTab === MAPPING_TYPES.OPERATORS && (
                    selectedSystemId ? (
                        <OperatorMappingTable systemId={selectedSystemId} />
                    ) : (
                        <CrossSystemOperatorView systems={systems} />
                    )
                )}

                {/* Unmapped Tab */}
                {activeTab === MAPPING_TYPES.UNMAPPED && (
                    selectedSystemId ? (
                        <UnmappedProceduresTable systemId={selectedSystemId} />
                    ) : (
                        <CrossSystemUnmappedView systems={systems} />
                    )
                )}

                {/* Unmapped Patients Tab */}
                {activeTab === MAPPING_TYPES.UNMAPPED_PATIENTS && (
                    selectedSystemId ? (
                        <UnmappedPatientsTable systemId={selectedSystemId} />
                    ) : (
                        <CrossSystemUnmappedPatientsView systems={systems} />
                    )
                )}
            </div>

            {/* Help Section */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">💡 Quick Tips</h3>
                <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                    <li>Select a specific system to add, edit, or delete mappings</li>
                    <li>Use "All Systems" view to see mapping conflicts across systems</li>
                    <li>Export mappings to JSON for backup or migration</li>
                    <li>Import mappings from JSON to bulk-create or update</li>
                    <li>Use the search and filter options to find specific mappings quickly</li>
                </ul>
            </div>
        </div>
    );
}

/**
 * Cross-System Procedure View
 * Shows read-only view of procedures across all systems
 */
function CrossSystemProcedureView({ systems }) {
    return (
        <div className="p-8 text-center">
            <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Select a System to Manage Procedures
                </h3>
                <p className="text-gray-600 mb-4">
                    To view, add, edit, or delete procedure mappings, please select a specific external system from the dropdown above.
                </p>
                <div className="bg-gray-50 rounded-lg p-4 text-left">
                    <p className="text-sm font-medium text-gray-700 mb-2">Available Systems:</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                        {systems.length === 0 ? (
                            <li className="text-gray-400 italic">No external systems configured</li>
                        ) : (
                            systems.map(system => (
                                <li key={system.id} className="flex items-center gap-2">
                                    <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                                    {system.code} - {system.name}
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}

/**
 * Cross-System Doctor View
 * Shows read-only view of doctors across all systems
 */
function CrossSystemDoctorView({ systems }) {
    return (
        <div className="p-8 text-center">
            <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Select a System to Manage Doctors
                </h3>
                <p className="text-gray-600 mb-4">
                    To view, add, edit, or delete doctor mappings, please select a specific external system from the dropdown above.
                </p>
                <div className="bg-gray-50 rounded-lg p-4 text-left">
                    <p className="text-sm font-medium text-gray-700 mb-2">Available Systems:</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                        {systems.length === 0 ? (
                            <li className="text-gray-400 italic">No external systems configured</li>
                        ) : (
                            systems.map(system => (
                                <li key={system.id} className="flex items-center gap-2">
                                    <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                                    {system.code} - {system.name}
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}

/**
 * Cross-System Operator View
 * Shows read-only view of operators across all systems
 */
function CrossSystemOperatorView({ systems }) {
    return (
        <div className="p-8 text-center">
            <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Select a System to Manage Operators
                </h3>
                <p className="text-gray-600 mb-4">
                    To view, add, edit, or delete operator mappings, please select a specific external system from the dropdown above.
                </p>
                <div className="bg-gray-50 rounded-lg p-4 text-left">
                    <p className="text-sm font-medium text-gray-700 mb-2">Available Systems:</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                        {systems.length === 0 ? (
                            <li className="text-gray-400 italic">No external systems configured</li>
                        ) : (
                            systems.map(system => (
                                <li key={system.id} className="flex items-center gap-2">
                                    <span className="w-2 h-2 bg-purple-600 rounded-full"></span>
                                    {system.code} - {system.name}
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}

/**
 * Cross-System Unmapped View
 * Shows message to select a system for unmapped procedures
 */
function CrossSystemUnmappedView({ systems }) {
    return (
        <div className="p-8 text-center">
            <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Select a System to View Unmapped Procedures
                </h3>
                <p className="text-gray-600 mb-4">
                    To view and map procedures that failed to import, please select a specific external system from the dropdown above.
                </p>
                <div className="bg-gray-50 rounded-lg p-4 text-left">
                    <p className="text-sm font-medium text-gray-700 mb-2">Available Systems:</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                        {systems.length === 0 ? (
                            <li className="text-gray-400 italic">No external systems configured</li>
                        ) : (
                            systems.map(system => (
                                <li key={system.id} className="flex items-center gap-2">
                                    <span className="w-2 h-2 bg-amber-600 rounded-full"></span>
                                    {system.code} - {system.name}
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}

/**
 * Cross-System Unmapped Patients View
 * Shows message to select a system for unmapped patients
 */
function CrossSystemUnmappedPatientsView({ systems }) {
    return (
        <div className="p-8 text-center">
            <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Select a System to View Unmapped Patients
                </h3>
                <p className="text-gray-600 mb-4">
                    To view patients imported via orders but not registered as standalone patients, please select a specific external system from the dropdown above.
                </p>
                <div className="bg-gray-50 rounded-lg p-4 text-left">
                    <p className="text-sm font-medium text-gray-700 mb-2">Available Systems:</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                        {systems.length === 0 ? (
                            <li className="text-gray-400 italic">No external systems configured</li>
                        ) : (
                            systems.map(system => (
                                <li key={system.id} className="flex items-center gap-2">
                                    <span className="w-2 h-2 bg-red-600 rounded-full"></span>
                                    {system.code} - {system.name}
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}

