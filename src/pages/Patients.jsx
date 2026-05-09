import { useEffect, useMemo, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
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
  EyeIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  DocumentArrowDownIcon,
  Squares2X2Icon,
  Bars3Icon,
  ExclamationTriangleIcon,
  UserIcon,
  CalendarIcon,
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon
} from '@heroicons/react/24/outline'
import { ExclamationTriangleIcon as ExclamationTriangleSolidIcon } from '@heroicons/react/24/solid'
import * as patientService from '../services/patientService'
import { api } from '../services/api'
import PatientActionButtons from '../components/PatientActionButtons'
import { useToast } from '../components/ToastProvider'
import PermissionGate from '../components/common/PermissionGate'

const ITEMS_PER_PAGE = 10

export default function Patients() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSensitiveData, setShowSensitiveData] = useState({})
  const [showIncompletePopup, setShowIncompletePopup] = useState(false)
  const [incompletePatients, setIncompletePatients] = useState([])
  const toast = useToast()
  const hasLoaded = useRef(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('table')
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    gender: '',
    hasNik: '',
    hasIhs: '',
    protected: ''
  })

  useEffect(() => { 
    if (!hasLoaded.current) {
      hasLoaded.current = true
      loadPatients()
    }
  }, [])

  const loadPatients = async () => {
    setLoading(true)
    try {
      const response = await patientService.listPatients()
      // Extract data correctly from new backend format: { status: 'success', data: [...] }
      const data = response?.data || response?.patients || response || []
      const patientData = Array.isArray(data) 
        ? data.filter(p => p && (p.id || p.patient_id || p.mrn || p.medical_record_number) && !p._meta) 
        : []
      setRows(patientData)

      const incomplete = patientData.map(p => {
        const missing = []
        if (!p.patient_id || p.patient_id.trim() === '') missing.push('NIK')
        if (!p.birth_date) missing.push('Birth Date')
        if (!p.gender) missing.push('Gender')
        if (!p.ihs_number || p.ihs_number.trim() === '') missing.push('IHS Number')
        return { ...p, missingFields: missing }
      }).filter(p => p.missingFields.length > 0)

      if (incomplete.length > 0) {
        setIncompletePatients(incomplete)
        setShowIncompletePopup(true)
      }
    } catch (e) {
      toast.notify({ type: 'error', message: 'Failed to load patients' })
    } finally {
      setLoading(false)
    }
  }

  const isPatientProtected = api.isPatientProtected

  const maskData = (data, type) => {
    if (!data) return '-'
    switch (type) {
      case 'nik':
        if (data.length >= 8) return `${data.substring(0, 4)}****${data.substring(data.length - 4)}`
        return '****'
      case 'ihs':
        if (data.length >= 6) return `${data.substring(0, 3)}****${data.substring(data.length - 3)}`
        return '****'
      case 'mrn':
        if (data.length >= 4) return `${data.substring(0, 2)}****${data.substring(data.length - 2)}`
        return '****'
      case 'phone':
        if (data.length >= 6) return `${data.substring(0, data.length - 3)}***`
        return '***'
      case 'birth_date':
        if (data && data.length >= 4) return `${data.substring(0, 4)}-**-**`
        return '****-**-**'
      default:
        return data
    }
  }

  const toggleSensitiveData = (rowId, fieldType) => {
    const key = `${rowId}-${fieldType}`
    setShowSensitiveData(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const isFieldVisible = (rowId, fieldType) => {
    const key = `${rowId}-${fieldType}`
    return !!showSensitiveData[key]
  }

  const filtered = useMemo(() => {
    let result = rows

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.mrn?.toLowerCase().includes(q) ||
        r.patient_id?.includes(q) ||
        r.ihs_number?.toLowerCase().includes(q) ||
        r.phone?.includes(q) ||
        r.email?.toLowerCase().includes(q)
      )
    }

    if (filters.gender) {
      result = result.filter(r => r.gender === filters.gender)
    }
    if (filters.hasNik === 'yes') {
      result = result.filter(r => r.patient_id && r.patient_id.trim() !== '')
    } else if (filters.hasNik === 'no') {
      result = result.filter(r => !r.patient_id || r.patient_id.trim() === '')
    }
    if (filters.hasIhs === 'yes') {
      result = result.filter(r => r.ihs_number && r.ihs_number.trim() !== '')
    } else if (filters.hasIhs === 'no') {
      result = result.filter(r => !r.ihs_number || r.ihs_number.trim() === '')
    }
    if (filters.protected === 'yes') {
      result = result.filter(r => isPatientProtected(r))
    } else if (filters.protected === 'no') {
      result = result.filter(r => !isPatientProtected(r))
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

  const onDelete = async (patient) => {
    if (isPatientProtected(patient)) {
      toast.notify({ type: 'warning', message: 'This patient data is protected for SATUSEHAT testing and cannot be deleted.' })
      return
    }
    if (!confirm(`Delete patient ${patient.name} (MRN: ${patient.mrn})?`)) return
    try {
      await patientService.deletePatient(patient.id || patient.mrn)
      toast.notify({ type: 'success', message: 'Patient deleted successfully' })
      loadPatients()
    } catch (e) {
      toast.notify({ type: 'error', message: `Failed to delete patient: ${e.message}` })
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilters({ gender: '', hasNik: '', hasIhs: '', protected: '' })
  }

  const hasActiveFilters = searchQuery || Object.values(filters).some(v => v)

  const GenderBadge = ({ gender }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
      gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
    }`}>
      {gender === 'M' ? t('Male') : t('Female')}
    </span>
  )

  const ProtectedBadge = () => (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <ExclamationTriangleSolidIcon className="w-3 h-3 mr-1" />
      {t('Protected')}
    </span>
  )

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <span className="ml-1 text-slate-300">⇅</span>
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUpIcon className="w-4 h-4 ml-1 inline text-blue-600" />
      : <ChevronDownIcon className="w-4 h-4 ml-1 inline text-blue-600" />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{t('Patient Directory')}</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and view all registered patients</p>
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
                  placeholder={t('Search name, MRN, National ID, IHS number, phone, email...')}
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
                  onClick={loadPatients}
                  className="inline-flex items-center px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-medium bg-white text-slate-700 hover:bg-slate-50"
                >
                  <ArrowPathIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  {t('Refresh')}
                </button>

                <PermissionGate perm="patient.create">
                  <Link
                    to="/patients/new"
                    className="inline-flex items-center px-4 py-2.5 border border-transparent rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                  >
                    <PlusIcon className="w-4 h-4 mr-2" />
                    {t('Add Patient')}
                  </Link>
                </PermissionGate>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Gender</label>
                    <select
                      className="block w-full border border-slate-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={filters.gender}
                      onChange={e => setFilters(prev => ({ ...prev, gender: e.target.value }))}
                    >
                      <option value="">All</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Has NIK</label>
                    <select
                      className="block w-full border border-slate-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={filters.hasNik}
                      onChange={e => setFilters(prev => ({ ...prev, hasNik: e.target.value }))}
                    >
                      <option value="">All</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Has IHS Number</label>
                    <select
                      className="block w-full border border-slate-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={filters.hasIhs}
                      onChange={e => setFilters(prev => ({ ...prev, hasIhs: e.target.value }))}
                    >
                      <option value="">All</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Protected</label>
                    <select
                      className="block w-full border border-slate-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={filters.protected}
                      onChange={e => setFilters(prev => ({ ...prev, protected: e.target.value }))}
                    >
                      <option value="">All</option>
                      <option value="yes">Protected</option>
                      <option value="no">Not Protected</option>
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
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('mrn')}>
                      <div className="flex items-center">
                        {t('MRN')} <SortIcon columnKey="mrn" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('name')}>
                      <div className="flex items-center">
                        {t('Patient Name')} <SortIcon columnKey="name" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      {t('Contact')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('birth_date')}>
                      <div className="flex items-center">
                        {t('Birthdate')} <SortIcon columnKey="birth_date" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('gender')}>
                      <div className="flex items-center">
                        {t('Gender')} <SortIcon columnKey="gender" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      {t('Actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        <UserIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                        <p className="text-lg font-medium text-slate-500">No patients found</p>
                        <p className="text-sm mt-1">{searchQuery ? 'Try a different search term' : 'Add a new patient to get started'}</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((p, index) => {
                      const isProtected = isPatientProtected(p)
                      const rowKey = p.id || p.mrn || index
                      const displayName = p.name || p.patient_name || "-";
                      
                      return (
                        <tr 
                          key={rowKey} 
                          className={`transition-colors ${
                            isProtected 
                              ? '!bg-amber-100/40 hover:!bg-amber-100/60 border-l-4 !border-l-amber-500 shadow-sm' 
                              : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="font-mono text-sm text-slate-600">
                                {isFieldVisible(rowKey, 'mrn') ? p.mrn || '-' : maskData(p.mrn, 'mrn')}
                              </span>
                              {p.mrn && (
                                <button 
                                  onClick={() => toggleSensitiveData(rowKey, 'mrn')}
                                  className="ml-2 text-slate-400 hover:text-blue-600 transition-colors"
                                  title={isFieldVisible(rowKey, 'mrn') ? t("Hide MRN") : t("Show MRN")}
                                >
                                  {isFieldVisible(rowKey, 'mrn') 
                                    ? <EyeSlashIcon className="w-4 h-4" /> 
                                    : <EyeIcon className="w-4 h-4" />}
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {isFieldVisible(rowKey, 'nik') ? p.patient_id || '-' : maskData(p.patient_id, 'nik')}
                              {p.patient_id && (
                                <button 
                                  onClick={() => toggleSensitiveData(rowKey, 'nik')}
                                  className="ml-1 text-slate-400 hover:text-blue-600"
                                  title={isFieldVisible(rowKey, 'nik') ? t("Hide National ID") : t("Show National ID")}
                                >
                                  {isFieldVisible(rowKey, 'nik') 
                                    ? <EyeSlashIcon className="w-3 h-3 inline" /> 
                                    : <EyeIcon className="w-3 h-3 inline" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                                <UserIcon className="h-5 w-5 text-slate-400" />
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-slate-900">
                                  {displayName}
                                  {isProtected && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                      Protected
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500">
                                  IHS: {isFieldVisible(rowKey, 'ihs') ? p.ihs_number || '-' : maskData(p.ihs_number, 'ihs')}
                                  {p.ihs_number && (
                                    <button 
                                      onClick={() => toggleSensitiveData(rowKey, 'ihs')}
                                      className="ml-1 text-slate-400 hover:text-blue-600"
                                    >
                                      {isFieldVisible(rowKey, 'ihs') 
                                        ? <EyeSlashIcon className="w-3 h-3 inline" /> 
                                        : <EyeIcon className="w-3 h-3 inline" />}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-slate-600 space-y-1">
                              {p.phone && (
                                <div className="flex items-center text-xs">
                                  <PhoneIcon className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                                  {maskData(p.phone, 'phone')}
                                </div>
                              )}
                              {p.email && (
                                <div className="flex items-center text-xs">
                                  <EnvelopeIcon className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                                  <span className="truncate max-w-[150px]">{p.email}</span>
                                </div>
                              )}
                              {p.address && (
                                <div className="flex items-center text-xs">
                                  <MapPinIcon className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                                  <span className="truncate max-w-[150px]">{p.city || p.address}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center text-sm text-slate-600">
                              <CalendarIcon className="w-4 h-4 mr-1.5 text-slate-400" />
                              {isFieldVisible(rowKey, 'birth_date') ? p.birth_date || '-' : maskData(p.birth_date, 'birth_date')}
                              {p.birth_date && (
                                <button 
                                  onClick={() => toggleSensitiveData(rowKey, 'birth_date')}
                                  className="ml-1.5 text-slate-400 hover:text-blue-600"
                                >
                                  {isFieldVisible(rowKey, 'birth_date') 
                                    ? <EyeSlashIcon className="w-3.5 h-3.5" /> 
                                    : <EyeIcon className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <GenderBadge gender={p.gender} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <PatientActionButtons
                              patient={p}
                              onDelete={onDelete}
                              isProtected={isProtected}
                            />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedData.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <UserIcon className="w-16 h-16 mx-auto mb-3 text-slate-300" />
                    <p className="text-lg font-medium text-slate-500">No patients found</p>
                  </div>
                ) : (
                  paginatedData.map((p, index) => {
                    const isProtected = isPatientProtected(p)
                    const rowKey = p.id || p.mrn || index
                    return (
                      <div 
                        key={rowKey} 
                        className={`relative bg-white rounded-xl border p-4 hover:shadow-md transition-shadow ${
                          isProtected ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
                        }`}
                      >
                        {isProtected && (
                          <div className="absolute top-3 right-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                              <ExclamationTriangleSolidIcon className="w-3 h-3 mr-1" />
                              Protected
                            </span>
                          </div>
                        )}
                        <div className="flex items-start mb-3">
                          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <UserIcon className="h-6 w-6 text-slate-400" />
                          </div>
                          <div className="ml-3 min-w-0">
                            <h3 className="text-sm font-semibold text-slate-900 truncate">{p.name}</h3>
                            <p className="text-xs font-mono text-slate-500">MRN: {p.mrn}</p>
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-xs text-slate-600">
                          {p.birth_date && (
                            <div className="flex items-center">
                              <CalendarIcon className="w-3.5 h-3.5 mr-2 text-slate-400" />
                              {p.birth_date}
                            </div>
                          )}
                          {p.phone && (
                            <div className="flex items-center">
                              <PhoneIcon className="w-3.5 h-3.5 mr-2 text-slate-400" />
                              {maskData(p.phone, 'phone')}
                            </div>
                          )}
                          {p.email && (
                            <div className="flex items-center">
                              <EnvelopeIcon className="w-3.5 h-3.5 mr-2 text-slate-400" />
                              <span className="truncate">{p.email}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <GenderBadge gender={p.gender} />
                          <PatientActionButtons
                            patient={p}
                            onDelete={onDelete}
                            isProtected={protectedPatient}
                            compact
                          />
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
                Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length} patients
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

        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-100 border border-amber-300"></span>
              <span>Protected (SATUSEHAT)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-100 border border-blue-300"></span>
              <span>Male</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-pink-100 border border-pink-300"></span>
              <span>Female</span>
            </div>
          </div>
          <div>
            Total: <span className="font-medium text-slate-700">{rows.length}</span> patients
          </div>
        </div>
      </div>

      {showIncompletePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden transform animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-200 bg-amber-50">
              <h3 className="text-lg font-semibold text-amber-800 flex items-center gap-2">
                <ExclamationTriangleSolidIcon className="w-5 h-5" />
                {t('Incomplete Patient Records')}
              </h3>
            </div>
            
            <div className="px-6 py-5">
              <p className="text-slate-600 mb-4">
                The following patients have missing required information. Please update their records to ensure data completeness and compliance.
              </p>
              
              <div className="max-h-60 overflow-y-auto border rounded-lg">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">{t('MRN')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">{t('Patient Name')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Missing</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">{t('Action')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {incompletePatients.slice(0, 10).map(p => (
                      <tr key={p.id || p.mrn}>
                        <td className="px-4 py-2 text-sm font-mono text-slate-600">{p.mrn}</td>
                        <td className="px-4 py-2 text-sm text-slate-900">{p.name}</td>
                        <td className="px-4 py-2 text-sm text-red-600">
                          {p.missingFields.join(', ')}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link 
                            to={`/patients/${p.id || p.mrn}`}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            onClick={() => setShowIncompletePopup(false)}
                          >
                            Edit
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {incompletePatients.length > 10 && (
                <p className="text-sm text-slate-500 mt-2">...and {incompletePatients.length - 10} more</p>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowIncompletePopup(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}