import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpTrayIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import { uploadDicomFile } from '../../services/studyService'

export default function DicomUploader({ orderId, onUploadComplete, uploadFn }) {
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState(null)
  const [error, setError] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Validate file type
      const validExtensions = ['.dcm', '.dicom']
      const fileName = file.name.toLowerCase()
      const isValid = validExtensions.some(ext => fileName.endsWith(ext))

      if (!isValid && file.type !== 'application/dicom' && file.type !== 'application/octet-stream') {
        setError('Please select a valid DICOM file (.dcm or .dicom)')
        setSelectedFile(null)
        return
      }

      setSelectedFile(file)
      setError(null)
      setUploadResult(null)
      setUploadProgress(0)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first')
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setError(null)
    setUploadResult(null)

    try {
      // Use provided uploadFn or fallback to default studyService one
      const result = uploadFn 
        ? await uploadFn(selectedFile, orderId, (progress) => setUploadProgress(progress))
        : await uploadDicomFile(selectedFile, orderId, (progress) => setUploadProgress(progress))

      setUploadResult(result)
      setSelectedFile(null)
      setUploadProgress(100)

      // Reset file input
      const fileInput = document.getElementById('dicom-file-input')
      if (fileInput) fileInput.value = ''

      // Notify parent component
      if (onUploadComplete) {
        onUploadComplete(result)
      }

    } catch (err) {
      console.error('Upload error:', err)
      setError(err.message || 'Failed to upload DICOM file')
      setUploadProgress(0)
    } finally {
      setUploading(false)
    }
  }

  const handleViewStudies = () => {
    navigate('/studies')
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ArrowUpTrayIcon className="w-5 h-5" />
        Upload DICOM File
      </h3>

      {/* File Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select DICOM File
        </label>
        <input
          id="dicom-file-input"
          type="file"
          accept=".dcm,.dicom,application/dicom"
          onChange={handleFileSelect}
          disabled={uploading}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {selectedFile && (
          <p className="mt-2 text-sm text-gray-600">
            Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
          </p>
        )}
      </div>

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!selectedFile || uploading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md
          hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
          flex items-center justify-center gap-2 transition-colors"
      >
        {uploading ? (
          <>
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <ArrowUpTrayIcon className="w-4 h-4" />
            Upload DICOM File
          </>
        )}
      </button>

      {/* Progress Bar */}
      {uploading && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
          <ExclamationCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Upload Failed</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message with DICOM Tags */}
      {uploadResult && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-start gap-2 mb-3">
            <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">Upload Successful</p>
              <p className="text-sm text-green-600 mt-1">{uploadResult.message}</p>
            </div>
            <button
              onClick={handleViewStudies}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
            >
              View Studies
            </button>
          </div>

          {/* DICOM Metadata */}
          {uploadResult.dicom_metadata && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <DocumentTextIcon className="w-4 h-4" />
                DICOM Metadata
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {uploadResult.dicom_metadata.patient_id && (
                  <div>
                    <span className="text-gray-600">Patient ID:</span>
                    <span className="ml-2 font-medium">{uploadResult.dicom_metadata.patient_id}</span>
                  </div>
                )}
                {uploadResult.dicom_metadata.patient_name && (
                  <div>
                    <span className="text-gray-600">Patient Name:</span>
                    <span className="ml-2 font-medium">{uploadResult.dicom_metadata.patient_name}</span>
                  </div>
                )}
                {uploadResult.dicom_metadata.modality && (
                  <div>
                    <span className="text-gray-600">Modality:</span>
                    <span className="ml-2 font-medium">{uploadResult.dicom_metadata.modality}</span>
                  </div>
                )}
                {uploadResult.dicom_metadata.study_date && (
                  <div>
                    <span className="text-gray-600">Study Date:</span>
                    <span className="ml-2 font-medium">{uploadResult.dicom_metadata.study_date}</span>
                  </div>
                )}
                {uploadResult.dicom_metadata.study_description && (
                  <div className="col-span-2">
                    <span className="text-gray-600">Description:</span>
                    <span className="ml-2 font-medium">{uploadResult.dicom_metadata.study_description}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AWS DICOM Tags */}
          {uploadResult.dicom_tags && Object.keys(uploadResult.dicom_tags).length > 0 && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="text-sm font-medium text-gray-700 mb-2">
                AWS HealthImaging Tags
              </p>
              <div className="max-h-40 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <tbody className="divide-y divide-green-100">
                    {Object.entries(uploadResult.dicom_tags).map(([key, value]) => (
                      value !== null && value !== '' && (
                        <tr key={key}>
                          <td className="py-1 pr-2 text-gray-600 font-mono">{key}</td>
                          <td className="py-1 text-gray-800">{String(value)}</td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-xs text-blue-800">
          <strong>Note:</strong> DICOM tags will be automatically extracted and updated when you upload the file.
          This includes patient information, study details, and AWS HealthImaging compatible tags.
        </p>
      </div>
    </div>
  )
}
