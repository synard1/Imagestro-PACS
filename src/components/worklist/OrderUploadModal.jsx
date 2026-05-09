import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import DicomUpload from '../pacs/DicomUpload';
import { notify } from '../../services/notifications';

export default function OrderUploadModal({ order, onClose, onUploadComplete }) {
  const [uploadResult, setUploadResult] = useState(null);

  const handleUploadComplete = (result) => {
    setUploadResult(result);

    // Show notification based on result
    if (result.success > 0) {
      notify({
        type: 'success',
        message: `Successfully uploaded ${result.success} DICOM file(s)`,
        detail: `${result.success} of ${result.total} files have been uploaded and linked to order ${order.order_number || order.accession_no}.`
      });
    } else if (result.total > 0) {
      notify({
        type: 'error',
        message: 'Upload failed',
        detail: `All ${result.total} files failed to upload. Please check the files and try again.`
      });
    }

    // Call parent callback
    if (onUploadComplete) {
      onUploadComplete(result);
    }

    // Auto-close after success
    if (result.success > 0) {
      setTimeout(() => {
        onClose();
      }, 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Upload DICOM Images
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Order Context */}
        <div className="p-6 bg-blue-50 border-b border-blue-200">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            📋 Order Context
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-blue-700 font-medium">Patient:</span>{' '}
              <span className="text-blue-900">{order.patient?.name || order.patient_name}</span>
            </div>
            <div>
              <span className="text-blue-700 font-medium">MRN:</span>{' '}
              <span className="text-blue-900">{order.patient?.mrn || order.patient_id}</span>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Order:</span>{' '}
              <span className="text-blue-900">{order.order_number || order.accessionNumber}</span>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Procedure:</span>{' '}
              <span className="text-blue-900">{order.procedure_name || order.description}</span>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Modality:</span>{' '}
              <span className="text-blue-900">{order.modality}</span>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Status:</span>{' '}
              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                order.status === 'completed' ? 'bg-green-100 text-green-800' :
                order.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {order.status?.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Upload Result */}
        {uploadResult && (
          <div className={`mx-6 mt-6 p-4 rounded-lg ${
            uploadResult.success > 0 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className={`font-semibold ${
              uploadResult.success > 0 ? 'text-green-900' : 'text-red-900'
            }`}>
              {uploadResult.success > 0 
                ? `✅ Successfully uploaded ${uploadResult.success} of ${uploadResult.total} files`
                : `❌ Upload failed for all ${uploadResult.total} files`
              }
            </div>
            {uploadResult.success > 0 && (
              <div className="text-sm text-green-700 mt-1">
                Files have been linked to this order.
              </div>
            )}
          </div>
        )}

        {/* Upload Component */}
        <div className="p-6">
          <DicomUpload
            patientId={order.patient?.mrn || order.patient_id}
            patientName={order.patient?.name || order.patient_name}
            orderId={order.id}
            accessionNumber={order.accession_no || order.order_number}
            modality={order.modality}
            studyDescription={order.procedure_name || order.description}
            onUploadComplete={handleUploadComplete}
          />
        </div>

        {/* Instructions */}
        <div className="px-6 pb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">
              ℹ️ Upload Instructions
            </h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Files will be automatically linked to this order</li>
              <li>• Patient information will be validated against DICOM metadata</li>
              <li>• Order status will be updated after successful upload</li>
              <li>• Supported format: DICOM (.dcm files)</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
