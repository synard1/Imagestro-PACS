/**
 * Doctor Mapping Table Component
 * 
 * Displays and manages doctor mappings between external systems and PACS.
 * 
 * Features:
 * - Table with columns: External Code, External Name, PACS Doctor, Auto-Created, Actions
 * - Inline add/edit form with PACS doctor dropdown
 * - Delete with confirmation
 * - Auto-created indicator badge
 * - PACS doctor details tooltip/popover
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 15.2, 15.5
 */

import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useServiceMode, useService } from '../../../hooks/useServiceMode';
import * as mockMappingService from '../../../services/mock/mockMappingService';
import * as realMappingService from '../../../services/unifiedMappingService';
import { logger } from '../../../utils/logger';

// Mock PACS doctors for dropdown (in real implementation, fetch from doctorService)
const MOCK_PACS_DOCTORS = [
  { id: 'doc-uuid-001', name: 'Dr. Ahmad Radiologi', specialty: 'Radiology' },
  { id: 'doc-uuid-002', name: 'Dr. Budi Internist', specialty: 'Internal Medicine' },
  { id: 'doc-uuid-003', name: 'Dr. Citra Surgeon', specialty: 'Surgery' },
  { id: 'doc-uuid-004', name: 'Dr. Dewi Neurologist', specialty: 'Neurology' },
  { id: 'doc-uuid-005', name: 'Dr. Eko Cardiologist', specialty: 'Cardiology' },
  { id: 'doc-uuid-006', name: 'Dr. Faisal Orthopedic', specialty: 'Orthopedics' },
];

// Page size options
const PAGE_SIZES = [10, 25, 50];

/**
 * DoctorMappingTable Component
 */
