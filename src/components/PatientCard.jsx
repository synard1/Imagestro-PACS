import React from 'react'
import QRCode from 'react-qr-code'

/**
 * PatientCard - Printable patient card component
 * Displays patient information in a card format suitable for printing
 */
export default function PatientCard({ patient, showPhoto = true }) {
  if (!patient) return null

  // Format date to readable format
  const formatDate = (dateString) => {
    if (!dateString) return '-'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
    } catch (e) {
      return dateString
    }
  }

  // Calculate age from birth date
  const calculateAge = (birthDate) => {
    if (!birthDate) return '-'
    try {
      const birth = new Date(birthDate)
      const today = new Date()
      let age = today.getFullYear() - birth.getFullYear()
      const monthDiff = today.getMonth() - birth.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--
      }
      return `${age} tahun`
    } catch (e) {
      return '-'
    }
  }

  return (
    <div className="patient-card bg-white border-2 border-slate-300 rounded-lg p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b-2 border-slate-300 pb-4 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">PATIENT CARD</h1>
            <p className="text-sm text-slate-600">Medical Record Information</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Card Issued:</div>
            <div className="text-sm font-medium">{formatDate(new Date().toISOString())}</div>
          </div>
        </div>
      </div>

      {/* Patient Photo and Basic Info */}
      <div className="flex gap-6 mb-6">
        {/* Photo Placeholder */}
        {showPhoto && (
          <div className="flex-shrink-0">
            <div className="w-32 h-40 bg-slate-100 border-2 border-slate-300 rounded flex items-center justify-center">
              <div className="text-center text-slate-400">
                <svg className="w-16 h-16 mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                <div className="text-xs">Photo</div>
              </div>
            </div>
          </div>
        )}

        {/* Basic Information */}
        <div className="flex-1">
          <div className="mb-4">
            <h2 className="text-3xl font-bold text-slate-800 mb-1">{patient.name || patient.patient_name}</h2>
            <div className="flex gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {calculateAge(patient.birth_date)}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {patient.sex === 'M' ? 'Laki-laki' : 'Perempuan'}
              </span>
            </div>
          </div>

          {/* Key Identifiers */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-50 p-3 rounded border border-slate-200">
              <div className="text-xs text-slate-500 mb-1">Medical Record Number</div>
              <div className="font-mono text-lg font-bold text-slate-800">{patient.mrn || patient.medical_record_number || '-'}</div>
            </div>
            <div className="bg-slate-50 p-3 rounded border border-slate-200">
              <div className="text-xs text-slate-500 mb-1">NIK</div>
              <div className="font-mono text-lg font-bold text-slate-800">{patient.patient_id || patient.patient_national_id || '-'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Information */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-6 text-sm">
        <div className="flex border-b border-slate-200 pb-2">
          <div className="font-semibold text-slate-600 w-32">Birth Date:</div>
          <div className="text-slate-800">{formatDate(patient.birth_date)}</div>
        </div>

        <div className="flex border-b border-slate-200 pb-2">
          <div className="font-semibold text-slate-600 w-32">IHS Number:</div>
          <div className="text-slate-800 font-mono">{patient.ihs_number || '-'}</div>
        </div>

        <div className="flex border-b border-slate-200 pb-2">
          <div className="font-semibold text-slate-600 w-32">Phone:</div>
          <div className="text-slate-800">{patient.phone || '-'}</div>
        </div>

        <div className="flex border-b border-slate-200 pb-2">
          <div className="font-semibold text-slate-600 w-32">Email:</div>
          <div className="text-slate-800">{patient.email || '-'}</div>
        </div>

        <div className="flex border-b border-slate-200 pb-2">
          <div className="font-semibold text-slate-600 w-32">Blood Type:</div>
          <div className="text-slate-800">{patient.blood_type || '-'}</div>
        </div>

        <div className="flex border-b border-slate-200 pb-2">
          <div className="font-semibold text-slate-600 w-32">Status:</div>
          <div className="text-slate-800">
            {patient.active !== false ? (
              <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">Active</span>
            ) : (
              <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-medium">Inactive</span>
            )}
          </div>
        </div>
      </div>

      {/* Address */}
      {patient.address && (
        <div className="mb-6">
          <div className="font-semibold text-slate-600 mb-2">Address:</div>
          <div className="text-slate-800 bg-slate-50 p-3 rounded border border-slate-200">
            {patient.address}
            {(patient.city || patient.province || patient.postal_code) && (
              <div className="mt-1 text-sm text-slate-600">
                {[patient.city, patient.province, patient.postal_code].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Allergies */}
      {patient.allergies && (
        <div className="mb-6">
          <div className="font-semibold text-slate-600 mb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-red-700">ALLERGIES</span>
          </div>
          <div className="bg-red-50 border-2 border-red-200 p-3 rounded">
            <div className="text-slate-800 whitespace-pre-line font-medium">
              {patient.allergies || 'None reported'}
            </div>
          </div>
        </div>
      )}

      {/* Emergency Contact */}
      {(patient.emergency_contact_name || patient.emergency_contact_phone) && (
        <div className="mb-6">
          <div className="font-semibold text-slate-600 mb-2">Emergency Contact:</div>
          <div className="bg-slate-50 p-3 rounded border border-slate-200">
            <div className="text-slate-800 font-medium">{patient.emergency_contact_name || '-'}</div>
            <div className="text-sm text-slate-600 mt-1">
              {patient.emergency_contact_phone && (
                <span className="mr-4">📞 {patient.emergency_contact_phone}</span>
              )}
              {patient.emergency_contact_relation && (
                <span>({patient.emergency_contact_relation})</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Code */}
      <div className="border-t-2 border-slate-300 pt-4 mt-6">
        <div className="flex justify-between items-end">
          <div>
            <div className="text-xs text-slate-500 mb-1">For medical use only</div>
            <div className="text-xs text-slate-400">
              Printed: {new Date().toLocaleString('id-ID')}
            </div>
          </div>
          <div className="bg-white p-2 border border-slate-300 rounded">
            <QRCode
              value={JSON.stringify({
                mrn: patient.mrn || patient.medical_record_number,
                nik: patient.patient_id || patient.patient_national_id,
                name: patient.name || patient.patient_name,
                birthDate: patient.birth_date
              })}
              size={80}
              level="M"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
