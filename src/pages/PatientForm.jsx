import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as patientService from '../services/patientService'
import { useToast } from '../components/ToastProvider'
import { logger } from '../utils/logger'
import { findPotentialDuplicates, formatDuplicateWarning } from '../utils/duplicateDetection'

export default function PatientForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const isEditMode = !!id
  const hasLoadedPatient = useRef(false)

  const [form, setForm] = useState({
    mrn: '',
    name: '',
    patient_id: '', // NIK
    ihs_number: '',
    birth_date: '',
    sex: 'M',
    phone: '',
    email: '',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    blood_type: '',
    allergies: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: ''
  })

  // Duplicate detection state
  const [duplicateCheck, setDuplicateCheck] = useState({
    loading: false,
    checked: false,
    matches: [],
    warning: null // { showWarning, message, topMatch }
  })

  // Debounce timer ref
  const duplicateCheckDebounce = useRef(null)

  useEffect(() => {
    // Prevent double API calls by checking if we've already loaded the patient
    if (isEditMode && !hasLoadedPatient.current) {
      hasLoadedPatient.current = true
      loadPatient(id)
    }
  }, [id, isEditMode])

  // Debounced duplicate detection on form changes (only for create mode)
  useEffect(() => {
    if (isEditMode) return // Skip duplicate check for edits

    // Only check when critical fields have values
    if (!form.name.trim() || !form.birth_date) {
      setDuplicateCheck(prev => ({ ...prev, checked: false, warning: null }))
      return
    }

    // Debounce: wait 500ms after user stops typing
    const timer = setTimeout(async () => {
      setDuplicateCheck(prev => ({ ...prev, loading: true }))

      try {
        const matches = await findPotentialDuplicates(form, 5)
        const warning = formatDuplicateWarning(matches)

        setDuplicateCheck(prev => ({
          ...prev,
          loading: false,
          checked: true,
          matches,
          warning
        }))
      } catch (error) {
        console.error('Duplicate check failed:', error)
        setDuplicateCheck(prev => ({ ...prev, loading: false }))
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [form.name, form.birth_date, form.patient_id, form.ihs_number, isEditMode])

  const loadPatient = async (patientId) => {
    try {
      logger.debug('[PatientForm] Loading patient:', patientId);
      const patient = await patientService.getPatient(patientId)
      logger.debug('[PatientForm] Patient loaded:', patient);

      if (!patient) {
        throw new Error('Patient not found');
      }

      setForm({
        mrn: patient.mrn || '',
        name: patient.name || '',
        patient_id: patient.patient_id || '',
        ihs_number: patient.ihs_number || '',
        birth_date: patient.birth_date || '',
        sex: patient.sex || 'M',
        phone: patient.phone || '',
        email: patient.email || '',
        address: patient.address || '',
        city: patient.city || '',
        province: patient.province || '',
        postal_code: patient.postal_code || '',
        blood_type: patient.blood_type || '',
        allergies: patient.allergies || '',
        emergency_contact_name: patient.emergency_contact_name || '',
        emergency_contact_phone: patient.emergency_contact_phone || '',
        emergency_contact_relation: patient.emergency_contact_relation || ''
      })
    } catch (e) {
      logger.error('[PatientForm] Failed to load patient:', e);
      // Show a more user-friendly error message
      toast.notify({ type: 'error', message: `Failed to load patient: ${e.message || 'Unknown error'}` })
      nav('/patients')
    }
  }

  const validate = () => {
    const errs = []
    if (!form.name) errs.push('Patient Name is required')
    // Add validation for name: only alphabets, dots, and commas (for professional titles)
    else if (!/^[a-zA-Z\s.,]+$/.test(form.name)) errs.push('Patient Name can only contain letters, spaces, dots, and commas')
    
    if (!form.birth_date) errs.push('Birth Date is required')
    if (!form.sex) errs.push('Sex is required')
    
    // Add validation for patient_id (NIK): only digits
    if (form.patient_id && !/^\d*$/.test(form.patient_id)) errs.push('NIK (ID Number) can only contain digits')
    // Add validation for patient_id length if it's provided
    if (form.patient_id && form.patient_id.length > 0 && form.patient_id.length !== 16) errs.push('NIK (ID Number) must be exactly 16 digits')
    
    // Add validation for phone number: only digits, plus, and minus signs
    if (form.phone && !/^[\d+-]+$/.test(form.phone)) errs.push('Phone number can only contain digits, plus (+), and minus (-) signs')
    
    // Add validation for emergency contact phone number: only digits, plus, and minus signs
    if (form.emergency_contact_phone && !/^[\d+-]+$/.test(form.emergency_contact_phone)) errs.push('Emergency contact phone can only contain digits, plus (+), and minus (-) signs')
    
    return errs
  }

  const submit = async (e) => {
    e.preventDefault()

    // Check for duplicates first (only in create mode)
    if (!isEditMode && duplicateCheck.checked && duplicateCheck.warning?.showWarning) {
      const confirmed = window.confirm(
        `Potential duplicate detected. Save anyway?\n\n${duplicateCheck.warning.message}\n\nClick OK to create anyway, or Cancel to review.`
      )
      if (!confirmed) {
        return // User cancelled, let them review the duplicate
      }
    }

    const errs = validate()
    if (errs.length) {
      toast.notify({ type: 'error', message: errs[0] })
      return
    }

    try {
      // Ensure MRN is present (backend requires it). Auto-generate if empty.
      let mrn = (form.mrn || '').trim()
      if (!mrn) {
        const now = new Date()
        const ymd = now.toISOString().slice(0,10).replace(/-/g,'')
        mrn = `MRN${ymd}${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`
      }

      // Convert allergies text to array format for backend
      let allergiesArray = null;
      if (form.allergies && form.allergies.trim()) {
        // Simple parsing: split by newline, each line is an allergen
        // Format: "Penicillin (Skin rash) [moderate]"
        allergiesArray = form.allergies.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => {
            // Try to parse: "Allergen (Reaction) [Severity]"
            const match = line.match(/^([^(]+?)(?:\s*\(([^)]+)\))?(?:\s*\[([^\]]+)\])?$/);
            if (match) {
              return {
                allergen: match[1].trim(),
                reaction: match[2]?.trim() || null,
                severity: match[3]?.trim() || null
              };
            }
            // Fallback: just use the whole line as allergen
            return {
              allergen: line,
              reaction: null,
              severity: null
            };
          });
      }

      // Prepare minimal, clean data for backend (avoid unknown fields)
      const patientData = {
        medical_record_number: mrn,
        patient_name: form.name,
        gender: form.sex === 'M' ? 'male' : 'female',
        birth_date: form.birth_date,
        patient_national_id: form.patient_id || undefined,
        ihs_number: form.ihs_number || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        // Convert allergies to array format
        allergies: allergiesArray,
      };

      if (isEditMode) {
        logger.debug('[PatientForm] Updating patient:', id, patientData);
        await patientService.updatePatient(id, patientData)
        toast.notify({ type: 'success', message: 'Patient updated successfully' })
      } else {
        logger.debug('[PatientForm] Creating patient:', patientData);
        await patientService.createPatient(patientData)
        toast.notify({ type: 'success', message: 'Patient created successfully' })
      }
      nav('/patients')
    } catch (e) {
      logger.error('[PatientForm] Failed to save patient:', e);
      toast.notify({ type: 'error', message: `Failed to save patient: ${e.message || 'Unknown error'}` })
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">
        {isEditMode ? 'Edit Patient' : 'Add New Patient'}
      </h1>

      <form onSubmit={submit} className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Duplicate Detection Warning */}
        {duplicateCheck.warning?.showWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-amber-600 text-xl">⚠️</span>
              <div className="flex-1">
                <h3 className="font-medium text-amber-800">Potential Duplicate Patient</h3>
                <div className="text-sm text-amber-700 mt-1 whitespace-pre-line">
                  {duplicateCheck.warning.message}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (duplicateCheck.topMatch?.patient) {
                        nav(`/patients/${duplicateCheck.topMatch.patient.id}/edit`)
                      }
                    }}
                    className="px-3 py-1.5 text-sm rounded bg-amber-100 text-amber-800 hover:bg-amber-200"
                  >
                    View Existing Record
                  </button>
                  <span className="text-xs text-amber-600 self-center">
                    Review before saving. Click Create Patient to proceed anyway.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Basic Information */}
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                MRN (Medical Record Number)
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Auto-generated if empty"
                value={form.mrn}
                onChange={e => setForm(prev => ({ ...prev, mrn: e.target.value }))}
                disabled={isEditMode}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Patient full name"
                value={form.name}
                onChange={e => {
                  // Only allow letters, spaces, dots, and commas
                  if (e.target.value === '' || /^[a-zA-Z\s.,]*$/.test(e.target.value)) {
                    setForm(prev => ({ ...prev, name: e.target.value }))
                  }
                }}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                NIK (ID Number)
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                placeholder="16 digits NIK"
                maxLength={16}
                value={form.patient_id}
                onChange={e => {
                  // Only allow numeric input and limit to 16 characters
                  if (e.target.value === '' || /^\d{1,16}$/.test(e.target.value)) {
                    setForm(prev => ({ ...prev, patient_id: e.target.value }))
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                IHS Number
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                placeholder="IHS number"
                value={form.ihs_number}
                onChange={e => setForm(prev => ({ ...prev, ihs_number: e.target.value }))}
              />
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

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Sex <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={form.sex}
                onChange={e => setForm(prev => ({ ...prev, sex: e.target.value }))}
                required
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="+62-812-3456-7890"
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
                placeholder="patient@example.com"
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
          </div>
        </section>

        {/* Address Information */}
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Address Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Address
              </label>
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Street address"
                rows={2}
                value={form.address}
                onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                City
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="City"
                value={form.city}
                onChange={e => setForm(prev => ({ ...prev, city: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Province
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Province"
                value={form.province}
                onChange={e => setForm(prev => ({ ...prev, province: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Postal Code
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Postal code"
                value={form.postal_code}
                onChange={e => setForm(prev => ({ ...prev, postal_code: e.target.value }))}
              />
            </div>
          </div>
        </section>

        {/* Medical Information */}
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Medical Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Blood Type
              </label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={form.blood_type}
                onChange={e => setForm(prev => ({ ...prev, blood_type: e.target.value }))}
              >
                <option value="">Select blood type</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Allergies
              </label>
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter allergies, one per line. Format: Allergen (Reaction) [Severity]"
                rows={3}
                value={form.allergies}
                onChange={e => setForm(prev => ({ ...prev, allergies: e.target.value }))}
              />
              <p className="text-xs text-slate-500 mt-1">
                Format: Allergen (Reaction) [Severity]. Example: Penicillin (Skin rash) [moderate]
              </p>
            </div>
          </div>
        </section>

        {/* Emergency Contact */}
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Emergency Contact</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Contact Name
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Emergency contact name"
                value={form.emergency_contact_name}
                onChange={e => setForm(prev => ({ ...prev, emergency_contact_name: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="+62-812-3456-7890"
                value={form.emergency_contact_phone}
                onChange={e => {
                  // Only allow digits, plus, and minus signs
                  if (e.target.value === '' || /^[\d+-]*$/.test(e.target.value)) {
                    setForm(prev => ({ ...prev, emergency_contact_phone: e.target.value }))
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Relationship
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Relationship to patient"
                value={form.emergency_contact_relation}
                onChange={e => setForm(prev => ({ ...prev, emergency_contact_relation: e.target.value }))}
              />
            </div>
          </div>
        </section>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={() => nav('/patients')}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isEditMode ? 'Update Patient' : 'Create Patient'}
          </button>
        </div>
      </form>
    </div>
  )
}
