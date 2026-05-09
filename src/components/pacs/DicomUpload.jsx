import { useState, useCallback } from 'react';
import { uploadDicomFile } from '../../services/pacsService';
import { storeDicomFile } from '../../services/dicomStorageService';
import { 
  CloudArrowUpIcon, 
  DocumentIcon, 
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

export default function DicomUpload({ 
  onUploadComplete, 
  patientId, 
  patientName,
  orderId, 
  accessionNumber,
  modality,
  studyDescription 
}) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter(file => 
        file.name.toLowerCase().endsWith('.dcm') || 
        file.type === 'application/dicom'
      );
      
      setFiles(prev => [...prev, ...newFiles.map((file, idx) => ({
        id: Date.now() + idx,
        file,
        status: 'pending',
        progress: 0,
        error: null
      }))]);
    }
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).filter(file => 
        file.name.toLowerCase().endsWith('.dcm') || 
        file.type === 'application/dicom'
      );
      
      setFiles(prev => [...prev, ...newFiles.map((file, idx) => ({
        id: Date.now() + idx,
        file,
        status: 'pending',
        progress: 0,
        error: null
      }))]);
    }
  };

  const removeFile = (fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    const USE_BACKEND = import.meta.env.VITE_USE_PACS_BACKEND === 'true';
    
    let successCount = 0;
    let totalCount = 0;
    
    for (const fileItem of files) {
      if (fileItem.status !== 'pending') continue;
      
      totalCount++;
      
      try {
        // Update status to uploading
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, status: 'uploading', progress: 0 } : f
        ));
        
        if (USE_BACKEND) {
          // Try backend upload
          try {
            const result = await uploadDicomFile(fileItem.file, {
              patientId,
              orderId
            }, (progress) => {
              setFiles(prev => prev.map(f => 
                f.id === fileItem.id ? { ...f, progress } : f
              ));
            });
            
            // Update status to success
            setFiles(prev => prev.map(f => 
              f.id === fileItem.id ? { ...f, status: 'success', progress: 100 } : f
            ));
            
            successCount++;
            console.log('[DicomUpload] Backend upload success:', result);
          } catch (backendError) {
            console.warn('[DicomUpload] Backend upload failed, using mock mode:', backendError);
            throw backendError;
          }
        } else {
          // Mock upload - Store in localStorage
          console.log('[DicomUpload] Mock upload mode - storing in localStorage:', fileItem.file.name);
          
          // Simulate upload delay
          await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
          
          // Store file in localStorage
          const result = await storeDicomFile(fileItem.file, {
            patientId,
            patientName,
            orderId,
            accessionNumber,
            modality,
            studyDescription
          });
          
          // Auto-transition workflow
          if (orderId) {
            try {
              const { autoTransitionWorkflow } = await import('../../services/workflowService');
              autoTransitionWorkflow(orderId, 'images_uploaded', {
                study_instance_uid: result.studyUID
              });
              console.log('[DicomUpload] Workflow auto-transitioned for order:', orderId);
            } catch (error) {
              console.warn('[DicomUpload] Failed to auto-transition workflow:', error);
            }
          }
          
          // Update status to success
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, status: 'success', progress: 100 } : f
          ));
          
          successCount++;
          console.log('[DicomUpload] Mock upload success - stored in localStorage:', {
            filename: fileItem.file.name,
            size: fileItem.file.size,
            studyUID: result.studyUID,
            mode: 'mock-localStorage'
          });
        }
      } catch (error) {
        console.error('[DicomUpload] Upload failed:', error);
        
        // Update status to error
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { 
            ...f, 
            status: 'error', 
            error: error.message || 'Upload failed' 
          } : f
        ));
      }
    }
    
    setUploading(false);
    
    // Call completion callback with accurate counts
    if (onUploadComplete) {
      onUploadComplete({ total: totalCount, success: successCount });
    }
  };

  const clearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status === 'pending' || f.status === 'uploading'));
  };

  const retryFailed = () => {
    setFiles(prev => prev.map(f => 
      f.status === 'error' ? { ...f, status: 'pending', error: null } : f
    ));
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const uploadingCount = files.filter(f => f.status === 'uploading').length;
  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Upload DICOM Files</h2>
      
      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <CloudArrowUpIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-lg font-medium text-gray-700 mb-2">
          Drag & drop DICOM files here
        </p>
        <p className="text-sm text-gray-500 mb-4">
          or click to browse
        </p>
        <input
          type="file"
          multiple
          accept=".dcm,application/dicom"
          onChange={handleFileInput}
          className="hidden"
          id="dicom-file-input"
        />
        <label
          htmlFor="dicom-file-input"
          className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
        >
          Select Files
        </label>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Files ({files.length})
            </h3>
            <div className="flex gap-2">
              {errorCount > 0 && (
                <button
                  onClick={retryFailed}
                  className="px-3 py-1 text-sm bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                >
                  Retry Failed ({errorCount})
                </button>
              )}
              {successCount > 0 && (
                <button
                  onClick={clearCompleted}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Clear Completed
                </button>
              )}
            </div>
          </div>

          {/* Status Summary */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900">{pendingCount}</div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-900">{uploadingCount}</div>
              <div className="text-sm text-blue-600">Uploading</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-900">{successCount}</div>
              <div className="text-sm text-green-600">Success</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-900">{errorCount}</div>
              <div className="text-sm text-red-600">Failed</div>
            </div>
          </div>

          {/* File Items */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {files.map((fileItem) => (
              <div
                key={fileItem.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  fileItem.status === 'success' 
                    ? 'border-green-200 bg-green-50' 
                    : fileItem.status === 'error'
                    ? 'border-red-200 bg-red-50'
                    : fileItem.status === 'uploading'
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  {fileItem.status === 'success' && (
                    <CheckCircleIcon className="h-6 w-6 text-green-600" />
                  )}
                  {fileItem.status === 'error' && (
                    <XCircleIcon className="h-6 w-6 text-red-600" />
                  )}
                  {fileItem.status === 'uploading' && (
                    <ArrowPathIcon className="h-6 w-6 text-blue-600 animate-spin" />
                  )}
                  {fileItem.status === 'pending' && (
                    <DocumentIcon className="h-6 w-6 text-gray-400" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {fileItem.file.name}
                    </div>
                    <div className="text-xs text-gray-500 ml-2">
                      {fileItem.progress}%
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  {fileItem.status === 'uploading' && (
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                      <div 
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                        style={{ width: `${fileItem.progress}%` }}
                      ></div>
                    </div>
                  )}

                  <div className="text-xs text-gray-500">
                    {(fileItem.file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                  {fileItem.error && (
                    <div className="text-xs text-red-600 mt-1">
                      {fileItem.error}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {fileItem.status === 'pending' && (
                  <button
                    onClick={() => removeFile(fileItem.id)}
                    className="px-3 py-1 text-sm text-red-600 hover:bg-red-100 rounded"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Upload Button */}
          {pendingCount > 0 && (
            <div className="mt-4">
              <button
                onClick={uploadFiles}
                disabled={uploading}
                className={`w-full px-6 py-3 rounded-lg font-semibold ${
                  uploading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {uploading ? 'Uploading...' : `Upload ${pendingCount} File${pendingCount > 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
