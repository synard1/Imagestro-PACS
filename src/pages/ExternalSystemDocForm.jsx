import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../components/ToastProvider'
import * as extSvc from '../services/externalSystemsDocService'

const TYPES = ['SIMRS','HIS','RIS','PACS','LIS','EMR','Other']
const AUTHS = ['basic_auth','bearer_token','api_key','oauth2','none']

export default function ExternalSystemDocForm() {
  const { id } = useParams()
  const isEdit = !!id
  const nav = useNavigate()
  const toast = useToast()
  const hasLoaded = useRef(false)

  const [form, setForm] = useState({
    system_code: '',
    system_name: '',
    system_type: 'SIMRS',
    system_version: '',
    vendor: '',
    base_url: '',
    api_endpoint: '',
    auth_type: 'none',
    auth_config: '',
    contact_person: '',
    contact_email: '',
    notes: '',
    is_active: true,
  })

  useEffect(() => {
    if (isEdit && !hasLoaded.current) {
      hasLoaded.current = true
      load(id)
    }
  }, [id, isEdit])

  const load = async (identifier) => {
    try {
      const sys = await extSvc.getExternalSystem(identifier)
      if (!sys) throw new Error('Data tidak ditemukan')
      setForm({
        system_code: sys.system_code || '',
        system_name: sys.system_name || '',
        system_type: sys.system_type || 'SIMRS',
        system_version: sys.system_version || '',
        vendor: sys.vendor || '',
        base_url: sys.base_url || '',
        api_endpoint: sys.api_endpoint || '',
        auth_type: sys.auth_type || 'none',
        auth_config: sys.auth_config ? JSON.stringify(sys.auth_config, null, 2) : '',
        contact_person: sys.contact_person || '',
        contact_email: sys.contact_email || '',
        notes: sys.notes || '',
        is_active: !!sys.is_active,
      })
    } catch (e) {
      toast.notify({ type: 'error', message: e?.message || 'Gagal memuat data' })
      nav('/external-systems-docs')
    }
  }

  const validate = () => {
    const errs = []
    if (!form.system_code) errs.push('Kode sistem wajib diisi')
    if (!form.system_name) errs.push('Nama sistem wajib diisi')
    if (!form.system_type || !TYPES.includes(form.system_type)) errs.push('Jenis sistem tidak valid')
    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) errs.push('Email kontak tidak valid')
    if (form.auth_type && !AUTHS.includes(form.auth_type)) errs.push('Jenis autentikasi tidak valid')
    if (form.auth_config) {
      try { JSON.parse(form.auth_config) } catch (_) { errs.push('auth_config harus JSON valid') }
    }
    return errs
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (errs.length) { toast.notify({ type: 'error', message: errs[0] }); return }
    try {
      const payload = {
        system_code: form.system_code,
        system_name: form.system_name,
        system_type: form.system_type,
        system_version: form.system_version || undefined,
        vendor: form.vendor || undefined,
        base_url: form.base_url || undefined,
        api_endpoint: form.api_endpoint || undefined,
        auth_type: form.auth_type || undefined,
        auth_config: form.auth_config ? JSON.parse(form.auth_config) : undefined,
        contact_person: form.contact_person || undefined,
        contact_email: form.contact_email || undefined,
        notes: form.notes || undefined,
        is_active: !!form.is_active,
      }
      if (isEdit) {
        await extSvc.updateExternalSystem(id, payload)
        toast.notify({ type: 'success', message: 'Berhasil memperbarui external system' })
      } else {
        await extSvc.createExternalSystem(payload)
        toast.notify({ type: 'success', message: 'Berhasil menambah external system' })
      }
      nav('/external-systems-docs')
    } catch (e) {
      toast.notify({ type: 'error', message: e?.message || 'Gagal menyimpan data' })
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">{isEdit ? 'Edit External System' : 'Tambah External System'}</h1>
      <form onSubmit={submit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kode Sistem</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2" value={form.system_code} onChange={e => setForm(prev => ({ ...prev, system_code: e.target.value }))} disabled={isEdit} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nama Sistem</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2" value={form.system_name} onChange={e => setForm(prev => ({ ...prev, system_name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Jenis Sistem</label>
            <select className="w-full border rounded-lg px-3 py-2" value={form.system_type} onChange={e => setForm(prev => ({ ...prev, system_type: e.target.value }))} required>
              {TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Versi</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2" value={form.system_version} onChange={e => setForm(prev => ({ ...prev, system_version: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Vendor</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2" value={form.vendor} onChange={e => setForm(prev => ({ ...prev, vendor: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
            <input type="url" className="w-full border rounded-lg px-3 py-2" value={form.base_url} onChange={e => setForm(prev => ({ ...prev, base_url: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">API Endpoint</label>
            <input type="url" className="w-full border rounded-lg px-3 py-2" value={form.api_endpoint} onChange={e => setForm(prev => ({ ...prev, api_endpoint: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Auth Type</label>
            <select className="w-full border rounded-lg px-3 py-2" value={form.auth_type} onChange={e => setForm(prev => ({ ...prev, auth_type: e.target.value }))}>
              {AUTHS.map(a => (<option key={a} value={a}>{a}</option>))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Auth Config (JSON)</label>
            <textarea className="w-full border rounded-lg px-3 py-2 font-mono" rows={4} value={form.auth_config} onChange={e => setForm(prev => ({ ...prev, auth_config: e.target.value }))} placeholder='{"token":"..."}' />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2" value={form.contact_person} onChange={e => setForm(prev => ({ ...prev, contact_person: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
            <input type="email" className="w-full border rounded-lg px-3 py-2" value={form.contact_email} onChange={e => setForm(prev => ({ ...prev, contact_email: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
            <textarea className="w-full border rounded-lg px-3 py-2" rows={3} value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))} />
              Aktif
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <button type="button" onClick={() => nav('/external-systems-docs')} className="px-4 py-2 border rounded">Batal</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">{isEdit ? 'Simpan Perubahan' : 'Simpan'}</button>
        </div>
      </form>
    </div>
  )
}
