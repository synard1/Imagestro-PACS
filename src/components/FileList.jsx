import { useState } from 'react'
import { uploadService } from '../services/uploadService'
import DicomPreview from './DicomPreview'
import DicomTagsPreview from './DicomTagsPreview'
import ImagePreview from './ImagePreview'
import PDFPreview from './PDFPreview'

/**
 * File type icons mapping
 */
const FILE_ICONS = {
  // Images
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'image/gif': '🖼️',
  'image/webp': '🖼️',
  'image/svg+xml': '🎨',

  // Documents
  'application/pdf': '📄',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'text/plain': '📃',

  // DICOM
  'application/dicom': '🏥',
  'image/dicom+jpeg': '🏥',
  'image/dicom+rle': '🏥',

  // Default
  'default': '📎'
}

/**
 * File category configurations
 */
const FILE_CATEGORIES = {
  'exam_result': {
    label: 'Exam Result',
    color: 'bg-blue-100 text-blue-700',
    icon: '🔬'
  },
  'lab_result': {
    label: 'Lab Result',
    color: 'bg-green-100 text-green-700',
    icon: '⚗️'
  },
  'report': {
    label: 'Report',
    color: 'bg-purple-100 text-purple-700',
    icon: '📋'
  },
  'consent_form': {
    label: 'Consent Form',
    color: 'bg-amber-100 text-amber-700',
    icon: '✍️'
  },
  'other': {
    label: 'Other',
    color: 'bg-slate-100 text-slate-700',
    icon: '📁'
  }
}

/**
 * FileList Component
 * Display and manage attached files with download/delete functionality
 */