export default function DoctorMappingTable({ systemId, disabled = false }) {
  const { isMockMode } = useServiceMode();

  // Get mapping service based on mode
  const mappingService = useService(mockMappingService, realMappingService);

  // State
  const [mappings, setMappings] = useState([]);
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

  // Edit/Add state
  const [editingId, setEditingId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState(getEmptyFormData());
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);



  // Load mappings
  const loadMappings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await mappingService.listDoctorMappings(systemId, {
        search,
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
      setError(err.message || 'Failed to load doctor mappings');
      logger.error('[DoctorMappingTable]', 'Load failed', err);
    } finally {
      setLoading(false);
    }
  }, [systemId, search, pagination.page, pagination.pageSize, mappingService]);

  // Load on mount and when filters change
  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  // Listen for import and refresh events
  useEffect(() => {
    const handleImport = (event) => {
      if (event.detail.systemId === systemId && event.detail.type === 'doctors') {
        loadMappings();
      }
    };

    const handleRefresh = (event) => {
      if (event.detail.systemId === systemId && event.detail.type === 'doctors') {
        loadMappings();
      }
    };

    window.addEventListener('mappings-imported', handleImport);
    window.addEventListener('mappings-refresh', handleRefresh);

    return () => {
      window.removeEventListener('mappings-imported', handleImport);
      window.removeEventListener('mappings-refresh', handleRefresh);
    };
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
    if (!data.pacs_doctor_id) {
      errors.pacs_doctor_id = 'PACS doctor is required';
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
      pacs_doctor_id: mapping.pacs_doctor_id || '',
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
      // Get doctor name from selected doctor
      const selectedDoctor = MOCK_PACS_DOCTORS.find(d => d.id === formData.pacs_doctor_id);
      const dataToSave = {
        ...formData,
        pacs_doctor_name: selectedDoctor?.name || '',
      };

      if (isAdding) {
        await mappingService.createDoctorMapping(systemId, dataToSave);
        logger.info('[DoctorMappingTable]', 'Created mapping', { code: formData.external_code });
      } else {
        await mappingService.updateDoctorMapping(systemId, editingId, dataToSave);
        logger.info('[DoctorMappingTable]', 'Updated mapping', { id: editingId });
      }

      handleCancel();
      loadMappings();
    } catch (err) {
      setError(err.message || 'Failed to save mapping');
      logger.error('[DoctorMappingTable]', 'Save failed', err);
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
      await mappingService.deleteDoctorMapping(systemId, deletingId);
      logger.info('[DoctorMappingTable]', 'Deleted mapping', { id: deletingId });
      setShowDeleteConfirm(false);
      setDeletingId(null);
      loadMappings();
    } catch (err) {
      setError(err.message || 'Failed to delete mapping');
      logger.error('[DoctorMappingTable]', 'Delete failed', err);
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
    <div className="p-4">
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
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
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
                PACS Doctor
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Auto-Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Add New Row */}
            {isAdding && (
              <DoctorFormRow
                formData={formData}
                formErrors={formErrors}
                doctors={MOCK_PACS_DOCTORS}
                onChange={handleFieldChange}
                onSave={handleSave}
                onCancel={handleCancel}
                saving={saving}
              />
            )}

            {/* Loading State */}
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
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
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No doctor mappings found.
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      Clear search
                    </button>
                  )}
                </td>
              </tr>
            )}

            {/* Data Rows */}
            {!loading && mappings.map((mapping) => (
              editingId === mapping.id ? (
                <DoctorFormRow
                  key={mapping.id}
                  formData={formData}
                  formErrors={formErrors}
                  doctors={MOCK_PACS_DOCTORS}
                  onChange={handleFieldChange}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  saving={saving}
                  isEdit
                />
              ) : (
                <DoctorRow
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

DoctorMappingTable.propTypes = {
  systemId: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
};
// Helper function
function getEmptyFormData() {
  return {
    external_code: '',
    external_name: '',
    pacs_doctor_id: '',
  };
}

// ============================================
// Helper Components
// ============================================

/**
 * Doctor Row Component
 */
function DoctorRow({ mapping, onEdit, onDelete, disabled }) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Find PACS doctor details
  const pacsDoctor = MOCK_PACS_DOCTORS.find(d => d.id === mapping.pacs_doctor_id);

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900 font-mono">
        {mapping.external_code}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {mapping.external_name}
      </td>
      <td
        className="px-4 py-3 text-sm text-gray-900 relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {mapping.pacs_doctor_id ? (
          <>
            <span className="cursor-help border-b border-dotted border-gray-400">
              {mapping.pacs_doctor_name || pacsDoctor?.name || 'Unknown'}
            </span>
            {/* PACS Doctor Details Tooltip */}
            {showTooltip && pacsDoctor && (
              <div className="absolute z-10 left-0 top-full mt-1 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg max-w-xs">
                <p className="font-medium mb-1">PACS Doctor Details</p>
                <p className="text-gray-300">Name: {pacsDoctor.name}</p>
                <p className="text-gray-300">Specialty: {pacsDoctor.specialty}</p>
                <p className="text-gray-300">ID: {pacsDoctor.id}</p>
              </div>
            )}
          </>
        ) : (
          <span className="text-gray-400 italic">Not mapped</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {mapping.auto_created ? (
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
            Auto-created
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
            Manual
          </span>
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
        </div>
      </td>
    </tr>
  );
}

DoctorRow.propTypes = {
  mapping: PropTypes.object.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

/**
 * Doctor Form Row Component (for add/edit)
 */
function DoctorFormRow({ formData, formErrors, doctors, onChange, onSave, onCancel, saving, isEdit = false }) {
  return (
    <tr className="bg-blue-50">
      <td className="px-4 py-2">
        <input
          type="text"
          value={formData.external_code}
          onChange={(e) => onChange('external_code', e.target.value)}
          placeholder="External Code"
          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${formErrors.external_code ? 'border-red-500' : 'border-gray-300'
            }`}
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
          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${formErrors.external_name ? 'border-red-500' : 'border-gray-300'
            }`}
        />
        {formErrors.external_name && (
          <p className="text-xs text-red-500 mt-1">{formErrors.external_name}</p>
        )}
      </td>
      <td className="px-4 py-2">
        <select
          value={formData.pacs_doctor_id}
          onChange={(e) => onChange('pacs_doctor_id', e.target.value)}
          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${formErrors.pacs_doctor_id ? 'border-red-500' : 'border-gray-300'
            }`}
        >
          <option value="">Select PACS Doctor...</option>
          {doctors.map(doc => (
            <option key={doc.id} value={doc.id}>
              {doc.name} ({doc.specialty})
            </option>
          ))}
        </select>
        {formErrors.pacs_doctor_id && (
          <p className="text-xs text-red-500 mt-1">{formErrors.pacs_doctor_id}</p>
        )}
      </td>
      <td className="px-4 py-2">
        <span className="text-xs text-gray-500">-</span>
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

DoctorFormRow.propTypes = {
  formData: PropTypes.object.isRequired,
  formErrors: PropTypes.object.isRequired,
  doctors: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  saving: PropTypes.bool,
  isEdit: PropTypes.bool,
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
          Are you sure you want to delete this doctor mapping? This action cannot be undone.
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
