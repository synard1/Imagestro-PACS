/**
 * Import Configuration Dialog Component
 * 
 * Provides file upload, preview, and conflict resolution for importing
 * external systems configuration from JSON files.
 * 
 * Requirements: 19.1, 19.2, 19.3, 19.4
 */

import { useState, useCallback, useRef } from 'react';

// Conflict resolution options
const CONFLICT_RESOLUTION_OPTIONS = [
  {
    value: 'skip',
    label: 'Skip Existing',
    description: 'Keep existing systems unchanged, only add new ones',
    icon: '⏭️',
  },
  {
    value: 'overwrite',
    label: 'Overwrite',
    description: 'Replace existing systems with imported data',
    icon: '🔄',
  },
  {
    value: 'merge',
    label: 'Merge',
    description: 'Update existing systems while preserving sensitive data',
    icon: '🔀',
  },
];

export default function ImportConfigDialog({
  isOpen,
  onClose,
  onImport,
  previewImport,
}) {
  const [step, setStep] = useState('upload'); // 'upload', 'preview', 'importing', 'result'
  const [file, setFile] = useState(null);
  const [importData, setImportData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [conflictResolution, setConflictResolution] = useState('skip');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  
  const fileInputRef = useRef(null);

  const resetState = useCallback(() => {
    setStep('upload');
    setFile(null);
    setImportData(null);
    setPreview(null);
    setConflictResolution('skip');
    setError(null);
    setLoading(false);
    setImportResult(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleFileSelect = useCallback(async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setError(null);
    setFile(selectedFile);

    // Validate file type
    if (!selectedFile.name.endsWith('.json')) {
      setError('Please select a JSON file');
      return;
    }

    // Read and parse file
    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);
      setImportData(data);

      // Get preview
      setLoading(true);
      const previewResult = await previewImport(data);
      setPreview(previewResult);
      setStep('preview');
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON file format');
      } else {
        setError(err.message || 'Failed to read file');
      }
    } finally {
      setLoading(false);
    }
  }, [previewImport]);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      // Create a synthetic event to reuse handleFileSelect
      handleFileSelect({ target: { files: [droppedFile] } });
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
  }, []);

  const handleImport = useCallback(async () => {
    if (!importData) return;

    setStep('importing');
    setLoading(true);
    setError(null);

    try {
      const result = await onImport(importData, { conflictResolution });
      setImportResult(result);
      setStep('result');
    } catch (err) {
      setError(err.message || 'Import failed');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  }, [importData, conflictResolution, onImport]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Import Configuration
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            {/* Step: Upload */}
            {step === 'upload' && (
              <div className="space-y-4">
                <p className="text-gray-600">
                  Upload a JSON configuration file to import external systems.
                </p>

                {/* Drop Zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition
                    ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}
                  `}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {loading ? (
                    <div className="flex flex-col items-center">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
                      <p className="text-gray-600">Reading file...</p>
                    </div>
                  ) : (
                    <>
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-gray-600 mb-1">
                        <span className="text-blue-600 font-medium">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-sm text-gray-500">JSON files only</p>
                    </>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* File Info */}
                {file && !error && (
                  <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
                    <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step: Preview */}
            {step === 'preview' && preview && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Import Summary</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-2xl font-bold text-green-600">{preview.newSystems.length}</p>
                      <p className="text-sm text-gray-600">New Systems</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-2xl font-bold text-yellow-600">{preview.conflicts.length}</p>
                      <p className="text-sm text-gray-600">Conflicts</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-2xl font-bold text-red-600">{preview.errors.length}</p>
                      <p className="text-sm text-gray-600">Errors</p>
                    </div>
                  </div>
                </div>

                {/* New Systems */}
                {preview.newSystems.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      New Systems ({preview.newSystems.length})
                    </h4>
                    <div className="bg-green-50 rounded-lg border border-green-200 divide-y divide-green-200">
                      {preview.newSystems.map((sys, idx) => (
                        <div key={idx} className="px-3 py-2 flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-900">{sys.code}</span>
                            <span className="text-gray-500 ml-2">{sys.name}</span>
                          </div>
                          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                            {sys.type} / {sys.provider}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conflicts */}
                {preview.conflicts.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                      Conflicts ({preview.conflicts.length})
                    </h4>
                    <div className="bg-yellow-50 rounded-lg border border-yellow-200 divide-y divide-yellow-200">
                      {preview.conflicts.map((conflict, idx) => (
                        <div key={idx} className="px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900">{conflict.code}</span>
                            <span className="text-xs text-yellow-700">System already exists</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {conflict.differences.map((diff, dIdx) => (
                              <div key={dIdx} className="flex items-center gap-2">
                                <span className="text-gray-500">{diff.field}:</span>
                                <span className="line-through text-red-500">{String(diff.current)}</span>
                                <span>→</span>
                                <span className="text-green-600">{String(diff.new)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors */}
                {preview.errors.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      Errors ({preview.errors.length})
                    </h4>
                    <div className="bg-red-50 rounded-lg border border-red-200 divide-y divide-red-200">
                      {preview.errors.map((err, idx) => (
                        <div key={idx} className="px-3 py-2 flex items-center justify-between">
                          <span className="font-medium text-gray-900">{err.code}</span>
                          <span className="text-sm text-red-600">{err.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conflict Resolution */}
                {preview.conflicts.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Conflict Resolution</h4>
                    <div className="space-y-2">
                      {CONFLICT_RESOLUTION_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={`
                            flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition
                            ${conflictResolution === option.value 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'border-gray-200 hover:border-gray-300'}
                          `}
                        >
                          <input
                            type="radio"
                            name="conflictResolution"
                            value={option.value}
                            checked={conflictResolution === option.value}
                            onChange={(e) => setConflictResolution(e.target.value)}
                            className="mt-1"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span>{option.icon}</span>
                              <span className="font-medium text-gray-900">{option.label}</span>
                            </div>
                            <p className="text-sm text-gray-600">{option.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step: Importing */}
            {step === 'importing' && (
              <div className="py-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Importing configuration...</p>
              </div>
            )}

            {/* Step: Result */}
            {step === 'result' && importResult && (
              <div className="space-y-4">
                {/* Success Banner */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="font-medium text-green-800">Import Completed</h3>
                    <p className="text-sm text-green-700">
                      Successfully processed {importResult.total} systems
                    </p>
                  </div>
                </div>

                {/* Result Summary */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-gray-900">{importResult.total}</p>
                    <p className="text-xs text-gray-600">Total</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-green-600">{importResult.created}</p>
                    <p className="text-xs text-gray-600">Created</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-blue-600">{importResult.updated}</p>
                    <p className="text-xs text-gray-600">Updated</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-gray-600">{importResult.skipped}</p>
                    <p className="text-xs text-gray-600">Skipped</p>
                  </div>
                </div>

                {/* Details */}
                {importResult.details && importResult.details.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Details</h4>
                    <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200 max-h-48 overflow-y-auto">
                      {importResult.details.map((detail, idx) => (
                        <div key={idx} className="px-3 py-2 flex items-center justify-between">
                          <span className="font-medium text-gray-900">{detail.code}</span>
                          <div className="flex items-center gap-2">
                            <span className={`
                              text-xs px-2 py-1 rounded
                              ${detail.action === 'created' ? 'bg-green-100 text-green-700' : ''}
                              ${detail.action === 'updated' || detail.action === 'merged' ? 'bg-blue-100 text-blue-700' : ''}
                              ${detail.action === 'skipped' ? 'bg-gray-100 text-gray-700' : ''}
                              ${detail.action === 'failed' ? 'bg-red-100 text-red-700' : ''}
                            `}>
                              {detail.action}
                            </span>
                            <span className="text-sm text-gray-500">{detail.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            {step === 'upload' && (
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 transition"
              >
                Cancel
              </button>
            )}

            {step === 'preview' && (
              <>
                <button
                  onClick={resetState}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 transition"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading || preview.errors.length === preview.totalSystems}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Importing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Import
                    </>
                  )}
                </button>
              </>
            )}

            {step === 'result' && (
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
