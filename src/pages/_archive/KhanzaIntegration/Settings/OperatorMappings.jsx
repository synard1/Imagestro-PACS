import { useState, useEffect } from 'react'
import { logger } from '../../../utils/logger'
import * as mappingService from '../../../services/khanzaMappingService'

/**
 * Operator User Mappings Page
 * 
 * Allows administrators to manage operator user mappings between PACS and SIMRS Khanza:
 * - View all operator mappings with pagination
 * - Search and filter mappings
 * - Create new mappings
 * - Edit existing mappings
 * - Delete mappings
 * - Display PACS user ID, PACS username, Khanza operator code, Khanza operator name
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

export default function OperatorMappings() {
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
  const [isActive, setIsActive] = useState(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    pacs_user_id: '',
    pacs_username: '',
    khanza_operator_code: '',
    khanza_operator_name: '',
    is_active: true
  })
  const [formError, setFormError] = useState(null)
  const [formLoading, setFormLoading] = useState(false)

  // Load mappings on mount and when filters change
  useEffect(() => {
    loadMappings()
  }, [page, pageSize, search, isActive])

  // Load mappings from backend
  const loadMappings = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await mappingService.listOperatorMappings({
        page,
        pageSize,
        search,
        isActive: isActive !== null ? isActive : undefined
      })

      setMappings(result.items || [])
      setTotal(result.total || 0)
      setTotalPages(result.totalPages || 0)

      logger.info('[OperatorMappings]', `Loaded ${result.items?.length || 0} mappings`)
    } catch (err) {
      logger.error('[OperatorMappings]', 'Failed to load mappings:', err.message)
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
      pacs_user_id: '',
      pacs_username: '',
      khanza_operator_code: '',
      khanza_operator_name: '',
      is_active: true
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
      if (!formData.pacs_user_id?.trim()) {
        throw new Error('PACS user ID is required')
      }
      if (!formData.pacs_username?.trim()) {
        throw new Error('PACS username is required')
      }
      if (!formData.khanza_operator_code?.trim()) {
        throw new Error('Khanza operator code is required')
      }
      if (!formData.khanza_operator_name?.trim()) {
        throw new Error('Khanza operator name is required')
      }

      let result
      if (editingId) {
        // Update existing mapping
        result = await mappingService.updateOperatorMapping(editingId, formData)
        logger.info('[OperatorMappings]', 'Mapping updated:', editingId)
      } else {
        // Create new mapping
        result = await mappingService.createOperatorMapping(formData)
        logger.info('[OperatorMappings]', 'Mapping created:', result.id)
      }

      setSuccess(editingId ? 'Mapping updated successfully' : 'Mapping created successfully')
      resetForm()
      await loadMappings()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      logger.error('[OperatorMappings]', 'Failed to save mapping:', err.message)
      setFormError(err.message)
    } finally {
      setFormLoading(false)
    }
  }

  // Edit mapping
  const handleEditMapping = (mapping) => {
    setFormData({
      pacs_user_id: mapping.pacs_user_id,
      pacs_username: mapping.pacs_username,
      khanza_operator_code: mapping.khanza_operator_code,
      khanza_operator_name: mapping.khanza_operator_name,
      is_active: mapping.is_active !== false
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
      await mappingService.deleteOperatorMapping(id)
      logger.info('[OperatorMappings]', 'Mapping deleted:', id)
      setSuccess('Mapping deleted successfully')
      await loadMappings()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      logger.error('[OperatorMappings]', 'Failed to delete mapping:', err.message)
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
        <h2 className="text-xl font-semibold text-gray-900">Operator User Mappings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Manage mappings between PACS users and SIMRS Khanza operators for audit trail and identification
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
            {/* PACS User ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PACS User ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.pacs_user_id}
                onChange={(e) => handleFormChange('pacs_user_id', e.target.value)}
                disabled={!!editingId}
                placeholder="e.g., user-uuid"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <p className="text-xs text-gray-500 mt-1">
                The unique ID of the PACS user
              </p>
            </div>

            {/* PACS Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PACS Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.pacs_username}
                onChange={(e) => handleFormChange('pacs_username', e.target.value)}
                placeholder="e.g., john.doe"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Khanza Operator Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Khanza Operator Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.khanza_operator_code}
                onChange={(e) => handleFormChange('khanza_operator_code', e.target.value)}
                placeholder="e.g., OP001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Khanza Operator Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Khanza Operator Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.khanza_operator_name}
                onChange={(e) => handleFormChange('khanza_operator_name', e.target.value)}
                placeholder="e.g., John Doe"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Active Status */}
            <div className="md:col-span-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => handleFormChange('is_active', e.target.checked)}
                  className="w-4 h-4 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  Active (enable this mapping)
                </span>
              </label>
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
              placeholder="Search by username or operator code..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">PACS Username</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">PACS User ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Khanza Operator Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Khanza Operator Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {mappings.map(mapping => (
                  <tr key={mapping.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{mapping.pacs_username}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">{mapping.pacs_user_id}</td>
                    <td className="px-4 py-3 text-gray-900 font-mono">{mapping.khanza_operator_code}</td>
                    <td className="px-4 py-3 text-gray-700">{mapping.khanza_operator_name}</td>
                    <td className="px-4 py-3">
                      {mapping.is_active !== false ? (
                        <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                          Active
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold">
                          Inactive
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
        <h3 className="font-semibold text-blue-900 mb-2">ℹ️ About Operator Mappings</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Each PACS user can be mapped to exactly one Khanza operator</li>
          <li>• When an order is imported, the currently logged-in operator name is recorded</li>
          <li>• If a mapping exists, the Khanza operator name is used; otherwise, the PACS username is used</li>
          <li>• Inactive mappings will not be used for new imports</li>
          <li>• Mappings are used for audit trail and examination record identification</li>
        </ul>
      </div>
    </div>
  )
}
