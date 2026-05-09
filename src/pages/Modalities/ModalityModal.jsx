import React, { useState } from 'react';
import ModalityForm from './ModalityForm';

/**
 * ModalityModal Component
 * Modal dialog for creating and editing modalities
 */
export default function ModalityModal({
  isOpen = false,
  mode = 'create',
  modality = null,
  onClose = () => {},
  onSubmit = () => {},
  loading = false,
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (formData) => {
    console.log('[ModalityModal] Submitting:', formData);
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      console.error('[ModalityModal] Submit error:', err);
      // Error already handled by parent with toast
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'create': return 'Create Modality';
      case 'edit': return 'Edit Modality';
      case 'view': return 'Modality Details';
      default: return 'Modality';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
         onClick={handleClose}
         role="dialog"
         aria-modal="true"
         aria-labelledby="modality-modal-title">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 id="modality-modal-title" className="text-xl font-bold text-gray-900">
            {getTitle()}
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-500 hover:text-gray-700 text-3xl leading-none font-light disabled:opacity-50"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'view' && modality ? (
            /* View Mode - Read-only display */
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">AE Title</label>
                  <p className="text-gray-900 font-mono">{modality.ae_title}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Name</label>
                  <p className="text-gray-900">{modality.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
                  <p className="text-gray-900">{modality.description || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Host</label>
                  <p className="text-gray-900 font-mono">{modality.host}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Port</label>
                  <p className="text-gray-900">{modality.port}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Modality Type</label>
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                    {modality.modality}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Manufacturer</label>
                  <p className="text-gray-900">{modality.manufacturer || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Model</label>
                  <p className="text-gray-900">{modality.model || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
                  <p className="text-gray-900">
                    {modality.is_active ? (
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-sm">Active</span>
                    ) : (
                      <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-sm">Inactive</span>
                    )}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Online Status</label>
                  <p className="text-gray-900">
                    {modality.is_online ? (
                      <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full text-sm">Online</span>
                    ) : (
                      <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-sm">Offline</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Advanced Details */}
              <div className="border-t border-gray-200 pt-6 mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Advanced Details</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Supported Operations</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {modality.supports_c_store && <span className="bg-slate-100 text-slate-700 px-2 py-1 text-xs rounded">C-STORE</span>}
                      {modality.supports_c_find && <span className="bg-slate-100 text-slate-700 px-2 py-1 text-xs rounded">C-FIND</span>}
                      {modality.supports_c_move && <span className="bg-slate-100 text-slate-700 px-2 py-1 text-xs rounded">C-MOVE</span>}
                      {modality.supports_c_echo && <span className="bg-slate-100 text-slate-700 px-2 py-1 text-xs rounded">C-ECHO</span>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Authentication Required</label>
                    <p className="text-gray-900">{modality.require_authentication ? 'Yes' : 'No'}</p>
                  </div>
                  {modality.require_authentication && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Username</label>
                      <p className="text-gray-900 font-mono">{modality.username || '-'}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Last Seen</label>
                    <p className="text-gray-900">
                      {modality.last_seen ? new Date(modality.last_seen).toLocaleString() : 'Never'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Last Echo</label>
                    <p className="text-gray-900">
                      {modality.last_echo ? new Date(modality.last_echo).toLocaleString() : 'Never'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Statistics</label>
                    <p className="text-sm text-gray-600">
                      Received: {modality.total_studies_received || 0} | Sent: {modality.total_studies_sent || 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="border-t border-gray-200 pt-6 mt-6 text-sm text-gray-500">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Created:</span> {modality.created_at ? new Date(modality.created_at).toLocaleString() : 'Unknown'}
                  </div>
                  <div>
                    <span className="font-medium">Last Updated:</span> {modality.updated_at ? new Date(modality.updated_at).toLocaleString() : 'Unknown'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Create/Edit Mode */
            <ModalityForm
              modality={modality}
              onSubmit={handleSubmit}
              onCancel={handleClose}
              loading={isSubmitting || loading}
            />
          )}
        </div>
      </div>

      {/* Prevent body scroll when modal is open */}
      <style>{`
        body.modal-open { overflow: hidden; }
      `}</style>
    </div>
  );
}
