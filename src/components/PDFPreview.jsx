import { useState, useEffect, useRef } from 'react'

/**
 * PDFPreview Component
 * Displays preview for PDF files using iframe
 */
export default function PDFPreview({ file, onClose }) {
  const [pdfUrl, setPdfUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!file) return

    const loadPDF = async () => {
      try {
        setLoading(true)
        setError(null)

        // Create object URL from file
        let url
        if (file instanceof File || file instanceof Blob) {
          url = URL.createObjectURL(file)
        } else if (file.data) {
          // Base64 data - convert to blob
          const response = await fetch(file.data)
          const blob = await response.blob()
          url = URL.createObjectURL(blob)
        } else {
          throw new Error('Invalid file format')
        }

        setPdfUrl(url)
        setLoading(false)
      } catch (err) {
        console.error('Error loading PDF:', err)
        setError(err.message || 'Failed to load PDF')
        setLoading(false)
      }
    }

    loadPDF()

    // Cleanup
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
      }
    }
  }, [file])

  // Open PDF in new tab
  const openInNewTab = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank')
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50">
          <h2 className="text-xl font-semibold text-slate-800">
            PDF Preview - {file?.name || file?.filename || 'Document'}
          </h2>
          <div className="flex items-center gap-2">
            {/* Open in New Tab Button */}
            <button
              onClick={openInNewTab}
              disabled={!pdfUrl}
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
        <div className="flex-1 overflow-hidden bg-slate-100">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">Loading PDF...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-red-600">
                <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-medium">{error}</p>
              </div>
            </div>
          )}

          {pdfUrl && !loading && !error && (
            <iframe
              src={pdfUrl}
              className="w-full h-full"
              title="PDF Preview"
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
