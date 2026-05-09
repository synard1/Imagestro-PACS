/**
 * Operator Mapping Table Component
 * 
 * Displays and manages operator mappings between PACS users and external system operators.
 * 
 * Features:
 * - Table with columns: PACS User, External Code, External Name, Status, Actions
 * - Inline add/edit form with PACS user dropdown
 * - Delete with confirmation
 * 
 * Requirements: 6.1, 6.2, 6.3
 */

import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useServiceMode, useService } from '../../../hooks/useServiceMode';
import * as mockMappingService from '../../../services/mock/mockMappingService';
import * as realMappingService from '../../../services/unifiedMappingService';
import { logger } from '../../../utils/logger';

// Mock PACS users for dropdown (in real implementation, fetch from userService)
const MOCK_PACS_USERS = [
  { id: 'user-uuid-001', username: 'radiographer1', name: 'Siti Radiographer', role: 'Radiographer' },
  { id: 'user-uuid-002', username: 'radiographer2', name: 'Joko Radiographer', role: 'Radiographer' },
  { id: 'user-uuid-003', username: 'admin_rad', name: 'Admin Radiologi', role: 'Admin' },
  { id: 'user-uuid-004', username: 'gos_operator', name: 'GOS Operator', role: 'Operator' },
  { id: 'user-uuid-005', username: 'tech1', name: 'Technician 1', role: 'Technician' },
];

// Page size options
const PAGE_SIZES = [10, 25, 50];

/**
 * OperatorMappingTable Component
 */
