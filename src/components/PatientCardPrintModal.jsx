import React, { useRef } from 'react'
import PatientCard from './PatientCard'
import { useReactToPrint } from 'react-to-print'

/**
 * PatientCardPrintModal - Modal for previewing and printing patient card
 */
export default function PatientCardPrintModal({ patient, isOpen, onClose }) {
  const printRef = useRef()

  // Handle print using react-to-print (new API)
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Patient_Card_${patient?.mrn || patient?.medical_record_number || 'unknown'}`,
    onAfterPrint: () => {
      console.log('Print completed')
    }
  })

  // Trigger print
  const onPrintClick = () => {
    if (!printRef.current) {
      alert('Print content is not ready')
      return
    }
    handlePrint()
  }

  // Fallback print function (not used, but keeping for reference)
  const handleFallbackPrint = () => {
    const printContent = printRef.current
    if (!printContent) return

    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (!printWindow) {
      alert('Please allow popups for printing')
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Patient Card - ${patient?.name || patient?.patient_name}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              padding: 20px;
              background: white;
            }
            .patient-card {
              max-width: 800px;
              margin: 0 auto;
            }
            @media print {
              body {
                padding: 0;
              }
              .no-print {
                display: none !important;
              }
            }
          </style>
          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()

    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }

  if (!isOpen || !patient) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity bg-slate-500 bg-opacity-75" aria-hidden="true"></div>

        {/* Modal panel */}
        <div
          className="inline-block w-full max-w-5xl my-8 overflow-hidden text-left align-middle transition-all transform bg-slate-100 shadow-2xl rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-800">Patient Card Preview</h3>
              <p className="text-sm text-slate-600 mt-0.5">
                {patient.name || patient.patient_name} - MRN: {patient.mrn || patient.medical_record_number}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              title="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Modal Body - Scrollable preview */}
          <div className="px-6 py-8 max-h-[70vh] overflow-y-auto">
            <div ref={printRef}>
              <PatientCard patient={patient} />
            </div>
          </div>

          {/* Modal Footer - Action buttons */}
          <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Click Print to generate patient card
              </span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={onPrintClick}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-lg shadow-blue-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Card
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
