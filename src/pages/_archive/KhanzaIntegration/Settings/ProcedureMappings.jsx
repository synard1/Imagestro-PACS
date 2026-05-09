import { useState, useEffect } from 'react'
import { logger } from '../../../utils/logger'
import * as mappingService from '../../../services/khanzaMappingService'

/**
 * Procedure Mappings Page
 * 
 * Allows administrators to manage procedure code mappings between SIMRS Khanza and PACS:
 * - View all mappings with pagination
 * - Search and filter mappings
 * - Create new mappings
 * - Edit existing mappings
 * - Delete mappings
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

const VALID_MODALITIES = ['CR', 'CT', 'MR', 'US', 'XA', 'NM', 'PT', 'MG', 'DX', 'RF', 'OT']

export default function ProcedureMappings() {
  const [mappings, setMappings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Search and filter state
  const [search, setSearch] = useState('')
  const [modality, setModality] = useState('')
  const [isActive, setIsActive] = useState(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    khanza_code: '',
    khanza_name: '',
    pacs_code: '',
    pacs_name: '',
    modality: '',
    description: ''
  })
  const [formError, setFormError] = useState(null)
  const [formLoading, setFormLoading] = useState(false)

  // Load mappings on mount and when filters change
  useEffect(() => {
    loadMappings()
  }, [page, pageSize, search, modality, isActive])

  // Load mappings from backend
  const loadMappings = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await mappingService.listProcedureMappings({
        page,
        pageSize,
        search,
        modality: modality || undefined,
        isActive: isActive !== null ? isActive : undefined
      })

      setMappings(result.items || [])
      setTotal(result.total || 0)
      setTotalPages(result.totalPages || 0)

      logger.info('[ProcedureMappings]', `Loaded ${result.items?.length || 0} mappings`)
    } catch (err) {
      logger.error('[ProcedureMappings]', 'Failed to load mappings:', err.message)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Handle form field changes
  const handleFormChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    setFormError(null)
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      khanza_code: '',
      khanza_name: '',
      pacs_code: '',
      pacs_name: '',
      modality: '',
      description: ''
    })
    setEditingId(null)
    setFormError(null)
    setShowForm(false)
  }

  // Save mapping (create or update)
  const handleSaveMapping = async () => {
    setFormError(null)
    setFormLoading(true)

    try {
      // Validate required fields
      if (!formData.khanza_code?.trim()) {
        throw new Error('Khanza code is required')
      }
      if (!formData.khanza_name?.trim()) {
        throw new Error('Khanza name is required')
      }
      if (!formData.pacs_code?.trim()) {
        throw new Error('PACS code is required')
      }
      if (!formData.pacs_name?.trim()) {
        throw new Error('PACS name is required')
      }

      // Validate modality if provided
      if (formData.modality && !VALID_MODALITIES.includes(formData.modality.toUpperCase())) {
        throw new Error(`Invalid modality. Valid values: ${VALID_MODALITIES.join(', ')}`)
      }

      let result
      if (editingId) {
        // Update existing mapping
        result = await mappingService.updateProcedureMapping(editingId, formData)
        logger.info('[ProcedureMappings]', 'Mapping updated:', editingId)
      } else {
        // Create new mapping
        result = await mappingService.createProcedureMapping(formData)
        logger.info('[ProcedureMappings]', 'Mapping created:', result.id)
      }

      setSuccess(editingId ? 'Mapping updated successfully' : 'Mapping created successfully')
      resetForm()
      await loadMappings()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      logger.error('[ProcedureMappings]', 'Failed to save mapping:', err.message)
      setFormError(err.message)
    } finally {
      setFormLoading(false)
    }
  }

  // Edit mapping
  const handleEditMapping = (mapping) => {
    setFormData({
      khanza_code: mapping.khanza_code,
      khanza_name: mapping.khanza_name,
      pacs_code: mapping.pacs_code,
      pacs_name: mapping.pacs_name,
      modality: mapping.modality || '',
      description: mapping.description || ''
    })
    setEditingId(mapping.id)
    setShowForm(true)
  }

  // Delete mapping
  const handleDeleteMapping = async (id) => {
    if (!confirm('Are you sure you want to delete this mapping?')) {
      return
    }

    try {
      await mappingService.deleteProcedureMapping(id)
      logger.info('[ProcedureMappings]', 'Mapping deleted:', id)
      setSuccess('Mapping deleted successfully')
      await loadMappings()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      logger.error('[ProcedureMappings]', 'Failed to delete mapping:', err.message)
      setError(err.message)
    }
  }

  // Handle pagination
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage)
    }
  }

  // Handle search
  const handleSearch = (value) => {
    setSearch(value)
    setPage(1) // Reset to first page on search
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Procedure Mappings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Manage mappings between SIMRS Khanza procedure codes and PACS procedure codes
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <span className="text-red-600 mr-3">⚠️</span>
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Alert */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start">
            <span className="text-green-600 mr-3">✓</span>
            <div>
              <h3 className="font-semibold text-green-900">Success</h3>
              <p className="text-sm text-green-700 mt-1">{success}</p>
            </div>
          </div>
        </div>
      )}

      {/* Form Section */}
      {showForm && (
        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">
              {editingId ? 'Edit Mapping' : 'Create New Mapping'}
            </h3>
            <button
              onClick={resetForm}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Khanza Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Khanza Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.khanza_code}
                onChange={(e) => handleFormChange('khanza_code', e.target.value)}
                disabled={!!editingId}
                placeholder="e.g., XR001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
            </div>

            {/* Khanza Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Khanza Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.khanza_name}
                onChange={(e) => handleFormChange('khanza_name', e.target.value)}
                placeholder="e.g., Thorax AP/PA"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* PACS Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PACS Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.pacs_code}
                onChange={(e) => handleFormChange('pacs_code', e.target.value)}
                placeholder="e.g., CR-CHEST-PA"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* PACS Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PACS Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.pacs_name}
                onChange={(e) => handleFormChange('pacs_name', e.target.value)}
                placeholder="e.g., Chest X-ray PA View"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Modality */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Modality
              </label>
              <select
                value={formData.modality}
                onChange={(e) => handleFormChange('modality', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select modality...</option>
                {VALID_MODALITIES.map(mod => (
                  <option key={mod} value={mod}>{mod}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={resetForm}
              disabled={formLoading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveMapping}
              disabled={formLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {formLoading ? 'Saving...' : 'Save Mapping'}
            </button>
          </div>
        </div>
      )}

      {/* Search and Filter Section */}
      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by code or name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Modality Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Modality
            </label>
            <select
              value={modality}
              onChange={(e) => {
                setModality(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All modalities</option>
              {VALID_MODALITIES.map(mod => (
                <option key={mod} value={mod}>{mod}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={isActive === null ? '' : isActive ? 'active' : 'inactive'}
              onChange={(e) => {
                if (e.target.value === '') {
                  setIsActive(null)
                } else {
                  setIsActive(e.target.value === 'active')
                }
                setPage(1)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Add Button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Add New Mapping
          </button>
        )}
      </div>

      {/* Mappings Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading mappings...</div>
        ) : mappings.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No mappings found. {!showForm && <button onClick={() => setShowForm(true)} className="text-blue-600 hover:underline">Create one</button>}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Khanza Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Khanza Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">PACS Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">PACS Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Modality</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {mappings.map(mapping => (
                  <tr key={mapping.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-mono">{mapping.khanza_code}</td>
                    <td className="px-4 py-3 text-gray-700">{mapping.khanza_name}</td>
                    <td className="px-4 py-3 text-gray-900 font-mono">{mapping.pacs_code}</td>
                    <td className="px-4 py-3 text-gray-700">{mapping.pacs_name}</td>
                    <td className="px-4 py-3">
                      {mapping.modality ? (
                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                          {mapping.modality}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditMapping(mapping)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteMapping(mapping.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} mappings
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1 rounded text-sm ${
                        p === page
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
