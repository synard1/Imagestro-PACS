import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as mappingService from '../services/mappingService'
import * as procedureService from '../services/procedureService'
import Select2 from '../components/Select2'
import { useToast } from '../components/ToastProvider'

export default function MappingForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const isEdit = !!id
  const hasLoaded = useRef(false)
  const hasInitLoaded = useRef(false)

  const [systems, setSystems] = useState([])
  const [form, setForm] = useState({
    external_system_id: '',
    external_code: '',
    external_name: '',
    pacs_procedure_id: '',
    pacs_display: '',
    mapping_type: 'exact',
    confidence_level: 100,
    notes: ''
  })

  useEffect(() => {
    if (!hasInitLoaded.current) {
      hasInitLoaded.current = true
      init()
    }
  }, [])

  useEffect(() => {
    if (isEdit && !hasLoaded.current) {
      hasLoaded.current = true
      load(id)
    }
  }, [id, isEdit])

  const init = async () => {
    try {
      const sys = await mappingService.listExternalSystems()
      setSystems(sys)
    } catch (e) {
      toast.notify({ type: 'error', message: 'Failed to load external systems' })
    }
  }

  const load = async (key) => {
    try {
      const m = await mappingService.getMapping(key)
      let displayText = ''
      if (m.pacs_code && m.pacs_name) {
        displayText = `${m.pacs_code} - ${m.pacs_name}`
      } else if (m.pacs_name) {
        displayText = m.pacs_name
      } else if (m.pacs_code) {
        displayText = m.pacs_code
      }
      setForm({
        external_system_id: m.external_system_id || '',
        external_code: m.external_code || '',
        external_name: m.external_name || '',
        pacs_procedure_id: m.pacs_procedure_id || '',
        pacs_display: displayText,
        mapping_type: m.mapping_type || 'exact',
        confidence_level: m.confidence_level || 100,
        notes: m.notes || ''
      })
    } catch (e) {
      toast.notify({ type: 'error', message: `Failed to load mapping: ${e.message}` })
      nav('/mappings')
    }
  }

  const validate = () => {
    const errs = []
    if (!form.external_system_id) errs.push('External system is required')
    if (!form.external_code) errs.push('External code is required')
    if (!form.pacs_procedure_id) errs.push('PACS procedure is required')
    const conf = parseInt(form.confidence_level, 10)
    if (isNaN(conf) || conf < 0 || conf > 100) errs.push('Confidence must be 0-100')
    return errs
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (errs.length) { toast.notify({ type: 'error', message: errs[0] }); return }
    const payload = {
      external_system_id: form.external_system_id,
      external_code: form.external_code,
      external_name: form.external_name || undefined,
      pacs_procedure_id: form.pacs_procedure_id,
      mapping_type: form.mapping_type,
      confidence_level: parseInt(form.confidence_level, 10),
      notes: form.notes || undefined,
    }
    try {
      if (isEdit) {
        await mappingService.updateMapping(id, payload)
        toast.notify({ type: 'success', message: 'Mapping updated' })
      } else {
        await mappingService.createMapping(payload)
        toast.notify({ type: 'success', message: 'Mapping created' })
      }
      nav('/mappings')
    } catch (e) {
      toast.notify({ type: 'error', message: `Failed to save: ${e.message}` })
    }
  }

  const fetchProcedureOptions = async (query) => {
    const res = await procedureService.searchProcedures({ q: query })
    return (res || []).slice(0, 10).map(p => ({
      value: p.id || p.code,
      label: `${p.code} - ${p.name}`,
      meta: { code: p.code, name: p.name }
    }))
  }

  const sampleProcedures = async () => {
    const res = await procedureService.listProcedures({})
    return (res || []).slice(0, 5).map(p => ({
      value: p.id || p.code,
      label: `${p.code} - ${p.name}`,
      meta: { code: p.code, name: p.name }
    }))
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{isEdit ? 'Edit Mapping' : 'Add Mapping'}</h1>
      <form onSubmit={submit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">External System<span className="text-red-500">*</span></label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              value={form.external_system_id}
              onChange={e => setForm(prev => ({ ...prev, external_system_id: e.target.value }))}
              required
            >
              <option value="">Select external system</option>
              {systems.map(s => (
                <option key={s.id} value={s.id}>{s.system_code} - {s.system_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">External Code<span className="text-red-500">*</span></label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="e.g. RAD-001"
              value={form.external_code}
              onChange={e => setForm(prev => ({ ...prev, external_code: e.target.value }))}
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">External Name</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="External procedure display name"
              value={form.external_name}
              onChange={e => setForm(prev => ({ ...prev, external_name: e.target.value }))}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">PACS Procedure<span className="text-red-500">*</span></label>
            <Select2
              value={form.pacs_procedure_id}
              onChange={v => setForm(prev => ({ ...prev, pacs_procedure_id: v }))}
              onSelect={opt => setForm(prev => ({ ...prev, pacs_display: opt?.label || '' }))}
              fetchOptions={fetchProcedureOptions}
              fetchInitial={sampleProcedures}
              placeholder="Type code or name (≥ 3 chars)"
              minChars={3}
              initialLabel={form.pacs_display}
            />
            {form.pacs_display && (
              <div className="text-xs text-slate-500 mt-1">Selected: {form.pacs_display}</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mapping Type</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              value={form.mapping_type}
              onChange={e => setForm(prev => ({ ...prev, mapping_type: e.target.value }))}
            >
              <option value="exact">exact</option>
              <option value="approximate">approximate</option>
              <option value="partial">partial</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confidence (0-100)</label>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              value={form.confidence_level}
              onChange={e => setForm(prev => ({ ...prev, confidence_level: e.target.value }))}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              rows={3}
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button type="button" onClick={() => nav('/mappings')} className="px-4 py-2 border border-slate-300 rounded-lg">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{isEdit ? 'Update' : 'Create'}</button>
        </div>
      </form>
    </div>
  )
}
