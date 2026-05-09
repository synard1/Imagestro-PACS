/**
 * Unmapped Patients Table Component
 * 
 * Displays patients that were imported via orders but don't have standalone PACS patient records.
 * Shows patient info from import history where patient_created=false.
 * 
 * Features:
 * - Table with columns: MRN, Name, Order, Procedure, Imported At, Actions
 * - Search filter
 * - Pagination
 * - Info about how to create patient
 */

import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useServiceMode, useService } from '../../../hooks/useServiceMode';
import * as mockMappingService from '../../../services/mock/mockMappingService';
import * as realMappingService from '../../../services/unifiedMappingService';
import { useToast } from '../../../components/ToastProvider';
import { logger } from '../../../utils/logger';

const PAGE_SIZES = [10, 25, 50];

export default function UnmappedPatientsTable({ systemId, disabled = false }) {
    const { isMockMode } = useServiceMode();
    const { notify } = useToast();

    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
    });

    const [search, setSearch] = useState('');

    const mappingService = useService(mockMappingService, realMappingService);

    const fetchUnmappedPatients = useCallback(async () => {
        if (!systemId || disabled) return;
        
        setLoading(true);
        setError(null);
        
        try {
            const offset = (pagination.page - 1) * pagination.pageSize;
            const params = new URLSearchParams({
                limit: pagination.pageSize,
                offset: offset,
            });
            if (search) {
                params.set('search', search);
            }

            const response = await mappingService.listUnmappedPatients?.(systemId, {
                limit: pagination.pageSize,
                offset: offset,
                search: search,
            });
            
            if (response && response.items) {
                setPatients(response.items);
                setPagination(prev => ({
                    ...prev,
                    total: response.total || 0,
                    totalPages: Math.ceil((response.total || 0) / prev.pageSize),
                }));
            } else {
                setPatients([]);
            }
        } catch (err) {
            logger.error('[UnmappedPatientsTable]', 'Failed to fetch unmapped patients:', err);
            setError(err.message || 'Failed to load unmapped patients');
            setPatients([]);
        } finally {
            setLoading(false);
        }
    }, [systemId, pagination.page, pagination.pageSize, search, disabled, mappingService]);

    useEffect(() => {
        fetchUnmappedPatients();
    }, [fetchUnmappedPatients]);

    const handleSearch = useCallback((e) => {
        e.preventDefault();
        setPagination(prev => ({ ...prev, page: 1 }));
    }, []);

    const handlePageSizeChange = useCallback((e) => {
        const newSize = parseInt(e.target.value, 10);
        setPagination(prev => ({ ...prev, pageSize: newSize, page: 1 }));
    }, []);

    const handlePageChange = useCallback((newPage) => {
        setPagination(prev => ({ ...prev, page: newPage }));
    }, []);

    if (!systemId) {
        return (
            <div className="p-8 text-center">
                <div className="max-w-md mx-auto">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        System Selection Required
                    </h3>
                    <p className="text-gray-600">
                        Please select an external system from the dropdown above to view unmapped patients.
                    </p>
                </div>
            </div>
        );
    }

    if (disabled) {
        return (
            <div className="p-8 text-center text-gray-500">
                Unmapped patients view is disabled for this context.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex gap-4">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search by MRN or patient name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    Search
                </button>
            </form>

            {/* Error State */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800">{error}</p>
                </div>
            )}

            {/* Loading State */}
            {loading ? (
                <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            ) : patients.length === 0 ? (
                /* Empty State */
                <div className="text-center p-8">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        No Unmapped Patients
                    </h3>
                    <p className="text-gray-600">
                        All patients from imported orders have been registered as PACS patients.
                    </p>
                </div>
            ) : (
                <>
                    {/* Results Count */}
                    <div className="text-sm text-gray-600">
                        Showing {patients.length} of {pagination.total} unmapped patients
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        MRN
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Patient Name
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Order ID
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Procedure
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Imported At
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {patients.map((patient) => (
                                    <tr key={patient.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                                            {patient.patient_mrn || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {patient.patient_name || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                                            {patient.external_order_id || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {patient.procedure_name || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {patient.imported_at 
                                                ? new Date(patient.imported_at).toLocaleString('id-ID')
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                                Not Registered
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Page size:</span>
                            <select
                                value={pagination.pageSize}
                                onChange={handlePageSizeChange}
                                className="px-2 py-1 border border-gray-300 rounded"
                            >
                                {PAGE_SIZES.map(size => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handlePageChange(pagination.page - 1)}
                                disabled={pagination.page <= 1}
                                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <span className="text-sm text-gray-600">
                                Page {pagination.page} of {pagination.totalPages || 1}
                            </span>
                            <button
                                onClick={() => handlePageChange(pagination.page + 1)}
                                disabled={pagination.page >= pagination.totalPages}
                                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-blue-900">
                            What are Unmapped Patients?
                        </p>
                        <p className="text-xs text-blue-700 mt-1">
                            These are patients that came via radiology order imports but don't have a standalone patient record in the PACS database. 
                            Their information was stored in worklist items but not registered as actual patients.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

UnmappedPatientsTable.propTypes = {
    systemId: PropTypes.string,
    disabled: PropTypes.bool,
};