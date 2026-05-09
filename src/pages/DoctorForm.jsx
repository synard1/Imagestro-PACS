import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as doctorService from '../services/doctorService'
import { isDoctorProtected } from '../services/api'
import { useToast } from '../components/ToastProvider'

export default function DoctorForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const isEditMode = !!id
  const hasLoaded = useRef(false)

  const [form, setForm] = useState({
    name: '',
    national_id: '', // National ID
    ihs_number: '', // IHS Number
    license: '',
    specialty: '',
    phone: '',
    email: '',
    gender: 'M',
    birth_date: ''
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [initialDoctor, setInitialDoctor] = useState(null)

  useEffect(() => {
    if (isEditMode && !hasLoaded.current) {
      hasLoaded.current = true
      loadDoctor(id)
    }
  }, [id, isEditMode])

  const loadDoctor = async (doctorId) => {
    setLoading(true)
    try {
      const doctor = await doctorService.getDoctor(doctorId)

      if (!doctor) {
        throw new Error('Doctor not found')
      }
      
      setInitialDoctor(doctor) // Store the original doctor object

      setForm({
        name: doctor.name || '',
        national_id: doctor.national_id || '',
        ihs_number: doctor.ihs_number || '',
        license: doctor.license || '',
        specialty: doctor.specialty || '',
        phone: doctor.phone || '',
        email: doctor.email || '',
        gender: doctor.gender || 'M',
        birth_date: doctor.birth_date || '' // The service already normalizes the date format
      })
    } catch (e) {
      console.error('[DoctorForm] Load doctor failed:', e)
      toast.notify({ type: 'error', message: `Failed to load doctor: ${e.message}` })
      nav('/doctors')
    } finally {
      setLoading(false)
    }
  }

  const validate = () => {
    const errs = []
    if (!form.name) errs.push('Doctor Name is required')
    // Add validation for name: only alphabets, dots, and commas (for professional titles)
    else if (!/^[a-zA-Z\s.,]+$/.test(form.name)) errs.push('Doctor Name can only contain letters, spaces, dots, and commas')
    
    if (!form.license) errs.push('License is required')
    if (!form.specialty) errs.push('Specialty is required')
    // Add validation for specialty: only alphabets and spaces
    else if (!/^[a-zA-Z\s]+$/.test(form.specialty)) errs.push('Specialty can only contain letters and spaces')
    
    if (!form.national_id) errs.push('National ID is required')
    // National ID validation is already implemented
    if (form.national_id && !/^\d{16}$/.test(form.national_id)) errs.push('National ID must be exactly 16 digits')
    if (!form.birth_date) errs.push('Birth Date is required')
    
    // Add validation for phone number: only digits, plus, and minus signs
    if (form.phone && !/^[\d+-]+$/.test(form.phone)) errs.push('Phone number can only contain digits, plus (+), and minus (-) signs')
    
    return errs
  }

  const submit = async (e) => {
    e.preventDefault()

    // Validate
    const errs = validate()
    if (errs.length) {
      toast.notify({ type: 'error', message: errs[0] })
      return
    }

    setSaving(true)
    try {
      // Prepare payload matching backend fields
      const doctorData = {
        name: form.name.trim(),
        national_id: form.national_id.trim(),
        license: form.license.trim(),
        specialty: form.specialty.trim(),
        birth_date: form.birth_date,
        gender: form.gender
      }

      // Add optional fields only if they have values
      if (form.ihs_number?.trim()) {
        doctorData.ihs_number = form.ihs_number.trim()
      }
      if (form.phone?.trim()) {
        doctorData.phone = form.phone.trim()
      }
      if (form.email?.trim()) {
        doctorData.email = form.email.trim()
      }

      console.log('[DoctorForm] Submitting:', { isEditMode, doctorData })

      if (isEditMode) {
        // Check if doctor is protected using the stored initial state
        if (isDoctorProtected(initialDoctor)) {
          toast.notify({ type: 'warning', message: 'This doctor data is protected for SATUSEHAT testing and cannot be modified.' })
          setSaving(false) // Stop saving indicator
          return
        }

        const result = await doctorService.updateDoctor(id, doctorData)
        console.log('[DoctorForm] Update result:', result)
        toast.notify({ type: 'success', message: 'Doctor updated successfully' })
      } else {
        const result = await doctorService.createDoctor(doctorData)
        console.log('[DoctorForm] Create result:', result)
        toast.notify({ type: 'success', message: 'Doctor created successfully' })
      }

      // Navigate back to list
      nav('/doctors')
    } catch (e) {
      console.error('[DoctorForm] Save failed:', e)

      // Provide user-friendly error messages
      let errorMessage = e.message || 'An error occurred while saving doctor'

      // Special handling for specific errors
      if (errorMessage.includes('not found')) {
        errorMessage = 'Doctor not found. It may have been deleted.'
        setTimeout(() => nav('/doctors'), 2000)
      } else if (errorMessage.includes('duplicate key')) {
        errorMessage = 'A doctor with this National ID or License already exists.'
      } else if (errorMessage.includes('permission')) {
        errorMessage = 'You do not have permission to perform this action.'
      }

      toast.notify({ type: 'error', message: errorMessage })
    } finally {
      setSaving(false)
    }
  }

  // if (loading) {
  //   return (
  //     <div className="max-w-5xl mx-auto p-4">
  //       <div className="flex items-center justify-center py-12">
  //         <div className="text-center">
  //           <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  //           <p className="mt-4 text-slate-600">Loading doctor data...</p>
  //         </div>
  //       </div>
  //     </div>
  //   )
  // }

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">
        {isEditMode ? 'Edit Doctor' : 'Add New Doctor'}
      </h1>

      <form onSubmit={submit} className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Basic Information */}
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                placeholder="Doctor full name"
                value={form.name}
                onChange={e => {
                  // Only allow letters, spaces, dots, and commas
                  if (e.target.value === '' || /^[a-zA-Z\s.,]*$/.test(e.target.value)) {
                    setForm(prev => ({ ...prev, name: e.target.value }))
                  }
                }}
                disabled={saving}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                License <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="License number"
                value={form.license}
                onChange={e => setForm(prev => ({ ...prev, license: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                National ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                placeholder="16 digits National ID"
                maxLength={16}
                value={form.national_id}
                onChange={e => {
                  // Only allow numeric input and limit to 16 characters
                  if (e.target.value === '' || /^\d{1,16}$/.test(e.target.value)) {
                    setForm(prev => ({ ...prev, national_id: e.target.value }))
                  }
                }}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                IHS Number
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                placeholder="IHS Number"
                value={form.ihs_number}
                onChange={e => setForm(prev => ({ ...prev, ihs_number: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Specialty <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Specialty"
                value={form.specialty}
                onChange={e => {
                  // Only allow letters and spaces
                  if (e.target.value === '' || /^[a-zA-Z\s]*$/.test(e.target.value)) {
                    setForm(prev => ({ ...prev, specialty: e.target.value }))
                  }
                }}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Gender
              </label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={form.gender}
                onChange={e => setForm(prev => ({ ...prev, gender: e.target.value }))}
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Birth Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={form.birth_date}
                onChange={e => setForm(prev => ({ ...prev, birth_date: e.target.value }))}
                required
              />
            </div>
          </div>
        </section>

        {/* Contact Information */}
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Contact Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Phone
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Phone number"
                value={form.phone}
                onChange={e => {
                  // Only allow digits, plus, and minus signs
                  if (e.target.value === '' || /^[\d+-]*$/.test(e.target.value)) {
                    setForm(prev => ({ ...prev, phone: e.target.value }))
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Email address"
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
          </div>
        </section>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => nav('/doctors')}
            disabled={saving}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            )}
            <span>{saving ? 'Saving...' : (isEditMode ? 'Update Doctor' : 'Add Doctor')}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
