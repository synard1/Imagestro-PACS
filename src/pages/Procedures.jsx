import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { 
  MagnifyingGlassIcon, 
  FunnelIcon,
  ArrowPathIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Squares2X2Icon,
  Bars3Icon,
  BeakerIcon,
  ClockIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import * as procedureService from '../services/procedureService'
import { useToast } from '../components/ToastProvider'

const MODALITIES = ['CR', 'CT', 'MR', 'US', 'DX', 'MG', 'NM', 'PT', 'XA', 'RF', 'OT']

export default function Procedures() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()
  const nav = useNavigate()
  const hasLoaded = useRef(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('table')
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    modality: '',
    category: ''
  })

  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true
      load()
    }
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await procedureService.listProcedures({ category: filters.category, modality: filters.modality })
      const arr = Array.isArray(data) ? data.filter(p => p && (p.id || p.code) && !p._meta) : []
      setRows(arr)
    } catch (e) {
      toast.notify({ type: 'error', message: 'Failed to load procedures' })
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let result = rows

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p =>
        p.code?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q) ||
        p.loinc_code?.toLowerCase().includes(q) ||
        p.body_part?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      )
    }

    if (filters.modality) {
      result = result.filter(p => (p.modality || '').toLowerCase() === filters.modality.toLowerCase())
    }
    if (filters.category) {
      result = result.filter(p => (p.category || '').toLowerCase() === filters.category.toLowerCase())
    }

    return result
  }, [rows, searchQuery, filters])

  const sorted = useMemo(() => {
    if (!sortConfig.key) return filtered
    const { key, direction } = sortConfig
    return [...filtered].sort((a, b) => {
      const aVal = a[key] ?? ''
      const bVal = b[key] ?? ''
      if (aVal < bVal) return direction === 'asc' ? -1 : 1
      if (aVal > bVal) return direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortConfig])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, currentPage, pageSize])

  useEffect(() => { setCurrentPage(1) }, [searchQuery, filters, pageSize])

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const onDelete = async (p) => {
    if (!confirm(`Delete procedure ${p.name} (${p.code})?`)) return
    try {
      await procedureService.deleteProcedure(p.id || p.code)
      toast.notify({ type: 'success', message: 'Procedure deleted' })
      load()
    } catch (e) {
      toast.notify({ type: 'error', message: `Failed to delete: ${e.message}` })
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilters({ modality: '', category: '' })
  }

  const hasActiveFilters = searchQuery || Object.values(filters).some(v => v)

  const categories = useMemo(() => {
    const cats = new Set(rows.map(p => p.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [rows])

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <span className="ml-1 text-slate-300">⇅</span>
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUpIcon className="w-4 h-4 ml-1 inline text-blue-600" />
      : <ChevronDownIcon className="w-4 h-4 ml-1 inline text-blue-600" />
  }

  const ModalityBadge = ({ modality }) => {
    const colors = {
      CT: 'bg-purple-100 text-purple-700',
      MR: 'bg-blue-100 text-blue-700',
      CR: 'bg-green-100 text-green-700',
      DX: 'bg-yellow-100 text-yellow-700',
      US: 'bg-pink-100 text-pink-700',
      MG: 'bg-orange-100 text-orange-700',
      NM: 'bg-cyan-100 text-cyan-700',
      PT: 'bg-red-100 text-red-700',
      XA: 'bg-indigo-100 text-indigo-700',
      RF: 'bg-teal-100 text-teal-700',
      OT: 'bg-slate-100 text-slate-700'
    }
    return modality ? (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[modality] || 'bg-slate-100 text-slate-700'}`}>
        {modality}
      </span>
    ) : '-'
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Radiology Procedures</h1>
          <p className="text-sm text-slate-500 mt-1">Master data for radiology procedures with LOINC codes</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-shadow"
                  placeholder={t('Search code, name, LOINC, body part...')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`inline-flex items-center px-3 py-2.5 border rounded-lg text-sm font-medium transition-colors ${
                    showFilters || hasActiveFilters 
                      ? 'border-blue-500 bg-blue-50 text-blue-700' 
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FunnelIcon className="w-4 h-4 mr-2" />
                  {t('Filters')}
                  {hasActiveFilters && (
                    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-blue-600 text-white rounded-full">
                      {[searchQuery, ...Object.values(filters)].filter(Boolean).length}
                    </span>
                  )}
                </button>

                <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-2 ${viewMode === 'table' ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                    title="Table view"
                  >
                    <Bars3Icon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-3 py-2 ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                    title="Grid view"
                  >
                    <Squares2X2Icon className="w-5 h-5" />
                  </button>
                </div>

                <button
                  onClick={load}
                  className="inline-flex items-center px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-medium bg-white text-slate-700 hover:bg-slate-50"
                >
                  <ArrowPathIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  {t('Refresh')}
                </button>

                <Link
                  to="/procedures/new"
                  className="inline-flex items-center px-4 py-2.5 border border-transparent rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                >
                  <PlusIcon className="w-4 h-4 mr-2" />
                  {t('Add Procedure')}
                </Link>
              </div>
            </div>

            {showFilters && (
              <div className="mt-4 p-4 bg-white rounded-lg border border-slate-200 animate-fadeIn">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-slate-700">Filter Options</h3>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Modality</label>
                    <select
                      className="block w-full border border-slate-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={filters.modality}
                      onChange={e => setFilters(prev => ({ ...prev, modality: e.target.value }))}
                    >
                      <option value="">All Modalities</option>
                      {MODALITIES.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
                    <select
                      className="block w-full border border-slate-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={filters.category}
                      onChange={e => setFilters(prev => ({ ...prev, category: e.target.value }))}
                    >
                      <option value="">All Categories</option>
                      {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-8">
              <div className="animate-pulse space-y-4">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-12 bg-slate-100 rounded" />
                ))}
              </div>
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('code')}>
                      <div className="flex items-center">
                        Code <SortIcon columnKey="code" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('name')}>
                      <div className="flex items-center">
                        Name <SortIcon columnKey="name" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('loinc_code')}>
                      <div className="flex items-center">
                        LOINC <SortIcon columnKey="loinc_code" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('modality')}>
                      <div className="flex items-center">
                        Modality <SortIcon columnKey="modality" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Body Part
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        <BeakerIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                        <p className="text-lg font-medium text-slate-500">No procedures found</p>
                        <p className="text-sm mt-1">{searchQuery ? 'Try a different search term' : 'Add a new procedure to get started'}</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((p, index) => {
                      const rowKey = p.id || p.code || index
                      return (
                        <tr key={rowKey} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-mono text-sm text-slate-600">{p.code}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-slate-900">{p.name}</div>
                            {p.category && (
                              <div className="text-xs text-slate-500 mt-0.5">{p.category}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {p.loinc_code ? (
                              <div className="flex items-center">
                                <span className="font-mono text-xs text-slate-600" title={p.loinc_display || p.loinc_code}>
                                  {p.loinc_code}
                                </span>
                                <button
                                  onClick={() => navigator.clipboard.writeText(p.loinc_code)}
                                  className="ml-1.5 text-slate-400 hover:text-blue-600"
                                  title="Copy LOINC code"
                                >
                                  <DocumentTextIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <ModalityBadge modality={p.modality} />
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-600">{p.body_part || '-'}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {p.duration_minutes ? (
                              <div className="flex items-center text-sm text-slate-600">
                                <ClockIcon className="w-4 h-4 mr-1 text-slate-400" />
                                {p.duration_minutes} min
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="inline-flex justify-center gap-1">
                              <button
                                onClick={() => nav(`/procedures/${p.id || p.code}`)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View procedure"
                              >
                                <EyeIcon className="w-4 h-4" />
                              </button>
                              <Link
                                to={`/procedures/${p.id || p.code}`}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit procedure"
                              >
                                <PencilSquareIcon className="w-4 h-4" />
                              </Link>
                              <button
                                onClick={() => onDelete(p)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete procedure"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedData.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <BeakerIcon className="w-16 h-16 mx-auto mb-3 text-slate-300" />
                    <p className="text-lg font-medium text-slate-500">No procedures found</p>
                  </div>
                ) : (
                  paginatedData.map((p, index) => {
                    const rowKey = p.id || p.code || index
                    return (
                      <div 
                        key={rowKey} 
                        className="relative bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-slate-900 truncate">{p.name}</h3>
                            <p className="text-xs font-mono text-slate-500 mt-0.5">{p.code}</p>
                          </div>
                          <ModalityBadge modality={p.modality} />
                        </div>
                        
                        <div className="space-y-2 text-xs text-slate-600">
                          {p.loinc_code && (
                            <div className="flex items-center">
                              <DocumentTextIcon className="w-3.5 h-3.5 mr-2 text-slate-400" />
                              <span className="font-mono">{p.loinc_code}</span>
                            </div>
                          )}
                          {p.body_part && (
                            <div className="text-slate-500">
                              Body Part: {p.body_part}
                            </div>
                          )}
                          {p.duration_minutes && (
                            <div className="flex items-center">
                              <ClockIcon className="w-3.5 h-3.5 mr-2 text-slate-400" />
                              {p.duration_minutes} min
                            </div>
                          )}
                          {p.category && (
                            <div className="text-slate-500">
                              Category: {p.category}
                            </div>
                          )}
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <button
                            onClick={() => nav(`/procedures/${p.id || p.code}`)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            View Details
                          </button>
                          <div className="flex gap-1">
                            <Link
                              to={`/procedures/${p.id || p.code}`}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                              title="Edit"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => onDelete(p)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-slate-500">
                Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length} procedures
                {filtered.length !== rows.length && (
                  <span className="text-slate-400"> (filtered from {rows.length} total)</span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Rows per page:</span>
                  <select
                    className="border border-slate-300 rounded-md py-1.5 px-2 text-sm focus:ring-2 focus:ring-blue-500"
                    value={pageSize}
                    onChange={e => setPageSize(Number(e.target.value))}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'border border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-slate-500 text-right">
          Total: <span className="font-medium text-slate-700">{rows.length}</span> procedures
        </div>
      </div>
    </div>
  )
}