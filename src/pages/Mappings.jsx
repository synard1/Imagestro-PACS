import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  PlusIcon, 
  TrashIcon, 
  ArrowUpTrayIcon, 
  ArrowDownTrayIcon,
  TagIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline'
import * as mappingService from '../services/mappingService'
import { useToast } from '../components/ToastProvider'
import DataTable from '../components/common/DataTable'

export default function Mappings() {
  const [systems, setSystems] = useState([])
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const toast = useToast()

  useEffect(() => {
    mappingService.listExternalSystems().then(setSystems).catch(() => {})
  }, [])

  const fetchMappings = async ({ search, filters }) => {
    const data = await mappingService.listMappings({
      external_system_id: filters.system || undefined,
      mapping_type: filters.type || undefined
    })
    
    let result = Array.isArray(data) ? data : []
    
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(m => 
        m.external_code?.toLowerCase().includes(q) ||
        m.pacs_code?.toLowerCase().includes(q) ||
        m.pacs_name?.toLowerCase().includes(q)
      )
    }

    return { items: result, total: result.length }
  }

  const handleRefresh = () => setRefreshTrigger(p => p + 1)

  const onDelete = async (m) => {
    if (!confirm(`Delete mapping ${m.external_code} → ${m.pacs_code || m.pacs_procedure_id}?`)) return
    try {
      await mappingService.deleteMapping(m.id)
      toast.notify({ type: 'success', message: 'Mapping deleted' })
      handleRefresh()
    } catch (e) {
      toast.notify({ type: 'error', message: `Failed to delete: ${e.message}` })
    }
  }

  const onImport = async (evt) => {
    const file = evt.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const mappings = Array.isArray(json) ? json : (json.mappings || [])
      const res = await mappingService.bulkImport(mappings)
      toast.notify({ type: 'success', message: 'Import completed' })
      handleRefresh()
    } catch (e) {
      toast.notify({ type: 'error', message: `Import failed: ${e.message}` })
    } finally {
      evt.target.value = ''
    }
  }

  const columns = [
    { 
      key: 'external_code', 
      label: 'External Code',
      sortable: true,
      render: (val, row) => (
        <div>
          <div className="font-bold text-gray-900">{val}</div>
          <div className="text-xs text-gray-500">System ID: {row.external_system_id}</div>
        </div>
      )
    },
    { 
      key: 'pacs_code', 
      label: 'PACS Procedure',
      sortable: true,
      render: (val, row) => (
        <div>
          <div className="font-medium text-blue-700">{val}</div>
          <div className="text-xs text-gray-500">{row.pacs_name}</div>
        </div>
      )
    },
    { 
      key: 'mapping_type', 
      label: 'Type',
      render: (val) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          val === 'exact' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
        }`}>
          {val}
        </span>
      )
    }
  ]

  const actions = (row) => (
    <div className="flex justify-end gap-2">
      <Link to={`/mappings/${row.id}/edit`} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded">
        <TagIcon className="w-4 h-4" />
      </Link>
      <button onClick={() => onDelete(row)} className="p-1 text-rose-600 hover:bg-rose-50 rounded">
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Procedure Mappings</h1>
          <p className="text-sm text-gray-500">Map external SIMRS codes to internal PACS procedures</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50">
            <ArrowUpTrayIcon className="w-5 h-5 mr-2" />
            Import
            <input type="file" className="hidden" accept=".json" onChange={onImport} />
          </label>
          <Link to="/mappings/new" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm">
            <PlusIcon className="w-5 h-5 mr-2" />
            New Mapping
          </Link>
        </div>
      </div>

      {/* Enhanced Mappings Notice */}
      <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-2 bg-indigo-100 rounded-lg">
            <GlobeAltIcon className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-indigo-900">
              Enhanced Mapping Management Available
            </h3>
            <p className="text-sm text-indigo-700 mt-1 max-w-2xl">
              We've created a new unified mapping interface with advanced filtering, 
              cross-system views, and better performance for large datasets.
            </p>
            <div className="mt-3">
              <Link 
                to="/mappings-enhanced" 
                className="inline-flex items-center text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Try Enhanced Mappings →
              </Link>
            </div>
          </div>
        </div>
      </div>

      <DataTable
        key={refreshTrigger}
        columns={columns}
        fetchData={fetchMappings}
        actions={actions}
        searchPlaceholder="Search codes or names..."
        filters={[
          {
            key: 'system',
            label: 'All Systems',
            options: systems.map(s => ({ value: s.id, label: s.system_name || s.id }))
          },
          {
            key: 'type',
            label: 'All Types',
            options: [
              { value: 'exact', label: 'Exact' },
              { value: 'regex', label: 'Regex' }
            ]
          }
        ]}
      />
    </div>
  )
}
