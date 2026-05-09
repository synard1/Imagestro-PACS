import { useState, useEffect, useRef } from 'react'

/**
 * ImagePreview Component
 * Displays preview for regular images (JPG, PNG, GIF, etc.)
 */
export default function ImagePreview({ file, onClose }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!file) return

    const loadImage = async () => {
      try {
        setLoading(true)
        setError(null)

        // Create object URL from file
        let url
        if (file instanceof File || file instanceof Blob) {
          url = URL.createObjectURL(file)
        } else if (file.data) {
          // Base64 data
          url = file.data
        } else {
          throw new Error('Invalid file format')
        }

        setImageUrl(url)
      } catch (err) {
        console.error('Error loading image:', err)
        setError(err.message || 'Failed to load image')
      } finally {
        setLoading(false)
      }
    }

    loadImage()

    // Cleanup
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [file])

  // Open image in new tab
  const openInNewTab = () => {
    if (imageUrl) {
      window.open(imageUrl, '_blank')
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50">
          <h2 className="text-xl font-semibold text-slate-800">
            Image Preview - {file?.name || file?.filename || 'Image'}
          </h2>
          <div className="flex items-center gap-2">
            {/* Open in New Tab Button */}
            <button
              onClick={openInNewTab}
              disabled={!imageUrl}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Open in new tab (full size)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
              aria-label="Close preview"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 bg-slate-900 flex items-center justify-center">
          {loading && (
            <div className="text-white text-center">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p>Loading image...</p>
            </div>
          )}

          {error && (
            <div className="text-center text-red-400">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-medium">{error}</p>
            </div>
          )}

          {imageUrl && !loading && !error && (
            <img
              src={imageUrl}
              alt={file?.name || file?.filename}
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-slate-50 flex justify-between items-center">
          <div className="text-sm text-slate-600">
            {file?.size && (
              <span>Size: {(file.size / 1024).toFixed(2)} KB</span>
            )}
            {file?.file_size && (
              <span>Size: {(file.file_size / 1024).toFixed(2)} KB</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
