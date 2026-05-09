/**
 * Unmapped Procedures Table Component
 * 
 * Displays procedures that failed to import due to missing mappings.
 * Allows users to create mappings directly from this list.
 * 
 * Features:
 * - Table with columns: External Code, External Name, Occurrence Count, First/Last Seen, Actions
 * - Quick mapping action
 * - Search filter
 * - Pagination
 * - Auto-refresh on mapping creation
 */

import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useServiceMode, useService } from '../../../hooks/useServiceMode';
import * as mockMappingService from '../../../services/mock/mockMappingService';
import * as realMappingService from '../../../services/unifiedMappingService';
import * as procedureService from '../../../services/procedureService';
import Select2 from '../../../components/Select2';
import { useToast } from '../../../components/ToastProvider';
import { logger } from '../../../utils/logger';

// Page size options
const PAGE_SIZES = [10, 25, 50];

/**
 * UnmappedProceduresTable Component
 */
export default function UnmappedProceduresTable({ systemId, disabled = false }) {
    const { isMockMode } = useServiceMode();
    const { notify } = useToast();

    // State
    const [unmappedProcedures, setUnmappedProcedures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
    });

    // Filters
    const [search, setSearch] = useState('');

    // Mapping state
    const [mappingId, setMappingId] = useState(null);
    const [formData, setFormData] = useState(getEmptyFormData());
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);

    // PACS procedures dropdown
    const [pacsProcedures, setPacsProcedures] = useState([]);
    const [loadingPacsProcedures, setLoadingPacsProcedures] = useState(false);

    // Get mapping service
    const mappingService = useService(mockMappingService, realMappingService);

    // Fetch procedures for Select2
    const fetchProcedureOptions = useCallback(async (query) => {
        try {
            const procedures = await procedureService.listProcedures({
                active: true,
                name: query
            });

            return (procedures || []).slice(0, 10).map(proc => ({
                value: proc.id || proc.code,
                label: `${proc.code} - ${proc.name}`,
                meta: {
                    code: proc.code,
                    name: proc.name,
                    modality: proc.modality,
                    body_part: proc.body_part
                }
            }));
        } catch (err) {
            logger.warn('[UnmappedProceduresTable]', 'Failed to fetch procedures:', err.message);
            return [];
        }
    }, []);

    // Sample procedures for Select2 initial display
    const sampleProcedures = useCallback(async () => {
        try {
            const procedures = await procedureService.listProcedures({ active: true });
            return (procedures || []).slice(0, 5).map(proc => ({
                value: proc.id || proc.code,
                label: `${proc.code} - ${proc.name}`,
                meta: {
                    code: proc.code,
                    name: proc.name,
                    modality: proc.modality,
                    body_part: proc.body_part
                }
            }));
        } catch (err) {
            logger.warn('[UnmappedProceduresTable]', 'Failed to load sample procedures:', err.message);
            return [];
        }
    }, []);

    // Load PACS procedures for dropdown
    const loadPacsProcedures = useCallback(async () => {
        setLoadingPacsProcedures(true);
        try {
            const procedures = await procedureService.listProcedures({ active: true });

            const transformed = (procedures || []).map(proc => ({
                id: proc.id || proc.code,
                code: proc.code,
                name: proc.name,
                modality: proc.modality,
                description: proc.description,
                body_part: proc.body_part,
                loinc_code: proc.loinc_code,
            }));

            setPacsProcedures(transformed);
            logger.info('[UnmappedProceduresTable]', `Loaded ${transformed.length} procedures from master data`);
        } catch (err) {
            logger.warn('[UnmappedProceduresTable]', 'Failed to load procedures:', err.message);
            setPacsProcedures([]);
        } finally {
            setLoadingPacsProcedures(false);
        }
    }, []);

    // Load unmapped procedures
    const loadUnmappedProcedures = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await mappingService.listUnmappedProcedures(systemId, {
                search,
                page: pagination.page,
                pageSize: pagination.pageSize,
            });

            logger.info('[UnmappedProceduresTable]', 'Loaded unmapped procedures:', {
                count: result.items?.length,
                total: result.total,
            });

            setUnmappedProcedures(result.items || []);
            setPagination(prev => ({
                ...prev,
                total: result.total || 0,
                totalPages: result.totalPages || 0,
            }));
        } catch (err) {
            setError(err.message || 'Failed to load unmapped procedures');
            logger.error('[UnmappedProceduresTable]', 'Load failed', err);
        } finally {
            setLoading(false);
        }
    }, [systemId, search, pagination.page, pagination.pageSize, mappingService]);

    // Load on mount and when filters change
    useEffect(() => {
        loadUnmappedProcedures();
        loadPacsProcedures();
    }, [loadUnmappedProcedures, loadPacsProcedures]);

    // Listen for refresh events
    useEffect(() => {
        const handleRefresh = (event) => {
            if (event.detail.systemId === systemId && event.detail.type === 'procedures') {
                loadUnmappedProcedures();
            }
        };

        window.addEventListener('mappings-refresh', handleRefresh);

        return () => {
            window.removeEventListener('mappings-refresh', handleRefresh);
        };
    }, [systemId, loadUnmappedProcedures]);

    // Handle search with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            setPagination(prev => ({ ...prev, page: 1 }));
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Form validation
    const validateForm = useCallback((data) => {
        const errors = {};
        if (!data.pacs_code?.trim()) {
            errors.pacs_code = 'PACS code is required';
        }
        if (!data.pacs_name?.trim()) {
            errors.pacs_name = 'PACS name is required';
        }
        return errors;
    }, []);

    // Handle map procedure
    const handleMap = useCallback((unmappedProc) => {
        setMappingId(unmappedProc.id);
        setFormData({
            external_code: unmappedProc.khanza_code,
            external_name: unmappedProc.khanza_name,
            pacs_code: '',
            pacs_name: '',
            modality: '',
            description: '',
            is_active: true,
        });
        setFormErrors({});
    }, []);

    // Handle cancel
    const handleCancel = useCallback(() => {
        setMappingId(null);
        setFormData(getEmptyFormData());
        setFormErrors({});
    }, []);

    // Handle save
    const handleSave = useCallback(async () => {
        const errors = validateForm(formData);
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setSaving(true);
        setError(null);

        try {
            // Create the mapping
            await mappingService.createProcedureMapping(systemId, formData);
            logger.info('[UnmappedProceduresTable]', 'Created mapping', { code: formData.external_code });

            // Soft delete the unmapped procedure record (set is_active = false)
            try {
                await mappingService.deleteUnmappedProcedure(systemId, mappingId);
                logger.info('[UnmappedProceduresTable]', 'Soft deleted unmapped procedure', { id: mappingId });
            } catch (deleteErr) {
                // Log error but don't fail the whole operation
                logger.warn('[UnmappedProceduresTable]', 'Failed to soft delete unmapped procedure:', deleteErr.message);
            }

            notify({
                type: 'success',
                message: 'Mapping created successfully',
                detail: `${formData.external_code} → ${formData.pacs_code}`
            });

            handleCancel();
            loadUnmappedProcedures();
        } catch (err) {
            // Check if error is 409 Conflict (mapping already exists)
            if (err.status === 409 || err.message?.toLowerCase().includes('already exists')) {
                logger.info('[UnmappedProceduresTable]', 'Mapping already exists, soft deleting unmapped procedure');

                // Soft delete the unmapped procedure since mapping already exists
                try {
                    await mappingService.deleteUnmappedProcedure(systemId, mappingId);
                    logger.info('[UnmappedProceduresTable]', 'Soft deleted unmapped procedure (mapping exists)', { id: mappingId });

                    notify({
                        type: 'info',
                        message: 'Mapping already exists',
                        detail: `${formData.external_code} is already mapped. Removed from unmapped list.`
                    });

                    handleCancel();
                    loadUnmappedProcedures();
                } catch (deleteErr) {
                    logger.error('[UnmappedProceduresTable]', 'Failed to soft delete unmapped procedure:', deleteErr.message);
                    setError('Mapping already exists, but failed to update unmapped list. Please refresh the page.');
                    notify({
                        type: 'warning',
                        message: 'Mapping already exists',
                        detail: 'Please refresh the page to see updated list.'
                    });
                }
            } else {
                // Other errors
                setError(err.message || 'Failed to save mapping');
                logger.error('[UnmappedProceduresTable]', 'Save failed', err);
                notify({
                    type: 'error',
                    message: 'Failed to create mapping',
                    detail: err.message
                });
            }
        } finally {
            setSaving(false);
        }
    }, [formData, systemId, mappingId, mappingService, validateForm, handleCancel, loadUnmappedProcedures, notify]);

    // Handle form field change
    const handleFieldChange = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors(prev => ({ ...prev, [field]: null }));
        }
    }, [formErrors]);

    // Handle page change
    const handlePageChange = useCallback((newPage) => {
        setPagination(prev => ({ ...prev, page: newPage }));
    }, []);

    // Handle page size change
    const handlePageSizeChange = useCallback((newSize) => {
        setPagination(prev => ({ ...prev, pageSize: newSize, page: 1 }));
    }, []);

    return (
        <div className="p-4">
            {/* Info Banner */}
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                        <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900">
                            Unmapped Procedures
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                            These procedures were encountered during order import but don't have mappings yet. Create mappings to allow future imports to succeed.
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex-1 min-w-[200px]">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by code or name..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800 text-sm">{error}</p>
                </div>
            )}

            {/* Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    External Code
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    External Name
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Occurrences
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    First Seen
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Last Seen
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {/* Loading State */}
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        <div className="flex justify-center items-center gap-2">
                                            <span className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></span>
                                            Loading...
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {/* Empty State */}
                            {!loading && unmappedProcedures.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <p className="font-medium">No unmapped procedures found</p>
                                            <p className="text-sm text-gray-400">All procedures have been mapped successfully!</p>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {/* Data Rows */}
                            {!loading && unmappedProcedures.map((unmappedProc) => (
                                mappingId === unmappedProc.id ? (
                                    <MappingFormRow
                                        key={unmappedProc.id}
                                        unmappedProc={unmappedProc}
                                        formData={formData}
                                        formErrors={formErrors}
                                        onChange={handleFieldChange}
                                        onSave={handleSave}
                                        onCancel={handleCancel}
                                        saving={saving}
                                        pacsProcedures={pacsProcedures}
                                        fetchProcedureOptions={fetchProcedureOptions}
                                        sampleProcedures={sampleProcedures}
                                    />
                                ) : (
                                    <UnmappedRow
                                        key={unmappedProc.id}
                                        unmappedProc={unmappedProc}
                                        onMap={() => handleMap(unmappedProc)}
                                        disabled={disabled || mappingId !== null}
                                    />
                                )
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {!loading && pagination.total > 0 && (
                <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Show</span>
                        <select
                            value={pagination.pageSize}
                            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                            className="px-2 py-1 border border-gray-300 rounded"
                        >
                            {PAGE_SIZES.map(size => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                        <span>of {pagination.total} items</span>
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
                            Page {pagination.page} of {pagination.totalPages}
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
            )}
        </div>
    );
}

UnmappedProceduresTable.propTypes = {
    systemId: PropTypes.string.isRequired,
    disabled: PropTypes.bool,
};

// Helper function
function getEmptyFormData() {
    return {
        external_code: '',
        external_name: '',
        pacs_code: '',
        pacs_name: '',
        modality: '',
        description: '',
        is_active: true,
    };
}

// ============================================
// Helper Components
// ============================================

/**
 * Unmapped Row Component
 */
function UnmappedRow({ unmappedProc, onMap, disabled }) {
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            return date.toLocaleString('id-ID', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return dateString;
        }
    };

    return (
        <tr className="hover:bg-gray-50">
            <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                {unmappedProc.khanza_code}
            </td>
            <td className="px-4 py-3 text-sm text-gray-900">
                {unmappedProc.khanza_name}
            </td>
            <td className="px-4 py-3 text-sm">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {unmappedProc.occurrence_count} times
                </span>
            </td>
            <td className="px-4 py-3 text-sm text-gray-600">
                {formatDate(unmappedProc.first_seen_at)}
            </td>
            <td className="px-4 py-3 text-sm text-gray-600">
                {formatDate(unmappedProc.last_seen_at)}
            </td>
            <td className="px-4 py-3 text-sm">
                <button
                    onClick={onMap}
                    disabled={disabled}
                    className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                    title="Create mapping"
                >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Map
                </button>
            </td>
        </tr>
    );
}

UnmappedRow.propTypes = {
    unmappedProc: PropTypes.object.isRequired,
    onMap: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

/**
 * Mapping Form Row Component
 */
function MappingFormRow({
    unmappedProc,
    formData,
    formErrors,
    onChange,
    onSave,
    onCancel,
    saving,
    pacsProcedures = [],
    fetchProcedureOptions,
    sampleProcedures
}) {
    const selectedProcedure = pacsProcedures.find(p => p.code === formData.pacs_code);

    const handleProcedureSelect = (opt) => {
        if (opt) {
            onChange('pacs_code', opt.meta?.code || opt.value);
            onChange('pacs_name', opt.meta?.name || opt.label);
            onChange('modality', opt.meta?.modality || '');
        }
    };

    return (
        <tr className="bg-blue-50">
            <td className="px-4 py-3 text-sm text-gray-900 font-mono align-top">
                {unmappedProc.khanza_code}
            </td>
            <td className="px-4 py-3 text-sm text-gray-900 align-top">
                {unmappedProc.khanza_name}
            </td>
            <td colSpan={3} className="px-4 py-3">
                <div className="space-y-3">
                    {/* PACS Code */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            PACS Procedure <span className="text-red-500">*</span>
                        </label>
                        <Select2
                            value={formData.pacs_code}
                            onChange={(v) => {
                                onChange('pacs_code', v);
                                const proc = pacsProcedures.find(p => p.code === v);
                                if (proc) {
                                    onChange('pacs_name', proc.name);
                                    onChange('modality', proc.modality || '');
                                }
                            }}
                            onSelect={handleProcedureSelect}
                            fetchOptions={fetchProcedureOptions}
                            fetchInitial={sampleProcedures}
                            placeholder="Search procedure code or name..."
                            minChars={2}
                            className="w-full"
                        />
                        {formErrors.pacs_code && (
                            <p className="text-xs text-red-500 mt-1">{formErrors.pacs_code}</p>
                        )}
                    </div>

                    {/* PACS Name (auto-filled) */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            PACS Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.pacs_name}
                            onChange={(e) => onChange('pacs_name', e.target.value)}
                            placeholder="PACS Name"
                            disabled={!!selectedProcedure}
                            className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${formErrors.pacs_name ? 'border-red-500' : 'border-gray-300'
                                } ${selectedProcedure ? 'bg-gray-100' : ''}`}
                        />
                        {formErrors.pacs_name && (
                            <p className="text-xs text-red-500 mt-1">{formErrors.pacs_name}</p>
                        )}
                    </div>

                    {/* Modality (auto-filled) */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Modality
                        </label>
                        <select
                            value={formData.modality}
                            onChange={(e) => onChange('modality', e.target.value)}
                            disabled={!!selectedProcedure}
                            className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${selectedProcedure ? 'bg-gray-100' : ''
                                }`}
                        >
                            <option value="">Select...</option>
                            {Array.from(new Set(pacsProcedures.map(p => p.modality).filter(Boolean))).sort().map(mod => (
                                <option key={mod} value={mod}>{mod}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </td>
            <td className="px-4 py-3 align-top">
                <div className="flex flex-col gap-2">
                    <button
                        onClick={onSave}
                        disabled={saving}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-1"
                    >
                        {saving ? (
                            <>
                                <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                                Saving...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Save
                            </>
                        )}
                    </button>
                    <button
                        onClick={onCancel}
                        disabled={saving}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition"
                    >
                        Cancel
                    </button>
                </div>
            </td>
        </tr>
    );
}

MappingFormRow.propTypes = {
    unmappedProc: PropTypes.object.isRequired,
    formData: PropTypes.object.isRequired,
    formErrors: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    saving: PropTypes.bool.isRequired,
    pacsProcedures: PropTypes.array,
    fetchProcedureOptions: PropTypes.func.isRequired,
    sampleProcedures: PropTypes.func.isRequired,
};
