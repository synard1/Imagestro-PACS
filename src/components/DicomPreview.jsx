import { useEffect, useRef, useState } from 'react'
import * as dicomParser from 'dicom-parser'
import * as cornerstone from '@cornerstonejs/core'
import * as cornerstoneTools from '@cornerstonejs/tools'
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader'

/**
 * DicomPreview Component
 * Displays DICOM image preview and metadata tags using Cornerstone.js
 */
export default function DicomPreview({ file, onClose }) {
  const viewportRef = useRef(null)
  const [tags, setTags] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [imageUrl, setImageUrl] = useState(null)
  const renderingEngineRef = useRef(null)
  const viewportIdRef = useRef(`viewport-${Date.now()}`)
  const dicomBlobUrlRef = useRef(null)

  // Initialize Cornerstone
  useEffect(() => {
    const initCornerstone = async () => {
      try {
        // Initialize cornerstone core (only if not already initialized)
        try {
          await cornerstone.init()
        } catch (e) {
          // Already initialized, that's fine
          console.log('Cornerstone already initialized')
        }

        // Configure DICOM Image Loader
        cornerstoneDICOMImageLoader.external.cornerstone = cornerstone
        cornerstoneDICOMImageLoader.external.dicomParser = dicomParser

        // Configure webWorkers
        try {
          const config = {
            maxWebWorkers: 1,
            startWebWorkersOnDemand: true,
            taskConfiguration: {
              decodeTask: {
                initializeCodecsOnStartup: false,
              },
            },
          }
          cornerstoneDICOMImageLoader.webWorkerManager.initialize(config)
        } catch (e) {
          // Web workers might be already initialized
          console.log('Web workers already initialized')
        }

        setInitialized(true)
      } catch (err) {
        console.error('Failed to initialize Cornerstone:', err)
        setError(`Failed to initialize DICOM viewer: ${err.message}`)
      }
    }

    initCornerstone()

    // Cleanup
    return () => {
      if (renderingEngineRef.current) {
        try {
          renderingEngineRef.current.destroy()
        } catch (e) {
          console.error('Error destroying rendering engine:', e)
        }
      }
    }
  }, [])

  useEffect(() => {
    if (!file || !initialized || !viewportRef.current) return

    const loadAndDisplayDicom = async () => {
      try {
        setLoading(true)
        setError(null)

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer()
        const byteArray = new Uint8Array(arrayBuffer)

        // Parse DICOM file for tags
        let dataSet
        try {
          dataSet = dicomParser.parseDicom(byteArray)
        } catch (e) {
          throw new Error('Invalid DICOM file')
        }

        // Extract important tags
        const extractedTags = extractDicomTags(dataSet)
        setTags(extractedTags)

        // Create blob URL for the DICOM file (for cornerstone rendering)
        const blob = new Blob([byteArray], { type: 'application/dicom' })
        const blobUrl = URL.createObjectURL(blob)
        dicomBlobUrlRef.current = blobUrl
        const imageId = `wadouri:${blobUrl}`

        // Create rendering engine
        const renderingEngineId = `engine-${Date.now()}`
        const renderingEngine = new cornerstone.RenderingEngine(renderingEngineId)
        renderingEngineRef.current = renderingEngine

        // Enable the viewport
        const viewportInput = {
          viewportId: viewportIdRef.current,
          type: cornerstone.Enums.ViewportType.STACK,
          element: viewportRef.current,
        }

        renderingEngine.enableElement(viewportInput)

        // Get the viewport
        const viewport = renderingEngine.getViewport(viewportIdRef.current)

        // Set the stack with the single image
        await viewport.setStack([imageId], 0)

        // Render
        viewport.render()

        // Convert to PNG blob for "Open in New Tab" feature at full resolution
        // Wait for rendering to complete
        setTimeout(async () => {
          try {
            // Load the image to get pixel data and dimensions
            const image = await cornerstone.imageLoader.loadImage(imageId)

            // Create canvas at native DICOM resolution
            const fullCanvas = document.createElement('canvas')
            fullCanvas.width = image.width
            fullCanvas.height = image.height
            const ctx = fullCanvas.getContext('2d')

            // Get pixel data from the image
            const pixelData = image.getPixelData()

            // Create ImageData for canvas
            const imageData = ctx.createImageData(image.width, image.height)
            const data = imageData.data

            // Get min/max pixel values for normalization
            let minPixel = Infinity
            let maxPixel = -Infinity
            for (let i = 0; i < pixelData.length; i++) {
              if (pixelData[i] < minPixel) minPixel = pixelData[i]
              if (pixelData[i] > maxPixel) maxPixel = pixelData[i]
            }

            const range = maxPixel - minPixel || 1

            // Convert pixel data to RGBA (normalize to 0-255)
            for (let i = 0; i < pixelData.length; i++) {
              const normalized = ((pixelData[i] - minPixel) / range) * 255
              const idx = i * 4

              // Grayscale: set R, G, B to same value
              data[idx] = normalized     // R
              data[idx + 1] = normalized // G
              data[idx + 2] = normalized // B
              data[idx + 3] = 255        // A (fully opaque)
            }

            // Put image data on canvas
            ctx.putImageData(imageData, 0, 0)

            // Convert to PNG blob
            fullCanvas.toBlob((pngBlob) => {
              if (pngBlob) {
                const pngUrl = URL.createObjectURL(pngBlob)
                setImageUrl(pngUrl)
              }
            }, 'image/png', 1.0)

          } catch (err) {
            console.error('Error creating full-size export:', err)
            // Fallback: use viewport canvas as-is
            const canvas = viewportRef.current?.querySelector('canvas')
            if (canvas) {
              canvas.toBlob((pngBlob) => {
                if (pngBlob) {
                  const pngUrl = URL.createObjectURL(pngBlob)
                  setImageUrl(pngUrl)
                }
              }, 'image/png')
            }
          }
        }, 800)

      } catch (err) {
        console.error('Error loading DICOM:', err)
        setError(err.message || 'Failed to load DICOM file')
      } finally {
        setLoading(false)
      }
    }

    loadAndDisplayDicom()

    // Cleanup blob URLs on unmount
    return () => {
      if (dicomBlobUrlRef.current) {
        URL.revokeObjectURL(dicomBlobUrlRef.current)
      }
    }
  }, [file, initialized])

  // Cleanup PNG blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [imageUrl])

  // Open DICOM file in new tab
  const openInNewTab = () => {
    if (imageUrl) {
      window.open(imageUrl, '_blank')
    }
  }

  // Extract important DICOM tags
  const extractDicomTags = (dataSet) => {
    const tags = {}

    // Helper to safely get string value
    const getString = (tag) => {
      try {
        return dataSet.string(tag) || 'N/A'
      } catch {
        return 'N/A'
      }
    }

    // Helper to safely get number value
    const getNumber = (tag) => {
      try {
        const value = dataSet.string(tag)
        return value || 'N/A'
      } catch {
        return 'N/A'
      }
    }

    // Patient Information
    tags.patientName = getString('x00100010')
    tags.patientID = getString('x00100020')
    tags.patientBirthDate = formatDate(getString('x00100030'))
    tags.patientSex = getString('x00100040')

    // Study Information
    tags.studyDate = formatDate(getString('x00080020'))
    tags.studyTime = formatTime(getString('x00080030'))
    tags.studyDescription = getString('x00081030')
    tags.studyInstanceUID = getString('x0020000d')

    // Series Information
    tags.seriesDescription = getString('x0008103e')
    tags.seriesNumber = getNumber('x00200011')
    tags.seriesInstanceUID = getString('x0020000e')

    // Image Information
    tags.instanceNumber = getNumber('x00200013')
    tags.modality = getString('x00080060')
    tags.sopInstanceUID = getString('x00080018')

    // Acquisition Information
    tags.rows = getNumber('x00280010')
    tags.columns = getNumber('x00280011')
    tags.sliceThickness = getNumber('x00180050')
    tags.pixelSpacing = getString('x00280030')

    // Institution
    tags.institutionName = getString('x00080080')
    tags.manufacturer = getString('x00080070')

    return tags
  }

  // Format DICOM date (YYYYMMDD -> DD/MM/YYYY)
  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'N/A' || dateStr.length !== 8) return dateStr
    const year = dateStr.substring(0, 4)
    const month = dateStr.substring(4, 6)
    const day = dateStr.substring(6, 8)
    return `${day}/${month}/${year}`
  }

  // Format DICOM time (HHMMSS.FFFFFF -> HH:MM:SS)
  const formatTime = (timeStr) => {
    if (!timeStr || timeStr === 'N/A' || timeStr.length < 6) return timeStr
    const hour = timeStr.substring(0, 2)
    const minute = timeStr.substring(2, 4)
    const second = timeStr.substring(4, 6)
    return `${hour}:${minute}:${second}`
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50">
          <h2 className="text-xl font-semibold text-slate-800">
            DICOM Preview - {file?.name}
          </h2>
          <div className="flex items-center gap-2">
            {/* Open in New Tab Button */}
            <button
              onClick={openInNewTab}
              disabled={!imageUrl}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Open in new tab"
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
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Image Preview */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-700">Image Preview</h3>

              <div className="bg-black rounded-lg overflow-hidden relative" style={{ minHeight: '500px', height: '500px' }}>
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p>Loading DICOM image...</p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-red-400">
                      <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-medium">{error}</p>
                    </div>
                  </div>
                )}

                {/* Cornerstone Viewport */}
                <div
                  ref={viewportRef}
                  className="w-full h-full"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

              {!loading && !error && (
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Use mouse wheel to zoom, right-click drag to adjust window/level
                </div>
              )}
            </div>

            {/* DICOM Tags */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-700">DICOM Tags</h3>

              {loading && (
                <div className="text-center py-8 text-slate-500">
                  <p>Parsing DICOM tags...</p>
                </div>
              )}

              {tags && (
                <div className="space-y-4">
                  {/* Patient Information */}
                  <TagSection title="Patient Information" icon="👤">
                    <TagItem label="Name" value={tags.patientName} />
                    <TagItem label="Patient ID" value={tags.patientID} />
                    <TagItem label="Birth Date" value={tags.patientBirthDate} />
                    <TagItem label="Sex" value={tags.patientSex} />
                  </TagSection>

                  {/* Study Information */}
                  <TagSection title="Study Information" icon="📋">
                    <TagItem label="Study Date" value={tags.studyDate} />
                    <TagItem label="Study Time" value={tags.studyTime} />
                    <TagItem label="Description" value={tags.studyDescription} />
                    <TagItem label="Study UID" value={tags.studyInstanceUID} mono />
                  </TagSection>

                  {/* Series Information */}
                  <TagSection title="Series Information" icon="🔢">
                    <TagItem label="Series Number" value={tags.seriesNumber} />
                    <TagItem label="Description" value={tags.seriesDescription} />
                    <TagItem label="Series UID" value={tags.seriesInstanceUID} mono />
                  </TagSection>

                  {/* Image Information */}
                  <TagSection title="Image Information" icon="🖼️">
                    <TagItem label="Instance Number" value={tags.instanceNumber} />
                    <TagItem label="Modality" value={tags.modality} />
                    <TagItem label="Rows × Columns" value={`${tags.rows} × ${tags.columns}`} />
                    <TagItem label="Slice Thickness" value={tags.sliceThickness} />
                    <TagItem label="Pixel Spacing" value={tags.pixelSpacing} />
                  </TagSection>

                  {/* Equipment Information */}
                  <TagSection title="Equipment Information" icon="🏥">
                    <TagItem label="Institution" value={tags.institutionName} />
                    <TagItem label="Manufacturer" value={tags.manufacturer} />
                  </TagSection>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  )
}

// Tag Section Component
function TagSection({ title, icon, children }) {
  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
      <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </h4>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  )
}

// Tag Item Component
function TagItem({ label, value, mono = false }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-sm">
      <span className="text-slate-600 font-medium">{label}:</span>
      <span className={`text-slate-800 ${mono ? 'font-mono text-xs' : ''} break-all`}>
        {value}
      </span>
    </div>
  )
}
