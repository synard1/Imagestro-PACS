import React, { useState } from 'react'
import {
  ArrowUpTrayIcon,
  TagIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import DicomUploader from '../components/dicom/DicomUploader'
import inspectorService from '../services/inspectorService'

/**
 * DICOM Upload Page
 * Demonstrates automatic DICOM tag extraction and updates using the Inspector service
 */
export default function DicomUpload() {
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [selectedFileId, setSelectedFileId] = useState(null)
  const [fileTags, setFileTags] = useState(null)
  const [loadingTags, setLoadingTags] = useState(false)

  const handleUploadComplete = (result) => {
    // result might have different structure from inspector service
    const fileData = result.file || result;
    const metadata = result.dicom_metadata || result.metadata;
    const tags = result.dicom_tags || result.tags;

    // Add to uploaded files list
    setUploadedFiles(prev => [
      {
        id: fileData.id || fileData.file_id,
        filename: fileData.filename,
        uploaded_at: fileData.uploaded_at || new Date().toISOString(),
        metadata: metadata,
        tags: tags
      },
      ...prev
    ])
  }

  const handleViewTags = async (fileId) => {
    setSelectedFileId(fileId)
    setLoadingTags(true)
    setFileTags(null)

    try {
      const data = await inspectorService.getTags(fileId)
      setFileTags(data)
    } catch (err) {
      console.error('Error fetching tags:', err)
      // Service handles notification
    } finally {
      setLoadingTags(false)
    }
  }

  const handleRefreshTags = async (fileId) => {
    setLoadingTags(true);

    try {
      const data = await inspectorService.refreshTags(fileId)

      // Update the file in the list
      setUploadedFiles(prev => prev.map(file =>
        file.id === fileId
          ? { ...file, tags: data.dicom_tags || data.tags }
          : file
      ))

      // Update displayed tags if this file is selected
      if (selectedFileId === fileId) {
        setFileTags(data)
      }
    } catch (err) {
      console.error('Error refreshing tags:', err)
      // Service handles notification
    } finally {
      setLoadingTags(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowUpTrayIcon className="w-7 h-7" />
          DICOM Inspection Tool
        </h1>
        <p className="text-gray-600 mt-2">
          Upload DICOM files to automatically extract and analyze AWS HealthImaging compatible tags
        </p>
        
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Temporary Storage Notice</p>
            <p className="text-sm text-amber-700 mt-1">
              Uploaded files are processed in a secure, isolated environment. For security and privacy, 
              all files and their extracted metadata are <strong>automatically deleted 10 minutes</strong> after upload.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div>
          <DicomUploader 
            onUploadComplete={handleUploadComplete} 
            uploadFn={inspectorService.inspectFile}
          />
        </div>

        {/* Uploaded Files List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TagIcon className="w-5 h-5" />
            Recent Inspections ({uploadedFiles.length})
          </h3>

          {uploadedFiles.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No files inspected in this session
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {uploadedFiles.map(file => (
                <div
                  key={file.id}
                  className="border border-gray-200 rounded-md p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900">{file.filename}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-500">
                          {new Date(file.uploaded_at).toLocaleTimeString()}
                        </p>
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          Expiring soon
                        </span>
                      </div>
                      {file.metadata && (
                        <div className="mt-2 text-xs text-gray-600">
                          {file.metadata.patient_id && (
                            <span className="mr-3">ID: {file.metadata.patient_id}</span>
                          )}
                          {file.metadata.modality && (
                            <span className="mr-3">Modality: {file.metadata.modality}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewTags(file.id)}
                        className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded border border-blue-300 hover:bg-blue-50"
                      >
                        View Tags
                      </button>
                      <button
                        onClick={() => handleRefreshTags(file.id)}
                        disabled={loadingTags}
                        className="text-green-600 hover:text-green-800 text-xs px-2 py-1 rounded border border-green-300 hover:bg-green-50 disabled:opacity-50"
                        title="Re-run extraction"
                      >
                        <ArrowPathIcon className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DICOM Tags Viewer */}
      {fileTags && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Inspection Results: {fileTags.filename || fileTags.file_id || selectedFileId}
            </h3>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <InformationCircleIcon className="w-4 h-4" />
              Reference ID: {selectedFileId}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Metadata */}
            <div>
              <h4 className="font-medium text-gray-700 mb-3 pb-2 border-b">Basic Metadata</h4>
              <div className="space-y-2 text-sm">
                {Object.entries(fileTags.metadata || fileTags.dicom_metadata || {}).map(([key, value]) => (
                  value && (
                    <div key={key} className="flex border-b border-gray-50 pb-1">
                      <span className="text-gray-500 w-48 flex-shrink-0">{key.replace(/_/g, ' ')}:</span>
                      <span className="font-medium text-gray-900 truncate">{String(value)}</span>
                    </div>
                  )
                ))}
                {Object.keys(fileTags.metadata || fileTags.dicom_metadata || {}).length === 0 && (
                  <p className="text-gray-400 italic">No basic metadata extracted</p>
                )}
              </div>
            </div>

            {/* AWS DICOM Tags */}
            <div>
              <h4 className="font-medium text-gray-700 mb-3 pb-2 border-b">AWS HealthImaging Compliant Tags</h4>
              <div className="max-h-96 overflow-y-auto rounded border border-gray-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">DICOM Tag</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(fileTags.dicom_tags || fileTags.tags || {}).map(([key, value]) => (
                      value !== null && value !== '' && (
                        <tr key={key} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2 text-blue-700 font-mono text-xs">{key}</td>
                          <td className="px-3 py-2 text-gray-900 break-all">{String(value)}</td>
                        </tr>
                      )
                    ))}
                    {Object.keys(fileTags.dicom_tags || fileTags.tags || {}).length === 0 && (
                      <tr>
                        <td colSpan="2" className="px-3 py-8 text-center text-gray-400 italic">
                          No compliant tags found in this file
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Documentation */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <InformationCircleIcon className="w-5 h-5" />
          Technical Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start gap-2">
              <span className="font-bold">1.</span>
              <span><strong>Inspection:</strong> Uses an independent backend dedicated to DICOM parsing and tag validation.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">2.</span>
              <span><strong>AWS Compatibility:</strong> Extracts tags according to the AWS HealthImaging DICOMTags specification.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">3.</span>
              <span><strong>Privacy:</strong> Data is not persisted in the main PACS storage. Ideal for quick metadata verification.</span>
            </li>
          </ul>
          <div className="text-xs text-blue-700 space-y-3">
            <p>
              <strong>Backend Endpoint:</strong> <code>/api/inspector/v1/inspect</code>
            </p>
            <p>
              <strong>Security Policy:</strong> This tool operates in <em>Stateless Inspection Mode</em>. 
              Extracted tags are cached in memory only and flushed periodically.
            </p>
            <p>
              <strong>Reference:</strong> 
              <a
                href="https://docs.aws.amazon.com/healthimaging/latest/APIReference/API_DICOMTags.html"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 underline hover:text-blue-900"
              >
                AWS HealthImaging API Guide
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
