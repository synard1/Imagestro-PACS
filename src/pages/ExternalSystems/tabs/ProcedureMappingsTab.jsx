/**
 * Procedure Mappings Tab Component
 * 
 * Standalone tab for managing procedure mappings between external systems and PACS.
 * Provides comprehensive CRUD operations with search, filter, and pagination.
 * 
 * Features:
 * - List procedure mappings with pagination
 * - Search and filter by modality
 * - Create new mappings with PACS procedure dropdown
 * - Edit existing mappings
 * - Delete mappings with confirmation
 * - Import/Export functionality
 * - Backend integration with real service
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useServiceMode, useService } from '../../../hooks/useServiceMode';
import * as mockMappingService from '../../../services/mock/mockMappingService';
import * as realMappingService from '../../../services/unifiedMappingService';
import * as procedureService from '../../../services/procedureService';
import Select2 from '../../../components/Select2';
import { logger } from '../../../utils/logger';

/**
 * ProcedureMappingsTab Component
 */
export default function ProcedureMappingsTab({ systemId, disabled = false }) {
  const { isMockMode } = useServiceMode();
  
  // State
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  
  // Filters
  const [search, setSearch] = useState('');
  const [modalityFilter, setModalityFilter] = useState('');
  
  // Edit/Add state
  const [editingId, setEditingId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState(getEmptyFormData());
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  
  // Delete state
  const [deletingId, setDeletingId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      logger.warn('[ProcedureMappingsTab]', 'Failed to fetch procedures:', err.message);
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
      logger.warn('[ProcedureMappingsTab]', 'Failed to load sample procedures:', err.message);
      return [];
    }
  }, []);

  // Load procedures for dropdown from master procedures
  const loadPacsProcedures = useCallback(async () => {
    setLoadingPacsProcedures(true);
    try {
      // Load from master procedures at /procedures
      const procedures = await procedureService.listProcedures({ active: true });
      
      // Transform to dropdown format
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
      logger.info('[ProcedureMappingsTab]', `Loaded ${transformed.length} procedures from master data`);
    } catch (err) {
      logger.warn('[ProcedureMappingsTab]', 'Failed to load procedures:', err.message);
      setPacsProcedures([]);
    } finally {
      setLoadingPacsProcedures(false);
    }
  }, []);

  // Load mappings
  const loadMappings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await mappingService.listProcedureMappings(systemId, {
        search,
        modality: modalityFilter || null,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });

      setMappings(result.items || []);
      setPagination(prev => ({
        ...prev,
        total: result.total || 0,
        totalPages: result.totalPages || 0,
      }));
    } catch (err) {
      setError(err.message || 'Failed to load procedure mappings');
      logger.error('[ProcedureMappingsTab]', 'Load failed', err);
    } finally {
      setLoading(false);
    }
  }, [systemId, search, modalityFilter, pagination.page, pagination.pageSize, mappingService]);

  // Load on mount and when filters change
  useEffect(() => {
    loadMappings();
    loadPacsProcedures();
  }, [loadMappings, loadPacsProcedures]);

  // Listen for import events
  useEffect(() => {
    const handleImport = (event) => {
      if (event.detail.systemId === systemId && event.detail.type === 'procedures') {
        loadMappings();
      }
    };
    window.addEventListener('mappings-imported', handleImport);
    return () => window.removeEventListener('mappings-imported', handleImport);
  }, [systemId, loadMappings]);

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
    if (!data.external_code?.trim()) {
      errors.external_code = 'External code is required';
    }
    if (!data.external_name?.trim()) {
      errors.external_name = 'External name is required';
    }
    if (!data.pacs_code?.trim()) {
      errors.pacs_code = 'PACS code is required';
    }
    if (!data.pacs_name?.trim()) {
      errors.pacs_name = 'PACS name is required';
    }
    return errors;
  }, []);

  // Handle add new
  const handleAdd = useCallback(() => {
    setIsAdding(true);
    setEditingId(null);
    setFormData(getEmptyFormData());
    setFormErrors({});
  }, []);

  // Handle edit
  const handleEdit = useCallback((mapping) => {
    setEditingId(mapping.id);
    setIsAdding(false);
    setFormData({
      external_code: mapping.external_code,
      external_name: mapping.external_name,
      pacs_code: mapping.pacs_code,
      pacs_name: mapping.pacs_name,
      modality: mapping.modality || '',
      description: mapping.description || '',
      is_active: mapping.is_active !== false,
    });
    setFormErrors({});
  }, []);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setIsAdding(false);
    setEditingId(null);
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
      if (isAdding) {
        await mappingService.createProcedureMapping(systemId, formData);
        logger.info('[ProcedureMappingsTab]', 'Created mapping', { code: formData.external_code });
      } else {
        await mappingService.updateProcedureMapping(systemId, editingId, formData);
        logger.info('[ProcedureMappingsTab]', 'Updated mapping', { id: editingId });
      }

      handleCancel();
      loadMappings();
    } catch (err) {
      setError(err.message || 'Failed to save mapping');
      logger.error('[ProcedureMappingsTab]', 'Save failed', err);
    } finally {
      setSaving(false);
    }
  }, [formData, isAdding, editingId, systemId, mappingService, validateForm, handleCancel, loadMappings]);

  // Handle delete
  const handleDeleteClick = useCallback((id) => {
    setDeletingId(id);
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingId) return;

    setSaving(true);
    setError(null);

    try {
      await mappingService.deleteProcedureMapping(systemId, deletingId);
      logger.info('[ProcedureMappingsTab]', 'Deleted mapping', { id: deletingId });
      setShowDeleteConfirm(false);
      setDeletingId(null);
      loadMappings();
    } catch (err) {
      setError(err.message || 'Failed to delete mapping');
      logger.error('[ProcedureMappingsTab]', 'Delete failed', err);
    } finally {
      setSaving(false);
    }
  }, [deletingId, systemId, mappingService, loadMappings]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
    setDeletingId(null);
  }, []);

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
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or name..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="w-40">
          <label className="block text-sm font-medium text-gray-700 mb-1">Modality</label>
          <select
            value={modalityFilter}
            onChange={(e) => {
              setModalityFilter(e.target.value);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Modalities</option>
            {Array.from(new Set(pacsProcedures.map(p => p.modality).filter(Boolean))).sort().map(mod => (
              <option key={mod} value={mod}>{mod}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleAdd}
          disabled={disabled || isAdding || editingId}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
        >
          + Add Mapping
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
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
                PACS Code
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                PACS Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Modality
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Add New Row */}
            {isAdding && (
              <MappingFormRow
                formData={formData}
                formErrors={formErrors}
                onChange={handleFieldChange}
                onSave={handleSave}
                onCancel={handleCancel}
                saving={saving}
                pacsProcedures={pacsProcedures}
                fetchProcedureOptions={fetchProcedureOptions}
                sampleProcedures={sampleProcedures}
                allModalities={Array.from(new Set(pacsProcedures.map(p => p.modality).filter(Boolean))).sort()}
              />
            )}

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
            {!loading && mappings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No procedure mappings found.
                  {(search || modalityFilter) && (
                    <button
                      onClick={() => {
                        setSearch('');
                        setModalityFilter('');
                      }}
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            )}

            {/* Data Rows */}
            {!loading && mappings.map((mapping) => (
              editingId === mapping.id ? (
                <MappingFormRow
                  key={mapping.id}
                  formData={formData}
                  formErrors={formErrors}
                  onChange={handleFieldChange}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  saving={saving}
                  isEdit
                  pacsProcedures={pacsProcedures}
                  fetchProcedureOptions={fetchProcedureOptions}
                  sampleProcedures={sampleProcedures}
                  allModalities={Array.from(new Set(pacsProcedures.map(p => p.modality).filter(Boolean))).sort()}
                />
              ) : (
                <MappingRow
                  key={mapping.id}
                  mapping={mapping}
                  onEdit={() => handleEdit(mapping)}
                  onDelete={() => handleDeleteClick(mapping.id)}
                  disabled={disabled || isAdding || editingId}
                />
              )
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && pagination.total > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Show</span>
            <select
              value={pagination.pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded"
            >
              {[10, 20, 50].map(size => (
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          saving={saving}
        />
      )}
    </div>
  );
}

ProcedureMappingsTab.propTypes = {
  systemId: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
};

ProcedureMappingsTab.defaultProps = {
  disabled: false,
};

// ============================================
// Helper Components
// ============================================

/**
 * Mapping Row Component
 */
function MappingRow({ mapping, onEdit, onDelete, disabled }) {
  return (
    <tr className={`hover:bg-gray-50 ${!mapping.is_active ? 'opacity-60' : ''}`}>
      <td className="px-4 py-3 text-sm text-gray-900 font-mono">
        {mapping.external_code}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {mapping.external_name}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 font-mono">
        {mapping.pacs_code}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {mapping.pacs_name}
      </td>
      <td className="px-4 py-3 text-sm">
        {mapping.modality ? (
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
            {mapping.modality}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            disabled={disabled}
            className="text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            disabled={disabled}
            className="text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          {!mapping.is_active && (
            <span className="text-xs text-gray-500 italic">Inactive</span>
          )}
        </div>
      </td>
    </tr>
  );
}

MappingRow.propTypes = {
  mapping: PropTypes.object.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

/**
 * Mapping Form Row Component (for add/edit)
 */
function MappingFormRow({ formData, formErrors, onChange, onSave, onCancel, saving, isEdit = false, pacsProcedures = [], fetchProcedureOptions, sampleProcedures, allModalities = [] }) {
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
      <td className="px-4 py-2">
        <input
          type="text"
          value={formData.external_code}
          onChange={(e) => onChange('external_code', e.target.value)}
          placeholder="External Code"
          disabled={isEdit}
          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            formErrors.external_code ? 'border-red-500' : 'border-gray-300'
          } ${isEdit ? 'bg-gray-100' : ''}`}
        />
        {formErrors.external_code && (
          <p className="text-xs text-red-500 mt-1">{formErrors.external_code}</p>
        )}
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={formData.external_name}
          onChange={(e) => onChange('external_name', e.target.value)}
          placeholder="External Name"
          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            formErrors.external_name ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {formErrors.external_name && (
          <p className="text-xs text-red-500 mt-1">{formErrors.external_name}</p>
        )}
      </td>
      <td className="px-4 py-2">
        <Select2
          value={formData.pacs_code}
          onChange={(v) => {
            onChange('pacs_code', v);
            // Find procedure and auto-fill name and modality
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
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={formData.pacs_name}
          onChange={(e) => onChange('pacs_name', e.target.value)}
          placeholder="PACS Name"
          disabled={!!selectedProcedure}
          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            formErrors.pacs_name ? 'border-red-500' : 'border-gray-300'
          } ${selectedProcedure ? 'bg-gray-100' : ''}`}
        />
        {formErrors.pacs_name && (
          <p className="text-xs text-red-500 mt-1">{formErrors.pacs_name}</p>
        )}
      </td>
      <td className="px-4 py-2">
        <select
          value={formData.modality}
          onChange={(e) => onChange('modality', e.target.value)}
          disabled={!!selectedProcedure}
          className={`w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            selectedProcedure ? 'bg-gray-100' : ''
          }`}
        >
          <option value="">Select...</option>
          {allModalities.map(mod => (
            <option key={mod} value={mod}>{mod}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 transition"
          >
            {saving ? '...' : 'Save'}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:bg-gray-200 transition"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

MappingFormRow.propTypes = {
  formData: PropTypes.object.isRequired,
  formErrors: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  saving: PropTypes.bool,
  isEdit: PropTypes.bool,
  pacsProcedures: PropTypes.array,
  fetchProcedureOptions: PropTypes.func,
  sampleProcedures: PropTypes.func,
  allModalities: PropTypes.array,
};

/**
 * Delete Confirmation Modal
 */
function DeleteConfirmModal({ onConfirm, onCancel, saving }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Mapping</h3>
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete this procedure mapping? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition"
          >
            {saving ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

DeleteConfirmModal.propTypes = {
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  saving: PropTypes.bool,
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
