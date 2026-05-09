import { useEffect, useState } from 'react'
import * as dicomParser from 'dicom-parser'

/**
 * DicomTagsPreview Component
 * Displays only DICOM metadata tags without image preview
 */
export default function DicomTagsPreview({ file, onClose }) {
  const [tags, setTags] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!file) return

    const loadTags = async () => {
      try {
        setLoading(true)
        setError(null)

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer()
        const byteArray = new Uint8Array(arrayBuffer)

        // Parse DICOM file
        let dataSet
        try {
          dataSet = dicomParser.parseDicom(byteArray)
        } catch (e) {
          throw new Error('Invalid DICOM file')
        }

        // Extract important tags
        const extractedTags = extractDicomTags(dataSet)
        setTags(extractedTags)

      } catch (err) {
        console.error('Error loading DICOM tags:', err)
        setError(err.message || 'Failed to parse DICOM tags')
      } finally {
        setLoading(false)
      }
    }

    loadTags()
  }, [file])

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
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            DICOM Tags - {file?.name}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close preview"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600">Parsing DICOM tags...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-red-600">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-medium">{error}</p>
            </div>
          )}

          {tags && !loading && !error && (
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

        {/* Footer */}
        <div className="border-t p-4 bg-slate-50 flex justify-end gap-3">
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
