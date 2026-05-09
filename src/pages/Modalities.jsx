import { useEffect, useState, useMemo, useCallback } from 'react';
import { useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel } from '@tanstack/react-table';
import { api } from '../services/api';
import { useToast } from '../components/ToastProvider';
import { useConfirm } from '../components/ConfirmDialog';
import ModalityModal from './Modalities/ModalityModal';

// Modality type color mapping
const MODALITY_COLORS = {
  CT: 'bg-blue-100 text-blue-800',
  MR: 'bg-purple-100 text-purple-800',
  US: 'bg-cyan-100 text-cyan-800',
  CR: 'bg-amber-100 text-amber-800',
  DR: 'bg-orange-100 text-orange-800',
  DX: 'bg-yellow-100 text-yellow-800',
  XA: 'bg-violet-100 text-violet-800',
  MG: 'bg-pink-100 text-pink-800',
  NM: 'bg-lime-100 text-lime-800',
  PT: 'bg-emerald-100 text-emerald-800',
  RF: 'bg-teal-100 text-teal-800',
  OT: 'bg-gray-100 text-gray-800',
};

export default function Modalities() {
  const toast = useToast();
  const confirm = useConfirm();

  // State
  const [modalities, setModalities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalityFilter, setModalityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'inactive'
  const [modal, setModal] = useState({ open: false, mode: 'create', modality: null });
  const [testingId, setTestingId] = useState(null);

  // Load modalities
  const loadModalities = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listModalities();
      // Filter to only MODALITY nodes (backend should already filter, but ensure)
      const modalityNodes = (data || []).filter(m => m.node_type === 'MODALITY' || m.modality);
      setModalities(modalityNodes);
    } catch (err) {
      toast.error(`Failed to load modalities: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadModalities();
  }, [loadModalities]);

  // Filtered modalities (client-side)
  const filteredModalities = useMemo(() => {
    let result = modalities;

    // Search filter (ae_title, name, manufacturer, model, host)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(m =>
        (m.ae_title?.toLowerCase() || '').includes(query) ||
        (m.name?.toLowerCase() || '').includes(query) ||
        (m.manufacturer?.toLowerCase() || '').includes(query) ||
        (m.model?.toLowerCase() || '').includes(query) ||
        (m.host?.toLowerCase() || '').includes(query)
      );
    }

    // Modality type filter
    if (modalityFilter) {
      result = result.filter(m => m.modality === modalityFilter);
    }

    // Status filter
    if (statusFilter === 'active') {
      result = result.filter(m => m.is_active);
    } else if (statusFilter === 'inactive') {
      result = result.filter(m => !m.is_active);
    }

    return result;
  }, [modalities, searchQuery, modalityFilter, statusFilter]);

  // Extract unique modality types for filter dropdown
  const modalityTypes = useMemo(() => {
    const types = [...new Set(modalities.map(m => m.modality).filter(Boolean))];
    return types.sort();
  }, [modalities]);

  // Handlers
  const handleCreate = () => {
    setModal({ open: true, mode: 'create', modality: null });
  };

  const handleEdit = (modality) => {
    setModal({ open: true, mode: 'edit', modality });
  };

  const handleView = (modality) => {
    setModal({ open: true, mode: 'view', modality });
  };

  const handleSubmit = async (formData) => {
    try {
      if (modal.mode === 'create') {
        await api.createModality(formData);
        toast.success('Modality created successfully');
      } else if (modal.mode === 'edit') {
        await api.updateModality(modal.modality.id, formData);
        toast.success('Modality updated successfully');
      }
      await loadModalities();
    } catch (err) {
      toast.error(`Failed to save modality: ${err.message}`);
      throw err; // Re-throw to keep modal open
    }
  };

  const handleDelete = async (modality) => {
    const confirmed = await confirm.danger(
      `Are you sure you want to delete modality "${modality.name}" (${modality.ae_title})?`,
      {
        title: 'Delete Modality',
        confirmText: 'Delete',
      }
    );

    if (confirmed) {
      try {
        await api.deleteModality(modality.id);
        toast.success('Modality deleted successfully');
        await loadModalities();
      } catch (err) {
        toast.error(`Failed to delete modality: ${err.message}`);
      }
    }
  };

  const handleTestConnection = async (modality) => {
    setTestingId(modality.id);
    try {
      const result = await api.testModalityConnection(modality.id);
      const { success, message, response_time_ms } = result;
      if (success) {
        toast.success(`Connection successful! Response time: ${response_time_ms}ms`);
        // Refresh to get updated is_online, last_echo
        await loadModalities();
      } else {
        toast.error(`Connection failed: ${message || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error(`Connection test failed: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleCloseModal = () => {
    setModal(prev => ({ ...prev, open: false, modality: null }));
  };

  // Table columns definition
  const columns = useMemo(() => [
    {
      accessorKey: 'modality',
      header: 'Type',
      cell: ({ row }) => {
        const modality = row.getValue('modality');
        const colorClass = MODALITY_COLORS[modality] || 'bg-gray-100 text-gray-800';
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
            {modality}
          </span>
        );
      },
    },
    {
      accessorKey: 'ae_title',
      header: 'AE Title',
      cell: ({ row }) => (
        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 font-mono">
          {row.getValue('ae_title')}
        </code>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">{row.getValue('name')}</span>
      ),
    },
    {
      accessorKey: 'host',
      header: 'Host',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 font-mono">{row.getValue('host')}</span>
      ),
    },
    {
      accessorKey: 'port',
      header: 'Port',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.getValue('port')}</span>
      ),
    },
    {
      accessorKey: 'manufacturer',
      header: 'Manufacturer',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.getValue('manufacturer') || '-'}</span>
      ),
    },
    {
      accessorKey: 'model',
      header: 'Model',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.getValue('model') || '-'}</span>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Enabled',
      cell: ({ row }) => {
        const isActive = row.getValue('is_active');
        return isActive ? (
          <span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded-full text-xs font-medium">Yes</span>
        ) : (
          <span className="bg-red-100 text-red-800 px-2.5 py-0.5 rounded-full text-xs font-medium">No</span>
        );
      },
    },
    {
      accessorKey: 'is_online',
      header: 'Status',
      cell: ({ row }) => {
        const isOnline = row.getValue('is_online');
        return isOnline ? (
          <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-xs font-medium">Online</span>
        ) : (
          <span className="bg-gray-100 text-gray-800 px-2.5 py-0.5 rounded-full text-xs font-medium">Offline</span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const modality = row.original;
        const isTesting = testingId === modality.id;
        return (
          <div className="flex items-center gap-2">
            {/* View Button */}
            <button
              onClick={() => handleView(modality)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="View Details"
              disabled={isTesting}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>

            {/* Edit Button */}
            <button
              onClick={() => handleEdit(modality)}
              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              title="Edit Modality"
              disabled={isTesting}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>

            {/* Test Connection Button */}
            <button
              onClick={() => handleTestConnection(modality)}
              disabled={isTesting}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
              title="Test Connection"
            >
              {isTesting ? (
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
              )}
            </button>

            {/* Delete Button */}
            <button
              onClick={() => handleDelete(modality)}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Delete Modality"
              disabled={isTesting}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        );
      },
    },
  ], [testingId, toast, confirm, handleDelete, handleTestConnection, handleEdit, handleView]);

  // Table instance
  const table = useReactTable({
    data: filteredModalities,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
        pageIndex: 0,
      },
    },
  });

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setModalityFilter('');
    setStatusFilter('all');
    table.setPageIndex(0);
  };

  const activeFilterCount = [searchQuery, modalityFilter, statusFilter !== 'all'].filter(Boolean).length;

  return (
    <div className="container mx-auto p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Modalities</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage DICOM modalities and their configurations
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadModalities}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Create Modality
          </button>
        </div>
      </div>

      {/* Toolbar - Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Search */}
          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                table.setPageIndex(0);
              }}
              placeholder="Search by AE Title, Name, Host..."
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Modality Filter */}
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Modality Type</label>
            <select
              value={modalityFilter}
              onChange={(e) => {
                setModalityFilter(e.target.value);
                table.setPageIndex(0);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              {modalityTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                table.setPageIndex(0);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div className="md:col-span-2">
            <button
              onClick={clearFilters}
              disabled={activeFilterCount === 0}
              className="w-full px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Active filters display */}
        {activeFilterCount > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-gray-500">Active filters:</span>
            {searchQuery && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                Search: "{searchQuery}"
              </span>
            )}
            {modalityFilter && (
              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                Type: {modalityFilter}
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                Status: {statusFilter}
              </span>
            )}
            <span className="text-gray-500 text-xs">({filteredModalities.length} results)</span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading && modalities.length === 0 ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading modalities...</p>
          </div>
        ) : filteredModalities.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-gray-500 text-6xl mb-4">🏥</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No modalities found</h3>
            <p className="text-gray-500">
              {modalities.length === 0
                ? "No modalities configured. Create your first modality to get started."
                : "Try adjusting your search or filters."}
            </p>
            {modalities.length === 0 && (
              <button
                onClick={handleCreate}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create First Modality
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th
                          key={header.id}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <div className="flex items-center gap-1">
                            {header.column.columnDef.header}
                            {header.column.getIsSorted() && (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {header.column.getIsSorted() === 'asc' ? (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                ) : (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                )}
                              </svg>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.original.id} className="hover:bg-gray-50 transition-colors">
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
                {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filteredModalities.length)} of{' '}
                {filteredModalities.length} modalities
              </div>
              <div className="flex items-center gap-4">
                {/* Page Size Selector */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Rows per page:</label>
                  <select
                    value={table.getState().pagination.pageSize}
                    onChange={(e) => {
                      table.setPageSize(Number(e.target.value));
                    }}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  >
                    {[5, 10, 20, 50, 100].map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>

                {/* Pagination Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                    className="px-3 py-1 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="px-3 py-1 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                  </span>
                  <button
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="px-3 py-1 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                    className="px-3 py-1 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      <ModalityModal
        isOpen={modal.open}
        mode={modal.mode}
        modality={modal.modality}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        loading={loading}
      />
    </div>
  );
}

// Helper function for TanStack Table
function flexRender(Component, props) {
  if (!Component) return null;
  if (typeof Component === 'string') {
    return <Component {...props} />;
  }
  return <Component {...props} />;
}
