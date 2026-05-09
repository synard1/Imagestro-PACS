import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as procedureService from '../services/procedureService'
import { useToast } from '../components/ToastProvider'

export default function ProcedureForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const isEdit = !!id
  const hasLoaded = useRef(false)

  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    category: 'Radiology',
    modality: '',
    body_part: '',
    loinc_code: '',
    loinc_display: '',
    duration_minutes: 0,
    special_requirements: ''
  })

  useEffect(() => {
    if (isEdit && !hasLoaded.current) {
      hasLoaded.current = true
      load(id)
    }
  }, [id, isEdit])

  const load = async (key) => {
    try {
      const p = await procedureService.getProcedure(key)
      setForm({
        code: p.code || '',
        name: p.name || '',
        description: p.description || '',
        category: p.category || 'Radiology',
        modality: p.modality || '',
        body_part: p.body_part || '',
        loinc_code: p.loinc_code || '',
        loinc_display: p.loinc_display || '',
        duration_minutes: p.duration_minutes || 0,
        special_requirements: p.special_requirements || ''
      })
    } catch (e) {
      toast.notify({ type: 'error', message: `Failed to load procedure: ${e.message}` })
      nav('/procedures')
    }
  }

  const validate = () => {
    const errs = []
    if (!form.code) errs.push('Procedure code is required')
    if (!/^[A-Z0-9._\s-]+$/i.test(form.code)) errs.push('Code may contain letters, numbers, dash, dot, underscore, and spaces')
    if (!form.name) errs.push('Procedure name is required')
    // Category is auto-set to 'Radiology', no validation needed
    const d = parseInt(form.duration_minutes, 10)
    if (isNaN(d) || d < 0) errs.push('Duration must be a non-negative number')
    return errs
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (errs.length) { toast.notify({ type: 'error', message: errs[0] }); return }
    const payload = {
      code: form.code,
      name: form.name,
      display_name: form.name,
      description: form.description || undefined,
      category: form.category,
      modality: form.modality || undefined,
      body_part: form.body_part || undefined,
      loinc_code: form.loinc_code || undefined,
      loinc_display: form.loinc_display || undefined,
      duration_minutes: parseInt(form.duration_minutes, 10) || 0,
      prep_instructions: form.special_requirements || undefined,
      active: true
    }
    try {
      if (isEdit) {
        await procedureService.updateProcedure(id, payload)
        toast.notify({ type: 'success', message: 'Procedure updated' })
      } else {
        await procedureService.createProcedure(payload)
        toast.notify({ type: 'success', message: 'Procedure created' })
      }
      nav('/procedures')
    } catch (e) {
      toast.notify({ type: 'error', message: `Failed to save: ${e.message}` })
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{isEdit ? 'Edit Procedure' : 'Add Procedure'}</h1>
      <form onSubmit={submit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Code<span className="text-red-500">*</span></label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="e.g. CR-CHEST-2V"
              value={form.code}
              onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
              disabled={isEdit}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name<span className="text-red-500">*</span></label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="Procedure name"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Modality</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              value={form.modality}
              onChange={e => setForm(prev => ({ ...prev, modality: e.target.value }))}
            >
              <option value="">Select modality</option>
              <option value="CR">CR - Computed Radiography</option>
              <option value="CT">CT - Computed Tomography</option>
              <option value="MR">MR - Magnetic Resonance</option>
              <option value="US">US - Ultrasound</option>
              <option value="DX">DX - Digital Radiography</option>
              <option value="MG">MG - Mammography</option>
              <option value="NM">NM - Nuclear Medicine</option>
              <option value="PT">PT - Positron Emission Tomography</option>
              <option value="XA">XA - X-Ray Angiography</option>
              <option value="RF">RF - Radiofluoroscopy</option>
              <option value="OT">OT - Other</option>
            </select>
          </div>
          {/* Category hidden - auto-set to Radiology */}
          <input type="hidden" value={form.category} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Body Part</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="e.g. Chest, Abdomen"
              value={form.body_part}
              onChange={e => setForm(prev => ({ ...prev, body_part: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Duration (minutes)</label>
            <input
              type="number"
              min={0}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="0"
              value={form.duration_minutes}
              onChange={e => setForm(prev => ({ ...prev, duration_minutes: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              LOINC Code
              <a href="https://loinc.org" target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-blue-600 hover:underline">
                (Search LOINC)
              </a>
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="e.g. 36643-5"
              value={form.loinc_code}
              onChange={e => setForm(prev => ({ ...prev, loinc_code: e.target.value }))}
            />
            <p className="text-xs text-slate-500 mt-1">Standard code for SATUSEHAT integration</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">LOINC Display Name</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="e.g. X-ray Chest 2 Views"
              value={form.loinc_display}
              onChange={e => setForm(prev => ({ ...prev, loinc_display: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              rows={3}
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Special Requirements</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              rows={3}
              value={form.special_requirements}
              onChange={e => setForm(prev => ({ ...prev, special_requirements: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button type="button" onClick={() => nav('/procedures')} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{isEdit ? 'Update' : 'Create'}</button>
        </div>
      </form>
    </div>
  )
}
