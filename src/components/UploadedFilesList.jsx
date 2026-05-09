import { useState, useEffect } from 'react'
import { uploadService } from '../services/uploadService'
import DicomPreview from './DicomPreview'
import DicomTagsPreview from './DicomTagsPreview'
import ImagePreview from './ImagePreview'
import PDFPreview from './PDFPreview'

/**
 * UploadedFilesList Component
 * Displays list of uploaded files with preview capability for DICOM files
 */
export default function UploadedFilesList({ orderId, onDelete, onRefresh }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewType, setPreviewType] = useState(null) // 'dicom', 'image', 'pdf'
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Load files on mount and when orderId changes
  useEffect(() => {
    loadFiles()
  }, [orderId])

  const loadFiles = async () => {
    if (!orderId) return

    try {
      setLoading(true)
      const orderFiles = await uploadService.getOrderFiles(orderId)
      setFiles(orderFiles)
    } catch (error) {
      console.error('[UploadedFilesList] Failed to load files:', error)
    } finally {
      setLoading(false)
    }
  }

  // Check if file is DICOM
  const isDicomFile = (file) => {
    const name = file.filename.toLowerCase()
    return name.endsWith('.dcm') ||
           name.endsWith('.dicom') ||
           file.file_type === 'application/dicom'
  }

  // Check if file is regular image
  const isImageFile = (file) => {
    const name = file.filename.toLowerCase()
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    return imageExtensions.some(ext => name.endsWith(ext)) ||
           (file.file_type && file.file_type.startsWith('image/') && !file.file_type.includes('dicom'))
  }

  // Check if file is PDF
  const isPDFFile = (file) => {
    const name = file.filename.toLowerCase()
    return name.endsWith('.pdf') || file.file_type === 'application/pdf'
  }

  // Check if file can be previewed
  const canPreview = (file) => {
    return isDicomFile(file) || isImageFile(file) || isPDFFile(file)
  }

  // Get preview type
  const getPreviewType = (file) => {
    if (isDicomFile(file)) return 'dicom'
    if (isImageFile(file)) return 'image'
    if (isPDFFile(file)) return 'pdf'
    return null
  }

  /**
   * Handle preview file
   */
  const handlePreview = async (file, mode = 'full') => {
    try {
      setLoadingPreview(true)

      // Determine preview type
      let type
      if (isDicomFile(file)) {
        type = mode === 'tags' ? 'dicom-tags' : 'dicom'
      } else if (file.file_type?.startsWith('image/')) {
        type = 'image'
      } else if (file.file_type === 'application/pdf') {
        type = 'pdf'
      } else {
        throw new Error('File type not supported for preview')
      }

      setPreviewType(type)

      // If file is stored locally (has data field)
      if (file._local && file.data) {
        // For local files, we can use the file object directly or data URL
        if (type === 'image' || type === 'pdf') {
          // Pass the file object with data for direct rendering
          setPreviewFile({ ...file, isLocal: true })
        } else {
          // For DICOM, convert base64 to File object
          const blob = uploadService.base64ToBlob(file.data)
          const fileObj = new File([blob], file.filename, { type: file.file_type })
          setPreviewFile(fileObj)
        }
      } else {
        // File is on server, need to fetch it using the correct endpoint
        // According to order-files.md, we should use: GET /orders/{identifier}/files/{file_id}/content
        try {
          const blob = await uploadService.fetchFileContent(orderId, file.file_id)
          // Use blob's type from server response if available, fallback to metadata
          const fileType = blob.type || file.file_type || 'application/octet-stream'
          const fileObj = new File([blob], file.filename, { type: fileType })
          setPreviewFile(fileObj)
        } catch (fetchError) {
          console.error('[UploadedFilesList] Fetch failed:', fetchError)
          throw new Error('Failed to fetch file content for preview')
        }
      }
    } catch (error) {
      console.error('[UploadedFilesList] Preview failed:', error)
      alert(`Failed to preview file: ${error.message}`)
      setPreviewType(null)
      setPreviewFile(null)
    } finally {
      setLoadingPreview(false)
    }
  }

  // Close preview
  const closePreview = () => {
    setPreviewFile(null)
    setPreviewType(null)
  }

  // Handle delete file
  const handleDelete = async (file) => {
    if (!confirm(`Are you sure you want to delete "${file.filename}"?`)) {
      return
    }

    try {
      await uploadService.deleteFile(orderId, file.file_id)

      // Refresh list
      await loadFiles()

      // Notify parent
      if (onDelete) {
        onDelete(file)
      }
      if (onRefresh) {
        onRefresh()
      }
    } catch (error) {
      console.error('[UploadedFilesList] Delete failed:', error)
      alert(`Failed to delete file: ${error.message}`)
    }
  }

  // Handle download file
  const handleDownload = async (file) => {
    try {
      await uploadService.downloadFile(orderId, file.file_id, file.filename)
    } catch (error) {
      console.error('[UploadedFilesList] Download failed:', error)
    }
  }

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Get file icon
  const getFileIcon = (file) => {
    if (isDicomFile(file)) {
      return (
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )
    }

    if (file.file_type?.startsWith('image/')) {
      return (
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )
    }

    if (file.file_type === 'application/pdf') {
      return (
        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
      )
    }

    return (
      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
        <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-slate-600">Loading files...</p>
        </div>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="font-medium">No files uploaded yet</p>
        <p className="text-sm mt-1">Upload files using the uploader above</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          Uploaded Files ({files.length})
        </h3>
        <button
          onClick={loadFiles}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {files.map((file) => (
          <div
            key={file.file_id}
            className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
          >
            {/* File Icon */}
            <div className="flex-shrink-0">
              {getFileIcon(file)}
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">
                {file.filename}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                <span>{uploadService.formatFileSize(file.file_size)}</span>
                <span>•</span>
                <span>{formatDate(file.uploaded_at)}</span>
                {file._local && (
                  <>
                    <span>•</span>
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                      Local
                    </span>
                  </>
                )}
              </div>
              {file.category && file.category !== 'other' && (
                <div className="mt-1">
                  <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                    {file.category.replace('_', ' ')}
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 flex items-center gap-2">
              {/* For DICOM files, show 2 buttons */}
              {isDicomFile(file) && (
                <>
                  <button
                    onClick={() => handlePreview(file, 'full')}
                    disabled={loadingPreview}
                    className="px-2 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 flex items-center gap-1"
                    title="Preview DICOM Image"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Image
                  </button>
                  <button
                    onClick={() => handlePreview(file, 'tags')}
                    disabled={loadingPreview}
                    className="px-2 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50 flex items-center gap-1"
                    title="Preview DICOM Tags"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Tags
                  </button>
                </>
              )}

              {/* For other files (images, PDF), show single preview button */}
              {!isDicomFile(file) && canPreview(file) && (
                <button
                  onClick={() => handlePreview(file)}
                  disabled={loadingPreview}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 flex items-center gap-1"
                  title={`Preview ${getPreviewType(file)?.toUpperCase()}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Preview
                </button>
              )}

              <button
                onClick={() => handleDownload(file)}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Download file"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>

              <button
                onClick={() => handleDelete(file)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete file"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modals */}
      {previewFile && previewType === 'dicom' && (
        <DicomPreview
          file={previewFile}
          onClose={closePreview}
        />
      )}

      {previewFile && previewType === 'dicom-tags' && (
        <DicomTagsPreview
          file={previewFile}
          onClose={closePreview}
        />
      )}

      {previewFile && previewType === 'image' && (
        <ImagePreview
          file={previewFile}
          onClose={closePreview}
        />
      )}

      {previewFile && previewType === 'pdf' && (
        <PDFPreview
          file={previewFile}
          onClose={closePreview}
        />
      )}
    </div>
  )
}
