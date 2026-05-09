import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { uploadService } from '../services/uploadService'
import DicomPreview from './DicomPreview'
import DicomTagsPreview from './DicomTagsPreview'
import ImagePreview from './ImagePreview'
import PDFPreview from './PDFPreview'

/**
 * FileUploader Component
 * Drag-and-drop file uploader for exam results and attachments
 * Supports multiple files, validation, and progress tracking
 */
export default function FileUploader({
  orderId,
  category = 'other',
  accept = {},
  maxSize,
  maxFiles,
  disabled = false,
  onUploadStart,
  onUploadProgress,
  onUploadComplete,
  onUploadError,
  className = ''
}) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentFile, setCurrentFile] = useState(null)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewFile, setPreviewFile] = useState(null)
  const [previewType, setPreviewType] = useState(null) // 'dicom', 'image', 'pdf'

  // Use service defaults if not provided
  const effectiveMaxSize = maxSize || uploadService.maxFileSize
  const effectiveMaxFiles = maxFiles || uploadService.maxFilesPerUpload

  // Handle file drop
  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    // Handle rejected files
    if (rejectedFiles.length > 0) {
      const errors = rejectedFiles.map(({ file, errors }) => {
        const errorMessages = errors.map(e => {
          if (e.code === 'file-too-large') {
            return `File "${file.name}" is too large (max: ${uploadService.formatFileSize(effectiveMaxSize)})`
          }
          if (e.code === 'file-invalid-type') {
            return `File "${file.name}" has invalid type`
          }
          return e.message
        })
        return errorMessages.join(', ')
      })

      if (onUploadError) {
        onUploadError({ errors })
      }
      return
    }

    // No files to upload
    if (acceptedFiles.length === 0) {
      return
    }

    // Add files to selected list
    setSelectedFiles(prev => [...prev, ...acceptedFiles.map((file, idx) => ({
      id: Date.now() + idx,
      file
    }))])

  }, [effectiveMaxSize, onUploadError])

  // Check if file is DICOM
  const isDicomFile = (file) => {
    const name = file.name.toLowerCase()
    return name.endsWith('.dcm') ||
           name.endsWith('.dicom') ||
           file.type === 'application/dicom'
  }

  // Check if file is regular image
  const isImageFile = (file) => {
    const name = file.name.toLowerCase()
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    return imageExtensions.some(ext => name.endsWith(ext)) ||
           (file.type && file.type.startsWith('image/') && !file.type.includes('dicom'))
  }

  // Check if file is PDF
  const isPDFFile = (file) => {
    const name = file.name.toLowerCase()
    return name.endsWith('.pdf') || file.type === 'application/pdf'
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

  // Handle preview
  const handlePreview = (file) => {
    const type = getPreviewType(file)
    if (!type) return

    setPreviewType(type)
    setPreviewFile(file)
  }

  // Close preview
  const closePreview = () => {
    setPreviewFile(null)
    setPreviewType(null)
  }

  // Remove file from selected list
  const removeFile = (id) => {
    setSelectedFiles(prev => prev.filter(item => item.id !== id))
  }

  // Handle upload of selected files
  const handleUpload = async () => {
    if (selectedFiles.length === 0) return

    // Check if orderId is provided
    if (!orderId) {
      console.error('[FileUploader] No orderId provided')
      if (onUploadError) {
        onUploadError({ errors: ['Order ID is required'] })
      }
      return
    }

    // Start upload
    setUploading(true)
    setProgress(0)

    const filesToUpload = selectedFiles.map(item => item.file)

    if (onUploadStart) {
      onUploadStart(filesToUpload)
    }

    try {
      const totalFiles = filesToUpload.length
      const results = []
      const errors = []

      // Upload files one by one
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i]
        setCurrentFile(file.name)

        try {
          const result = await uploadService.uploadToOrder(orderId, file, {
            category,
            description: ''
          })

          results.push(result)

          // Update progress
          const currentProgress = Math.round(((i + 1) / totalFiles) * 100)
          setProgress(currentProgress)

          if (onUploadProgress) {
            onUploadProgress({
              loaded: i + 1,
              total: totalFiles,
              percent: currentProgress,
              currentFile: file.name
            })
          }

        } catch (error) {
          console.error('[FileUploader] Upload error for file:', file.name, error)
          errors.push({
            filename: file.name,
            error: error.message
          })
        }
      }

      // Upload complete
      if (onUploadComplete) {
        onUploadComplete({ results, errors })
      }

      // Only clear selected files if there were no errors
      if (errors.length === 0) {
        setSelectedFiles([])
      } else {
        // If there were errors, we should not clear the selected files
        // so the user can see which files failed and try again
        console.error('[FileUploader] Upload completed with errors:', errors)
      }

    } catch (error) {
      console.error('[FileUploader] Upload failed:', error)

      if (onUploadError) {
        onUploadError({ errors: [error.message] })
      }

    } finally {
      setUploading(false)
      setProgress(0)
      setCurrentFile(null)
    }
  }

  // Setup dropzone
  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject
  } = useDropzone({
    onDrop,
    accept,
    maxSize: effectiveMaxSize,
    maxFiles: effectiveMaxFiles,
    disabled: disabled || uploading,
    multiple: effectiveMaxFiles !== 1
  })

  return (
    <div className={className}>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragActive && !isDragReject ? 'border-blue-500 bg-blue-50 scale-[1.02]' : ''}
          ${isDragReject ? 'border-red-500 bg-red-50' : ''}
          ${!isDragActive && !isDragReject ? 'border-slate-300 hover:border-blue-400 hover:bg-slate-50' : ''}
          ${uploading ? 'opacity-50 pointer-events-none' : ''}
          ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-3">
          {/* Upload Icon */}
          {uploading ? (
            <div className="relative">
              <svg className="w-12 h-12 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-ping" />
              </div>
            </div>
          ) : (
            <svg
              className={`w-12 h-12 ${isDragActive ? 'text-blue-500' : 'text-slate-400'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          )}

          {/* Upload Status */}
          {uploading ? (
            <div className="w-full max-w-md">
              <p className="text-sm font-medium text-slate-700 mb-2">
                Uploading {currentFile}...
              </p>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="text-xs text-slate-500 mt-1">
                {progress}% complete
              </p>
            </div>
          ) : (
            <>
              {/* Instructions */}
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  {isDragActive
                    ? isDragReject
                      ? '❌ File type not accepted'
                      : '📁 Drop files here...'
                    : '📤 Drag files here or click to browse'}
                </p>

                {!isDragActive && (
                  <div className="text-xs text-slate-500 space-y-1">
                    <p>
                      Maximum file size: {uploadService.formatFileSize(effectiveMaxSize)}
                    </p>
                    {effectiveMaxFiles && (
                      <p>
                        Maximum {effectiveMaxFiles} file{effectiveMaxFiles > 1 ? 's' : ''}
                      </p>
                    )}

                    {/* Show accepted file types */}
                    {Object.keys(accept).length > 0 && (
                      <p className="mt-2">
                        Accepted:{' '}
                        {Object.keys(accept)
                          .map(type => {
                            const extensions = accept[type]
                            if (Array.isArray(extensions) && extensions.length > 0) {
                              return extensions.join(', ')
                            }
                            return type
                          })
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Category Badge */}
              {category && category !== 'other' && !isDragActive && (
                <div className="mt-2">
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    Category: {category.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Additional Info */}
      {!uploading && !disabled && selectedFiles.length === 0 && (
        <div className="mt-3 text-xs text-slate-500 text-center">
          💡 Tip: You can drag multiple files at once
        </div>
      )}

      {/* Selected Files List */}
      {selectedFiles.length > 0 && !uploading && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              Selected Files ({selectedFiles.length})
            </h3>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-xs text-red-600 hover:text-red-700 font-medium"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {selectedFiles.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
              >
                {/* File Icon */}
                <div className="flex-shrink-0">
                  {isDicomFile(item.file) ? (
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  ) : isImageFile(item.file) ? (
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  ) : isPDFFile(item.file) ? (
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 01-.293-.707l-5.414-5.414A1 1 0 0112.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {uploadService.formatFileSize(item.file.size)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  {canPreview(item.file) && (
                    <button
                      onClick={() => handlePreview(item.file)}
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1"
                      title={`Preview ${getPreviewType(item.file)?.toUpperCase()}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Preview
                    </button>
                  )}
                  <button
                    onClick={() => removeFile(item.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove file"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Upload Button */}
          <div className="pt-2">
            <button
              onClick={handleUpload}
              disabled={!orderId}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''}
            </button>
            {!orderId && (
              <p className="text-xs text-red-600 mt-2 text-center">
                Order ID is required to upload files
              </p>
            )}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && previewType === 'dicom' && (
        <DicomPreview
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
