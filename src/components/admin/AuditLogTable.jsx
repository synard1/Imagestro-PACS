import React, { useState, useEffect, useCallback } from 'react';
import { 
  useReactTable, 
  getCoreRowModel, 
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Search, 
  RotateCw,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';
import { exportService } from '../../services/exportService';
import { useToast } from '../../components/ToastProvider';
import { fetchJson } from '../../services/http';

export default function AuditLogTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  
  // Pagination state
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Search state
  const [search, setSearch] = useState('');
  
  const toast = useToast();

  const fetchData = useCallback(async (signal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'EXPORT_DATA', // Mandatory as per documentation
        limit: pagination.pageSize,
        page: pagination.pageIndex + 1, // 1-based page
      });
      
      if (search) {
        params.append('username', search); // Use username for searching as per docs example
      }

      const response = await fetchJson(`/api/audit/logs?${params.toString()}`, { signal });
      setData(response.logs || []);
      setTotalRows(response.count || 0);
    } catch (error) {
      if (error.name === 'AbortError') return; // Ignore aborts
      console.error('Failed to fetch logs:', error);
      toast.error('Failed to load logs', error.message);
    } finally {
      setLoading(false);
    }
  }, [pagination.pageIndex, pagination.pageSize, search, toast]);

  useEffect(() => {
    const controller = new AbortController();
    
    // Debounce to prevent Strict Mode double-invocation network spam
    const timeoutId = setTimeout(() => {
      fetchData(controller.signal);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fetchData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportService.exportToExcel('audit-logs');
      toast.success('Logs exported successfully');
    } catch (error) {
      toast.error('Failed to export logs', error.message);
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      accessorKey: 'created_at',
      header: 'Timestamp',
      cell: info => format(new Date(info.getValue()), 'yyyy-MM-dd HH:mm:ss'),
    },
    {
      accessorKey: 'username',
      header: 'User',
      cell: info => info.getValue() || 'System',
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: info => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
          {info.getValue()}
        </span>
      ),
    },
    {
      accessorKey: 'resource_type',
      header: 'Resource',
    },
    {
      accessorKey: 'ip_address',
      header: 'IP Address',
    },
    {
      accessorKey: 'details',
      header: 'Details',
      cell: info => {
        const val = info.getValue();
        if (!val) return '-';
        return (
          <div className="max-w-xs truncate text-xs text-gray-500" title={JSON.stringify(val, null, 2)}>
            {typeof val === 'object' ? JSON.stringify(val) : val}
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data,
    columns,
    pageCount: Math.ceil(totalRows / pagination.pageSize),
    state: {
      pagination,
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search logs..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={fetchData}
            className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            title="Refresh"
          >
            <RotateCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 hover:text-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {exporting ? (
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download size={16} />
            )}
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} className="px-6 py-3 whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-8 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-2" />
                    <p>Loading logs...</p>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center">
                    <div className="p-3 bg-gray-100 rounded-full mb-3">
                      <Filter size={24} className="text-gray-400" />
                    </div>
                    <p className="font-medium text-gray-900">No logs found</p>
                    <p className="text-xs mt-1">Try adjusting your search criteria</p>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="border-t border-gray-200 p-4 bg-gray-50/50 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          Showing <span className="font-medium">{Math.min(pagination.pageIndex * pagination.pageSize + 1, totalRows)}</span> to{' '}
          <span className="font-medium">{Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalRows)}</span> of{' '}
          <span className="font-medium">{totalRows}</span> entries
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-gray-700 px-2">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