export default function OperatorMappingTable({ systemId, disabled = false }) {
  const { isMockMode } = useServiceMode();

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

  // Get mapping service based on mode
  const mappingService = useService(mockMappingService, realMappingService);

  // Load mappings
  const loadMappings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await mappingService.listOperatorMappings(systemId, {
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
      setError(err.message || 'Failed to load operator mappings');
      logger.error('[OperatorMappingTable]', 'Load failed', err);
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
      if (event.detail.systemId === systemId && event.detail.type === 'operators') {
        loadMappings();
      }
    };
    const handleRefresh = (event) => {
      if (event.detail.systemId === systemId && event.detail.type === 'operators') {
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
    if (!data.pacs_user_id) {
      errors.pacs_user_id = 'PACS user is required';
    }
    if (!data.external_operator_code?.trim()) {
      errors.external_operator_code = 'External operator code is required';
    }
    if (!data.external_operator_name?.trim()) {
      errors.external_operator_name = 'External operator name is required';
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
      pacs_user_id: mapping.pacs_user_id,
      pacs_username: mapping.pacs_username,
      external_operator_code: mapping.external_operator_code,
      external_operator_name: mapping.external_operator_name,
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
      // Get username from selected user
      const selectedUser = MOCK_PACS_USERS.find(u => u.id === formData.pacs_user_id);
      const dataToSave = {
        ...formData,
        pacs_username: selectedUser?.username || '',
      };

      if (isAdding) {
        await mappingService.createOperatorMapping(systemId, dataToSave);
        logger.info('[OperatorMappingTable]', 'Created mapping', { userId: formData.pacs_user_id });
      } else {
        await mappingService.updateOperatorMapping(systemId, editingId, dataToSave);
        logger.info('[OperatorMappingTable]', 'Updated mapping', { id: editingId });
      }

      handleCancel();
      loadMappings();
    } catch (err) {
      setError(err.message || 'Failed to save mapping');
      logger.error('[OperatorMappingTable]', 'Save failed', err);
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
      await mappingService.deleteOperatorMapping(systemId, deletingId);
      logger.info('[OperatorMappingTable]', 'Deleted mapping', { id: deletingId });
      setShowDeleteConfirm(false);
      setDeletingId(null);
      loadMappings();
    } catch (err) {
      setError(err.message || 'Failed to delete mapping');
      logger.error('[OperatorMappingTable]', 'Delete failed', err);
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
            placeholder="Search by username or operator name..."
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
                PACS User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                External Code
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                External Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Add New Row */}
            {isAdding && (
              <OperatorFormRow
                formData={formData}
                formErrors={formErrors}
                users={MOCK_PACS_USERS}
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
                  No operator mappings found.
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
                <OperatorFormRow
                  key={mapping.id}
                  formData={formData}
                  formErrors={formErrors}
                  users={MOCK_PACS_USERS}
                  onChange={handleFieldChange}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  saving={saving}
                  isEdit
                />
              ) : (
                <OperatorRow
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

OperatorMappingTable.propTypes = {
  systemId: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
};

// Helper function
function getEmptyFormData() {
  return {
    pacs_user_id: '',
    pacs_username: '',
    external_operator_code: '',
    external_operator_name: '',
    is_active: true,
  };
}

// ============================================
// Helper Components
// ============================================

/**
 * Operator Row Component
 */
function OperatorRow({ mapping, onEdit, onDelete, disabled }) {
  // Find PACS user details
  const pacsUser = MOCK_PACS_USERS.find(u => u.id === mapping.pacs_user_id);

  return (
    <tr className={`hover:bg-gray-50 ${!mapping.is_active ? 'opacity-60' : ''}`}>
      <td className="px-4 py-3 text-sm text-gray-900">
        <div>
          <span className="font-medium">{mapping.pacs_username}</span>
          {pacsUser && (
            <span className="text-gray-500 text-xs ml-2">({pacsUser.role})</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-900 font-mono">
        {mapping.external_operator_code}
      </td>
      <td className="px-4 py-3 text-sm text-gray-900">
        {mapping.external_operator_name}
      </td>
      <td className="px-4 py-3 text-sm">
        {mapping.is_active ? (
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">
            Inactive
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

OperatorRow.propTypes = {
  mapping: PropTypes.object.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

/**
 * Operator Form Row Component (for add/edit)
 */
function OperatorFormRow({ formData, formErrors, users, onChange, onSave, onCancel, saving, isEdit = false }) {
  return (
    <tr className="bg-blue-50">
      <td className="px-4 py-2">
        <select
          value={formData.pacs_user_id}
          onChange={(e) => onChange('pacs_user_id', e.target.value)}

          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${formErrors.pacs_user_id ? 'border-red-500' : 'border-gray-300'
            }`}
        >
          <option value="">Select PACS User...</option>
          {users.map(user => (
            <option key={user.id} value={user.id}>
              {user.username} - {user.name} ({user.role})
            </option>
          ))}
        </select>
        {formErrors.pacs_user_id && (
          <p className="text-xs text-red-500 mt-1">{formErrors.pacs_user_id}</p>
        )}
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={formData.external_operator_code}
          onChange={(e) => onChange('external_operator_code', e.target.value)}
          placeholder="External Code"
          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${formErrors.external_operator_code ? 'border-red-500' : 'border-gray-300'
            }`}
        />
        {formErrors.external_operator_code && (
          <p className="text-xs text-red-500 mt-1">{formErrors.external_operator_code}</p>
        )}
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={formData.external_operator_name}
          onChange={(e) => onChange('external_operator_name', e.target.value)}
          placeholder="External Name"
          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${formErrors.external_operator_name ? 'border-red-500' : 'border-gray-300'
            }`}
        />
        {formErrors.external_operator_name && (
          <p className="text-xs text-red-500 mt-1">{formErrors.external_operator_name}</p>
        )}
      </td>
      <td className="px-4 py-2">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => onChange('is_active', e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="ml-2 text-sm text-gray-700">Active</span>
        </label>
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

OperatorFormRow.propTypes = {
  formData: PropTypes.object.isRequired,
  formErrors: PropTypes.object.isRequired,
  users: PropTypes.array.isRequired,
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
          Are you sure you want to delete this operator mapping? This action cannot be undone.
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
