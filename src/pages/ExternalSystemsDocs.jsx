import { useEffect, useMemo, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '../components/ToastProvider'
import * as extSvc from '../services/externalSystemsDocService'

export default function ExternalSystemsDocs() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const hasLoaded = useRef(false)
  const toast = useToast()
  const nav = useNavigate()

  const load = async () => {
    try {
      const resp = await extSvc.listExternalSystems({ page, page_size: pageSize, system_code: q || undefined, system_type: typeFilter || undefined, is_active: activeFilter === '' ? undefined : activeFilter === 'true' })
      const data = Array.isArray(resp?.systems) ? resp.systems : []
      setRows(data)
      setTotal(resp?.total || data.length)
    } catch (e) {
      toast.notify({ type: 'error', message: 'Gagal memuat data external systems' })
    }
  }

  // Only run once on component mount
  useEffect(() => {
    load()
  }, [])

  // Run when filters or pagination change, but not on initial mount
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    load()
  }, [page, pageSize, typeFilter, activeFilter])

  const filtered = useMemo(() => rows.filter(r => !q || (r.system_code || '').toLowerCase().includes(q.toLowerCase()) || (r.system_name || '').toLowerCase().includes(q.toLowerCase())), [rows, q])

  const onDelete = async (row) => {
    const idOrCode = row.id || row.system_code
    if (!idOrCode) return
    const ok = confirm(`Hapus external system '${row.system_name}' (${row.system_code})?`)
    if (!ok) return
    try {
      const resp = await extSvc.deleteExternalSystem(idOrCode)
      toast.notify({ type: 'success', message: 'External system berhasil dihapus' })
      await load()
    } catch (e) {
      toast.notify({ type: 'error', message: e?.message || 'Gagal menghapus external system' })
    }
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">External Systems (Docs)</h1>
        <div className="flex gap-2">
          <input className="border rounded px-3 py-2 text-sm" placeholder="Cari code atau nama" value={q} onChange={e => setQ(e.target.value)} />
          <button type="button" className="px-3 py-2 rounded bg-slate-200 text-sm" onClick={() => { setPage(1); load() }}>Refresh</button>
          <Link to="/external-systems-docs/new" className="px-3 py-2 rounded bg-blue-600 text-white text-sm">Tambah</Link>
        </div>
      </div>

      <div className="mb-3 p-3 bg-gray-50 rounded">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Jenis Sistem</label>
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">Semua</option>
              <option value="SIMRS">SIMRS</option>
              <option value="HIS">HIS</option>
              <option value="RIS">RIS</option>
              <option value="PACS">PACS</option>
              <option value="LIS">LIS</option>
              <option value="EMR">EMR</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Status Aktif</label>
            <select value={activeFilter} onChange={e => { setActiveFilter(e.target.value); setPage(1) }} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">Semua</option>
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Baris per halaman</label>
            <select value={pageSize} onChange={e => { setPageSize(parseInt(e.target.value)); setPage(1) }} className="w-full border rounded px-3 py-2 text-sm">
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="px-3 py-2 rounded bg-gray-300 text-sm" onClick={() => { setQ(''); setTypeFilter(''); setActiveFilter(''); setPage(1); }}>Reset</button>
          </div>
        </div>
      </div>

      <div className="card overflow-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>#</th>
              <th>Kode</th>
              <th>Nama Sistem</th>
              <th>Jenis</th>
              <th>Vendor</th>
              <th>Versi</th>
              <th>Aktif</th>
              <th className="w-32 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-6">Data tidak ditemukan</td></tr>
            ) : filtered.map((r, idx) => (
              <tr key={r.id || r.system_code || idx}>
                <td className="text-xs">{(page - 1) * pageSize + idx + 1}</td>
                <td className="font-mono text-xs">{r.system_code}</td>
                <td className="text-sm">{r.system_name}</td>
                <td className="text-sm">{r.system_type}</td>
                <td className="text-sm">{r.vendor || '-'}</td>
                <td className="text-sm">{r.system_version || '-'}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{r.is_active ? 'Aktif' : 'Nonaktif'}</span>
                </td>
                <td className="text-center">
                  <div className="inline-flex gap-2">
                    <button onClick={() => nav(`/external-systems-docs/${encodeURIComponent(r.id || r.system_code)}`)} className="px-2 py-1 rounded bg-slate-200 text-xs">Edit</button>
                    <button onClick={() => onDelete(r)} className="px-2 py-1 rounded bg-red-600 text-white text-xs">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-700">Menampilkan {filtered.length} dari {total} data</div>
        <div className="flex gap-2 items-center">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className={`px-4 py-2 rounded ${page === 1 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border'}`}>Prev</button>
          <span className="text-sm">Hal {page} dari {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className={`px-4 py-2 rounded ${page >= totalPages ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border'}`}>Next</button>
        </div>
      </div>
    </div>
  )
}