export default function FileList({
  orderId,
  files = [],
  onRefresh,
  readOnly = false,
  showCategory = true,
  showDescription = true,
  compact = false,
  className = ''
}) {
  const [deleting, setDeleting] = useState(null)
  const [editingDescription, setEditingDescription] = useState(null)
  const [newDescription, setNewDescription] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [previewType, setPreviewType] = useState(null) // 'dicom', 'dicom-tags', 'image', 'pdf'
  const [loadingPreview, setLoadingPreview] = useState(false)

  console.log('[FileList] Rendering with props:', { orderId, files, readOnly, showCategory, showDescription, compact })

  /**
   * Handle file download
   */
  const handleDownload = async (file) => {
    try {
      await uploadService.downloadFile(orderId, file.file_id, file.filename)
    } catch (error) {
      console.error('[FileList] Download failed:', error)
    }
  }

  /**
   * Handle file deletion
   */
  const handleDelete = async (file) => {
    const confirmMsg = `Are you sure you want to delete "${file.filename}"?\n\nThis action cannot be undone.`

    if (!confirm(confirmMsg)) {
      return
    }

    setDeleting(file.file_id)

    try {
      await uploadService.deleteFile(orderId, file.file_id)

      // Refresh file list
      if (onRefresh) {
        onRefresh()
      }

    } catch (error) {
      console.error('[FileList] Delete failed:', error)
    } finally {
      setDeleting(null)
    }
  }

  /**
   * Handle description edit
   */
  const handleEditDescription = (file) => {
    setEditingDescription(file.file_id)
    setNewDescription(file.description || '')
  }

  /**
   * Handle description save
   */
  const handleSaveDescription = async (file) => {
    try {
      await uploadService.updateFileMetadata(orderId, file.file_id, {
        description: newDescription
      })

      setEditingDescription(null)
      setNewDescription('')

      // Refresh file list
      if (onRefresh) {
        onRefresh()
      }

    } catch (error) {
      console.error('[FileList] Update description failed:', error)
    }
  }

  /**
   * Handle description cancel
   */
  const handleCancelEdit = () => {
    setEditingDescription(null)
    setNewDescription('')
  }

  /**
   * Get file icon
   */
  const getFileIcon = (mimeType) => {
    return FILE_ICONS[mimeType] || FILE_ICONS.default
  }

  /**
   * Get category config
   */
  const getCategoryConfig = (category) => {
    return FILE_CATEGORIES[category] || FILE_CATEGORIES.other
  }

  /**
   * Format file size
   */
  const formatFileSize = (bytes) => {
    return uploadService.formatFileSize(bytes)
  }

  /**
   * Format date
   */
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  /**
   * Check if file is DICOM
   */
  const isDicomFile = (file) => {
    const name = file.filename.toLowerCase()
    return name.endsWith('.dcm') ||
           name.endsWith('.dicom') ||
           file.file_type === 'application/dicom' ||
           file.file_type === 'image/dicom+jpeg' ||
           file.file_type === 'image/dicom+rle'
  }

  /**
   * Check if file is regular image
   */
  const isImageFile = (file) => {
    const name = file.filename.toLowerCase()
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    return imageExtensions.some(ext => name.endsWith(ext)) ||
           (file.file_type && file.file_type.startsWith('image/') && !file.file_type.includes('dicom'))
  }

  /**
   * Check if file is PDF
   */
  const isPDFFile = (file) => {
    const name = file.filename.toLowerCase()
    return name.endsWith('.pdf') || file.file_type === 'application/pdf'
  }

  /**
   * Check if file can be previewed
   */
  const canPreview = (file) => {
    return isDicomFile(file) || isImageFile(file) || isPDFFile(file)
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
      } else if (isImageFile(file)) {
        type = 'image'
      } else if (isPDFFile(file)) {
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
          console.error('[FileList] Fetch failed:', fetchError)
          throw new Error('Failed to fetch file content for preview')
        }
      }
    } catch (error) {
      console.error('[FileList] Preview failed:', error)
      alert(`Failed to preview file: ${error.message}`)
      setPreviewType(null)
      setPreviewFile(null)
    } finally {
      setLoadingPreview(false)
    }
  }

  /**
   * Close preview
   */
  const closePreview = () => {
    setPreviewFile(null)
    setPreviewType(null)
  }

  // Empty state
  if (files.length === 0) {
    return (
      <div className={`text-center py-8 text-slate-500 text-sm ${className}`}>
        <div className="flex flex-col items-center gap-2">
          <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p>No attachments yet</p>
        </div>
      </div>
    )
  }

  // Compact view
  if (compact) {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {files.map(file => {
          const icon = getFileIcon(file.file_type)

          return (
            <button
              key={file.file_id}
              onClick={() => handleDownload(file)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition"
              title={file.filename}
            >
              <span className="text-lg">{icon}</span>
              <span className="truncate max-w-[150px]">{file.filename}</span>
              <span className="text-xs text-slate-500">{formatFileSize(file.file_size)}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // Full view
  return (
    <div className={`space-y-2 ${className}`}>
      {files.map(file => {
        const icon = getFileIcon(file.file_type)
        const category = getCategoryConfig(file.category)
        const isEditing = editingDescription === file.file_id

        return (
          <div
            key={file.file_id}
            className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition group"
          >
            {/* File Icon */}
            <span className="text-2xl flex-shrink-0">{icon}</span>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              {/* Filename */}
              <div className="font-medium text-sm truncate text-slate-800">
                {file.filename}
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                <span>{formatFileSize(file.file_size)}</span>
                <span>•</span>
                <span>{formatDate(file.uploaded_at)}</span>

                {file.uploaded_by && file.uploaded_by !== 'current_user' && (
                  <>
                    <span>•</span>
                    <span>by {file.uploaded_by}</span>
                  </>
                )}

                {file._local && (
                  <>
                    <span>•</span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      📱 Local
                    </span>
                  </>
                )}
              </div>

              {/* Description */}
              {showDescription && (
                <div className="mt-2">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="Add description..."
                        className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveDescription(file)}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {file.description ? (
                        <p className="text-xs text-slate-600 italic">{file.description}</p>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No description</p>
                      )}

                      {!readOnly && (
                        <button
                          onClick={() => handleEditDescription(file)}
                          className="text-xs text-blue-600 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Category Badge */}
            {showCategory && (
              <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${category.color}`}>
                {category.icon} {category.label}
              </span>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* SatuSehat indicator only (no per-file send button here). Send control moved to Orders list. */}
              {(isDicomFile(file) || isImageFile(file)) && (
                <div className="flex items-center gap-2">
                  {file.satusehat?.status === 'sent' ? (
                    <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">SatuSehat ✓</span>
                  ) : file.satusehat?.status === 'pending' ? (
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-medium">SatuSehat Pending</span>
                  ) : file.satusehat?.status === 'failed' ? (
                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">SatuSehat Failed</span>
                  ) : file.satusehat?.status === 'cancelled' ? (
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-slate-700 text-xs font-medium">SatuSehat Cancelled</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">SatuSehat -</span>
                  )}
                </div>
              )}
              {/* Preview Buttons */}
              {isDicomFile(file) && (
                <>
                  {/* Preview Image Button for DICOM */}
                  <button
                    onClick={() => handlePreview(file, 'full')}
                    disabled={loadingPreview}
                    className="px-2 py-1 rounded border border-blue-300 bg-blue-50 text-xs hover:bg-blue-100 hover:shadow-sm transition disabled:opacity-50 flex items-center gap-1"
                    title="Preview DICOM Image"
                  >
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-blue-700 font-medium">Image</span>
                  </button>

                  {/* Preview Tags Button for DICOM */}
                  <button
                    onClick={() => handlePreview(file, 'tags')}
                    disabled={loadingPreview}
                    className="px-2 py-1 rounded border border-purple-300 bg-purple-50 text-xs hover:bg-purple-100 hover:shadow-sm transition disabled:opacity-50 flex items-center gap-1"
                    title="Preview DICOM Tags"
                  >
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <span className="text-purple-700 font-medium">Tags</span>
                  </button>
                </>
              )}

              {/* Preview Button for Images and PDFs */}
              {!isDicomFile(file) && canPreview(file) && (
                <button
                  onClick={() => handlePreview(file)}
                  disabled={loadingPreview}
                  className="px-2 py-1 rounded border border-blue-300 bg-blue-50 text-xs hover:bg-blue-100 hover:shadow-sm transition disabled:opacity-50 flex items-center gap-1"
                  title="Preview file"
                >
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span className="text-blue-700 font-medium">Preview</span>
                </button>
              )}

              {/* Download Button */}
              <button
                onClick={() => handleDownload(file)}
                className="px-3 py-1 rounded border border-slate-300 text-sm hover:bg-white hover:shadow-sm transition"
                title="Download file"
              >
                ⬇️
              </button>

              {/* Delete Button */}
              {!readOnly && (
                <button
                  onClick={() => handleDelete(file)}
                  disabled={deleting === file.file_id}
                  className="px-3 py-1 rounded border border-red-300 text-red-600 text-sm hover:bg-red-50 hover:shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete file"
                >
                  {deleting === file.file_id ? (
                    <span className="inline-block animate-spin">⏳</span>
                  ) : (
                    '🗑️'
                  )}
                </button>
              )}
            </div>
          </div>
        )
      })}

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

/**
 * FileListStats Component
 * Display summary statistics for files
 */
export function FileListStats({ files = [] }) {
  if (files.length === 0) {
    return null
  }

  const totalSize = files.reduce((sum, file) => sum + (file.file_size || 0), 0)

  const byCategory = files.reduce((acc, file) => {
    const cat = file.category || 'other'
    acc[cat] = (acc[cat] || 0) + 1
    return acc
  }, {})

  const maxFiles = uploadService.maxFilesPerOrder
  const percentageFull = (files.length / maxFiles) * 100
  const isNearLimit = percentageFull >= 80
  const isAtLimit = files.length >= maxFiles

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <div className={`flex items-center gap-1 ${isAtLimit ? 'text-red-600 font-semibold' : isNearLimit ? 'text-orange-600' : ''}`}>
        <span className="font-medium">{files.length}</span>
        <span>/</span>
        <span className="font-medium">{maxFiles}</span>
        <span>file{files.length !== 1 ? 's' : ''}</span>
        {isAtLimit && (
          <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
            LIMIT REACHED
          </span>
        )}
        {isNearLimit && !isAtLimit && (
          <span className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
            {Math.round(percentageFull)}% full
          </span>
        )}
      </div>

      <span>•</span>

      <div className="flex items-center gap-1">
        <span className="font-medium">{uploadService.formatFileSize(totalSize)}</span>
        <span>total</span>
      </div>

      {Object.entries(byCategory).map(([cat, count]) => {
        const config = FILE_CATEGORIES[cat] || FILE_CATEGORIES.other
        return (
          <div key={cat} className="flex items-center gap-1">
            <span>•</span>
            <span className={`px-2 py-0.5 rounded ${config.color}`}>
              {config.icon} {count}
            </span>
          </div>
        )
      })}
    </div>
  )
}
