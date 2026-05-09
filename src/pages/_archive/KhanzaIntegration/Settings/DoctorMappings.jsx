import { useState, useEffect } from 'react'
import { logger } from '../../../utils/logger'
import * as mappingService from '../../../services/khanzaMappingService'

/**
 * Doctor Mappings Page
 * 
 * Allows administrators to manage doctor mappings between SIMRS Khanza and PACS:
 * - View all doctor mappings with pagination
 * - Search and filter mappings
 * - Create new mappings
 * - Edit existing mappings
 * - Delete mappings
 * - Show auto-created indicator
 * 
 * Requirements: 7.1, 7.4
 */

export default function DoctorMappings() {
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
  const [autoCreated, setAutoCreated] = useState(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    khanza_code: '',
    khanza_name: '',
    pacs_doctor_id: ''
  })
  const [formError, setFormError] = useState(null)
  const [formLoading, setFormLoading] = useState(false)

  // Load mappings on mount and when filters change
  useEffect(() => {
    loadMappings()
  }, [page, pageSize, search, autoCreated])

  // Load mappings from backend
  const loadMappings = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await mappingService.listDoctorMappings({
        page,
        pageSize,
        search,
        autoCreated: autoCreated !== null ? autoCreated : undefined
      })

      setMappings(result.items || [])
      setTotal(result.total || 0)
      setTotalPages(result.totalPages || 0)

      logger.info('[DoctorMappings]', `Loaded ${result.items?.length || 0} mappings`)
    } catch (err) {
      logger.error('[DoctorMappings]', 'Failed to load mappings:', err.message)
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
      pacs_doctor_id: ''
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
        throw new Error('Khanza doctor code is required')
      }
      if (!formData.khanza_name?.trim()) {
        throw new Error('Khanza doctor name is required')
      }
      if (!formData.pacs_doctor_id?.trim()) {
        throw new Error('PACS doctor ID is required')
      }

      let result
      if (editingId) {
        // Update existing mapping
        result = await mappingService.updateDoctorMapping(editingId, formData)
        logger.info('[DoctorMappings]', 'Mapping updated:', editingId)
      } else {
        // Create new mapping
        result = await mappingService.createDoctorMapping(formData)
        logger.info('[DoctorMappings]', 'Mapping created:', result.id)
      }

      setSuccess(editingId ? 'Mapping updated successfully' : 'Mapping created successfully')
      resetForm()
      await loadMappings()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      logger.error('[DoctorMappings]', 'Failed to save mapping:', err.message)
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
      pacs_doctor_id: mapping.pacs_doctor_id || ''
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
      await mappingService.deleteDoctorMapping(id)
      logger.info('[DoctorMappings]', 'Mapping deleted:', id)
      setSuccess('Mapping deleted successfully')
      await loadMappings()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      logger.error('[DoctorMappings]', 'Failed to delete mapping:', err.message)
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
        <h2 className="text-xl font-semibold text-gray-900">Doctor Mappings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Manage mappings between SIMRS Khanza doctors and PACS doctor records
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
                Khanza Doctor Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.khanza_code}
                onChange={(e) => handleFormChange('khanza_code', e.target.value)}
                disabled={!!editingId}
                placeholder="e.g., DOC001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
            </div>

            {/* Khanza Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Khanza Doctor Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.khanza_name}
                onChange={(e) => handleFormChange('khanza_name', e.target.value)}
                placeholder="e.g., Dr. John Doe"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* PACS Doctor ID */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PACS Doctor ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.pacs_doctor_id}
                onChange={(e) => handleFormChange('pacs_doctor_id', e.target.value)}
                placeholder="e.g., doc-uuid-or-id"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                The ID of the corresponding doctor record in PACS
              </p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          {/* Auto-Created Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Creation Type
            </label>
            <select
              value={autoCreated === null ? '' : autoCreated ? 'auto' : 'manual'}
              onChange={(e) => {
                if (e.target.value === '') {
                  setAutoCreated(null)
                } else {
                  setAutoCreated(e.target.value === 'auto')
                }
                setPage(1)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All mappings</option>
              <option value="manual">Manually Created</option>
              <option value="auto">Auto-Created</option>
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
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">PACS Doctor ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Created</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {mappings.map(mapping => (
                  <tr key={mapping.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-mono">{mapping.khanza_code}</td>
                    <td className="px-4 py-3 text-gray-700">{mapping.khanza_name}</td>
                    <td className="px-4 py-3 text-gray-900 font-mono text-xs">{mapping.pacs_doctor_id}</td>
                    <td className="px-4 py-3">
                      {mapping.auto_created ? (
                        <span className="inline-block px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-semibold">
                          Auto-Created
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                          Manual
                        </span>
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

      {/* Info Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">ℹ️ About Doctor Mappings</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Manual Mappings:</strong> Created by administrators to link specific doctors</li>
          <li>• <strong>Auto-Created Mappings:</strong> Automatically created during order import when a doctor is not found</li>
          <li>• Auto-created mappings can be edited to link to existing PACS doctors</li>
          <li>• Deleting a mapping will not affect existing orders that used it</li>
        </ul>
      </div>
    </div>
  )
}
