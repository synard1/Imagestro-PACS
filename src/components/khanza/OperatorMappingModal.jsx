import React, { useState, useEffect } from 'react';
import * as mappingService from '../../services/khanzaMappingService';
import { logger } from '../../utils/logger';

/**
 * OperatorMappingModal Component
 * 
 * Modal dialog for mapping PACS users to SIMRS Khanza operators.
 * Allows users to:
 * - View PACS user details (ID, username)
 * - Search and select Khanza operator
 * - Save mapping via backend API
 * - View success/error messages
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
export default function OperatorMappingModal({ 
  isOpen, 
  onClose, 
  user, 
  onMappingSuccess 
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [existingMapping, setExistingMapping] = useState(null);
  
  // Form state
  const [khanzaOperatorCode, setKhanzaOperatorCode] = useState('');
  const [khanzaOperatorName, setKhanzaOperatorName] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Load existing mapping when modal opens
  useEffect(() => {
    if (isOpen && user) {
      loadExistingMapping();
    }
  }, [isOpen, user]);

  const loadExistingMapping = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const mapping = await mappingService.getOperatorMappingByUserId(user.id);
      if (mapping) {
        setExistingMapping(mapping);
        setKhanzaOperatorCode(mapping.khanza_operator_code || '');
        setKhanzaOperatorName(mapping.khanza_operator_name || '');
        setIsActive(mapping.is_active !== false);
      } else {
        setExistingMapping(null);
        setKhanzaOperatorCode('');
        setKhanzaOperatorName('');
        setIsActive(true);
      }
    } catch (err) {
      logger.error('[OperatorMappingModal]', 'Failed to load existing mapping:', err.message);
      // Not an error if mapping doesn't exist
      setExistingMapping(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      // Validate inputs
      if (!khanzaOperatorCode.trim()) {
        setError('Khanza operator code is required');
        return;
      }
      if (!khanzaOperatorName.trim()) {
        setError('Khanza operator name is required');
        return;
      }

      setLoading(true);
      setError(null);
      setSuccess(false);

      const mappingData = {
        pacs_user_id: user.id,
        pacs_username: user.username,
        khanza_operator_code: khanzaOperatorCode.trim(),
        khanza_operator_name: khanzaOperatorName.trim(),
        is_active: isActive,
      };

      let result;
      if (existingMapping) {
        // Update existing mapping
        result = await mappingService.updateOperatorMapping(
          existingMapping.id,
          mappingData
        );
        logger.info('[OperatorMappingModal]', 'Operator mapping updated:', result);
      } else {
        // Create new mapping
        result = await mappingService.createOperatorMapping(mappingData);
        logger.info('[OperatorMappingModal]', 'Operator mapping created:', result);
      }

      setSuccess(true);
      setExistingMapping(result);
      
      // Call success callback
      if (onMappingSuccess) {
        onMappingSuccess(result);
      }

      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      logger.error('[OperatorMappingModal]', 'Failed to save mapping:', err.message);
      
      // Handle duplicate error
      if (err.code === 'DUPLICATE') {
        setError(`Operator mapping for user '${user.username}' already exists`);
      } else {
        setError(err.message || 'Failed to save operator mapping');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnmap = async () => {
    if (!existingMapping) return;

    if (!window.confirm('Are you sure you want to remove this operator mapping?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await mappingService.deleteOperatorMapping(existingMapping.id);
      logger.info('[OperatorMappingModal]', 'Operator mapping deleted');

      setExistingMapping(null);
      setKhanzaOperatorCode('');
      setKhanzaOperatorName('');
      setSuccess(true);

      // Call success callback
      if (onMappingSuccess) {
        onMappingSuccess(null);
      }

      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      logger.error('[OperatorMappingModal]', 'Failed to delete mapping:', err.message);
      setError(err.message || 'Failed to remove operator mapping');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        {/* Header */}
        <div className="border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Map to SIMRS Operator</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* User Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded">
            <div className="text-sm text-gray-600">PACS User</div>
            <div className="font-semibold text-gray-900">{user?.name || user?.full_name}</div>
            <div className="text-sm text-gray-500">@{user?.username}</div>
            {user?.id && (
              <div className="text-xs text-gray-400 mt-1">ID: {user.id}</div>
            )}
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
              ✓ Operator mapping saved successfully
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              ✕ {error}
            </div>
          )}

          {/* Form */}
          {!success && (
            <div className="space-y-4">
              {/* Khanza Operator Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Khanza Operator Code *
                </label>
                <input
                  type="text"
                  value={khanzaOperatorCode}
                  onChange={(e) => setKhanzaOperatorCode(e.target.value)}
                  placeholder="e.g., OP001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Operator code from SIMRS Khanza system
                </p>
              </div>

              {/* Khanza Operator Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Khanza Operator Name *
                </label>
                <input
                  type="text"
                  value={khanzaOperatorName}
                  onChange={(e) => setKhanzaOperatorName(e.target.value)}
                  placeholder="e.g., Dr. Budi Santoso"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Operator name from SIMRS Khanza system
                </p>
              </div>

              {/* Active Status */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={loading}
                />
                <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
                  Active mapping
                </label>
              </div>
            </div>
          )}

          {/* Existing Mapping Info */}
          {existingMapping && !success && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
              <div className="font-semibold mb-1">Current Mapping</div>
              <div>Code: {existingMapping.khanza_operator_code}</div>
              <div>Name: {existingMapping.khanza_operator_name}</div>
              <div>Status: {existingMapping.is_active ? 'Active' : 'Inactive'}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          {existingMapping && !success && (
            <button
              onClick={handleUnmap}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded border border-red-200"
              disabled={loading}
            >
              Unmap
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded border border-gray-300"
            disabled={loading}
          >
            {success ? 'Close' : 'Cancel'}
          </button>
          {!success && (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Mapping'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
