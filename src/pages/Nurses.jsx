import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { 
  PlusIcon,
  EyeIcon,
  Squares2X2Icon,
  Bars3Icon,
  DocumentTextIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import * as nurseService from '../services/nurseService'
import { useToast } from '../components/ToastProvider'
import DataTable from '../components/common/DataTable'

export default function Nurses() {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState('table')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const nav = useNavigate()
  const toast = useToast()

  const fetchNurses = async ({ search, filters, page, page_size }) => {
    try {
      const params = {
        search,
        active: filters.active === 'no' ? true : (filters.active === 'yes' ? false : undefined),
        page,
        page_size
      }
      const data = await nurseService.listNurses(params)
      return { 
        items: data.items || [], 
        total: data.total || 0 
      }
    } catch (err) {
      toast.error('Failed to fetch nurses')
      return { items: [], total: 0 }
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this nurse?')) return
    try {
      await nurseService.deleteNurse(id)
      toast.success('Nurse deleted successfully')
      setRefreshTrigger(prev => prev + 1)
    } catch (err) {
      toast.error('Failed to delete nurse')
    }
  }

  const columns = [
    {
      key: 'name',
      label: t('Nurse Name'),
      sortable: true,
      render: (val, row) => (
        <div className="flex items-center">
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 font-bold">
            {val?.charAt(0)}
          </div>
          <div className="ml-3">
            <div className="text-sm font-medium text-gray-900">{val}</div>
            <div className="text-xs text-gray-500">{row.license_number || '-'}</div>
          </div>
        </div>
      )
    },
    {
      key: 'phone',
      label: t('Phone'),
      sortable: true
    },
    {
      key: 'national_id',
      label: t('NIK/KTP'),
      sortable: true
    },
    {
      key: 'ihs_number',
      label: t('IHS Number'),
      sortable: true,
      render: (val) => val ? (
        <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{val}</span>
      ) : '-'
    },
    {
      key: 'status',
      label: t('Status'),
      render: (_, row) => (
        <div className="flex gap-1">
          {row.active === false ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600 font-bold uppercase">Inactive</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700 font-bold uppercase">Active</span>
          )}
        </div>
      )
    }
  ];

  const tableActions = (n) => (
    <div className="flex justify-end gap-2">
      <button onClick={() => nav(`/nurses/${n.id}`)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
        <EyeIcon className="w-4 h-4" />
      </button>
      <button onClick={() => nav(`/nurses/${n.id}/edit`)}
              className="p-1 text-indigo-600 hover:bg-indigo-50 rounded">
        <DocumentTextIcon className="w-4 h-4" />
      </button>
      <button onClick={() => handleDelete(n.id)}
              className="p-1 text-red-600 hover:bg-red-50 rounded">
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Nurse Directory')}</h1>
          <p className="text-sm text-slate-500">Manage nursing staff records</p>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-lg overflow-hidden bg-white">
             <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-gray-100' : ''}`}><Bars3Icon className="w-5 h-5"/></button>
             <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-gray-100' : ''}`}><Squares2X2Icon className="w-5 h-5"/></button>
          </div>
          <Link to="/nurses/new" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all">
            <PlusIcon className="w-5 h-5 mr-2" />
            {t('Add Nurse')}
          </Link>
        </div>
      </div>

      <DataTable
        key={refreshTrigger}
        columns={columns}
        fetchData={fetchNurses}
        actions={tableActions}
        searchPlaceholder="Search name or license..."
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
