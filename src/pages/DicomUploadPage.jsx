import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DicomUpload from '../components/pacs/DicomUpload';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function DicomUploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId') || null;
  const [uploadResult, setUploadResult] = useState(null);

  const handleUploadComplete = (result) => {
    setUploadResult(result);

    if (result.success > 0) {
      setTimeout(() => {
        // Navigate back to the order if we came from one
        if (orderId) {
          // navigate(`/orders/${orderId}`);
        }
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            <span>Back</span>
          </button>

          <h1 className="text-3xl font-bold text-gray-900">Upload DICOM Files</h1>

          {orderId && (
            <div className="mt-2 mb-1 inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Linked to Order: <code className="font-mono font-bold">{orderId}</code>
            </div>
          )}

          <p className="text-gray-600 mt-2">
            Upload DICOM files to the PACS system. Files will be automatically processed and indexed.
          </p>
        </div>

        {/* Upload Result */}
        {uploadResult && (
          <div className={`mb-6 p-4 rounded-lg ${
            uploadResult.success > 0
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              <div className={`text-lg font-semibold ${
                uploadResult.success > 0 ? 'text-green-900' : 'text-red-900'
              }`}>
                {uploadResult.success > 0
                  ? `✅ Successfully uploaded ${uploadResult.success} of ${uploadResult.total} files`
                  : `❌ Upload failed for all ${uploadResult.total} files`
                }
              </div>
            </div>
          </div>
        )}

        {/* Upload Component - pass orderId if coming from an order */}
        <DicomUpload orderId={orderId} onUploadComplete={handleUploadComplete} />

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            📋 Upload Instructions
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Supported format: DICOM (.dcm files)</li>
            <li>• Maximum file size: 100 MB per file</li>
            <li>• You can upload multiple files at once</li>
            <li>• Files will be automatically linked to patients based on DICOM metadata</li>
            {orderId && <li>• Files will be associated with Order ID: <strong>{orderId}</strong></li>}
            <li>• Upload progress will be shown for each file</li>
          </ul>
        </div>

        {/* Backend Status */}
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            ⚙️ Backend Configuration
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <div>
              <span className="font-medium">PACS Backend:</span>{' '}
              <span className={import.meta.env.VITE_USE_PACS_BACKEND === 'true' ? 'text-green-600 font-semibold' : 'text-blue-600 font-semibold'}>
                {import.meta.env.VITE_USE_PACS_BACKEND === 'true' ? '✅ Enabled (Production Mode)' : '🔵 Disabled (Development Mode)'}
              </span>
            </div>
            <div>
              <span className="font-medium">API URL:</span>{' '}
              <code className="bg-gray-200 px-2 py-1 rounded text-xs">
                {import.meta.env.VITE_PACS_API_URL || 'http://localhost:8003'}
              </code>
            </div>
            {import.meta.env.VITE_USE_PACS_BACKEND !== 'true' ? (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                <div className="font-semibold text-blue-900 mb-1">
                  ℹ️ Development Mode Active
                </div>
                <div className="text-blue-800 text-xs space-y-1">
                  <p>• Files will be simulated (not actually uploaded)</p>
                  <p>• This allows frontend development without backend</p>
                  <p>• Upload will show success/failure simulation</p>
                  <p>• To enable real upload, set VITE_USE_PACS_BACKEND=true in .env</p>
                </div>
              </div>
            ) : (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                <div className="font-semibold text-green-900 mb-1">
                  ✅ Production Mode Active
                </div>
                <div className="text-green-800 text-xs">
                  Files will be uploaded to PACS backend and stored in database.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
