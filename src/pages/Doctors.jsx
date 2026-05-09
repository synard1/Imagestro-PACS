import { useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { 
  PlusIcon,
  EyeIcon,
  EyeSlashIcon,
  Squares2X2Icon,
  Bars3Icon,
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'
import { ExclamationTriangleIcon as ExclamationTriangleSolidIcon } from '@heroicons/react/24/solid'       
import * as doctorService from '../services/doctorService'
import { isDoctorProtected } from '../services/api'
import { useToast } from '../components/ToastProvider'
import DataTable from '../components/common/DataTable'

export default function Doctors() {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState('table')
  const [showSensitiveData, setShowSensitiveData] = useState({})
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const nav = useNavigate()
  const toast = useToast()

  const fetchDoctors = async ({ search, filters }) => {
    const params = {
      active: filters.active === 'yes' ? false : filters.active === 'no' ? true : undefined,
    }
    const data = await doctorService.listDoctors(params)
    let result = Array.isArray(data) ? data.filter(d => d && (d.id || d.license) && !d._meta) : []
    
    // Client side filtering for advanced fields
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(d =>
        d.name?.toLowerCase().includes(q) ||
        d.license?.toLowerCase().includes(q) ||
        d.national_id?.includes(q) ||
        d.specialty?.toLowerCase().includes(q)
      )
    }

    return { items: result, total: result.length }
  }

  const maskData = (data, type) => {
    if (!data) return '-'
    switch (type) {
      case 'nik':
        if (data.length >= 8) return `${data.substring(0, 4)}****${data.substring(data.length - 4)}`
        return '****'
      case 'license':
        if (data.length >= 4) return `${data.substring(0, 2)}****${data.substring(data.length - 2)}`      
        return '****'
      default:
        return data
    }
  }

  const toggleSensitive = (id, field) => {
    setShowSensitiveData(prev => ({ ...prev, [`${id}-${field}`]: !prev[`${id}-${field}`] }))
  }

  const columns = [
    { 
      key: 'name', 
      label: t('Doctor Name'),
      sortable: true,
      render: (val, row) => (
        <div className="flex items-center">
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500 font-bold">
            {val?.charAt(0)}
          </div>
          <div className="ml-3">
            <div className="text-sm font-medium text-gray-900">{val}</div>
            <div className="text-xs text-gray-500">
              {showSensitiveData[`${row.id}-license`] ? row.license : maskData(row.license, 'license')}
              <button onClick={() => toggleSensitive(row.id, 'license')} className="ml-1 text-blue-400">
                {showSensitiveData[`${row.id}-license`] ? <EyeSlashIcon className="w-3 h-3 inline"/> : <EyeIcon className="w-3 h-3 inline"/>}
              </button>
            </div>
          </div>
        </div>
      )
    },
    { 
      key: 'specialty', 
      label: t('Specialty'),
      sortable: true
    },
    {
      key: 'status',
      label: t('Status'),
      render: (_, row) => (
        <div className="flex gap-1">
          {isDoctorProtected(row) && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700 font-bold uppercase">STST</span>
          )}
          {row.active === false ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600 font-bold uppercase">Inactive</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700 font-bold uppercase">Active</span>
          )}
        </div>
      )
    }
  ];

  const tableActions = (d) => (
    <div className="flex justify-end gap-2">
      <button onClick={() => nav(`/doctors/${d.id}`)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
        <EyeIcon className="w-4 h-4" />
      </button>
      <button onClick={() => !isDoctorProtected(d) && nav(`/doctors/${d.id}/edit`)} 
              className={`p-1 rounded ${isDoctorProtected(d) ? 'text-gray-300' : 'text-indigo-600 hover:bg-indigo-50'}`}>
        <DocumentTextIcon className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Doctor Directory')}</h1>
          <p className="text-sm text-slate-500">View and manage clinical staff</p>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-lg overflow-hidden bg-white">
             <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-gray-100' : ''}`}><Bars3Icon className="w-5 h-5"/></button>
             <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-gray-100' : ''}`}><Squares2X2Icon className="w-5 h-5"/></button>
          </div>
          <Link to="/doctors/new" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all">
            <PlusIcon className="w-5 h-5 mr-2" />
            {t('Add Doctor')}
          </Link>
        </div>
      </div>

      <DataTable
        key={refreshTrigger}
        columns={columns}
        fetchData={fetchDoctors}
        actions={tableActions}
        searchPlaceholder="Search name, license, specialty..."
        filters={[
          { 
            key: 'active', 
            label: 'Status', 
            options: [
              { value: 'no', label: 'Active Only' },
              { value: 'yes', label: 'Include Inactive' }
            ] 
          }
        ]}
      />
    </div>
  )
}
