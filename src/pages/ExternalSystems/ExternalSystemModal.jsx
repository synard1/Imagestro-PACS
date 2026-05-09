/**
 * External System Modal Component
 * Modal dialog for creating and editing external systems
 */

import React, { useState, useEffect } from 'react';
import ExternalSystemForm from './ExternalSystemForm';

export default function ExternalSystemModal({
  isOpen = false,
  system = null,
  onClose = () => {},
  onSubmit = () => {},
  loading = false,
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (formData) => {
    console.log('[ExternalSystemModal] Received form data:', formData);
    setIsSubmitting(true);
    try {
      console.log('[ExternalSystemModal] Calling onSubmit with:', formData);
      await onSubmit(formData);
      onClose();
    } catch (err) {
      console.error('[ExternalSystemModal] Error in onSubmit:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {system ? 'Edit External System' : 'Create External System'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <ExternalSystemForm
            system={system}
            onSubmit={handleSubmit}
            onCancel={onClose}
            loading={isSubmitting || loading}
          />
        </div>
      </div>
    </div>
  );
}
