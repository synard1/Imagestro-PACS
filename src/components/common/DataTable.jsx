import React, { useState, useEffect, useCallback } from 'react';
import { 
  RefreshCw, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronUp, 
  ChevronDown,
  Filter
} from 'lucide-react';

/**
 * Enhanced Reusable DataTable Component
 * 
 * Props:
 * - columns: Array of objects { key, label, sortable, render }
 * - fetchData: Async function that takes ({ page, limit, search, filters, sort }) and returns { data, total }
 * - filters: Array of filter objects { key, label, options: [{ value, label }] }
 * - defaultPageSize: Number
 * - searchPlaceholder: String
 * - refreshInterval: Number (ms) - optional auto refresh
 * - actions: Component to render in action column
 * - onRowClick: Function
 */
const DataTable = ({
  columns = [],
  fetchData,
  filters: filterConfig = [],
  defaultPageSize = 10,
  searchPlaceholder = "Search...",
  refreshInterval = 0,
  actions,
  extraActions,
  onRowClick,
  className = ""
}) => {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  // State for data management
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(defaultPageSize);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState({});
  const [sort, setSort] = useState({ key: null, direction: 'desc' });

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      
      setError(null);
      const result = await fetchData({ 
        page, 
        limit, 
        search, 
        filters: activeFilters, 
        sort 
      });
      
      if (result) {
        setData(result.items || result.data || []);
        setTotal(result.total || (result.data ? result.data.length : 0));
      }
    } catch (err) {
      console.error("DataTable fetch error:", err);
      setError(err.message || "Failed to fetch data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchData, page, limit, search, activeFilters, sort]);

  // Initial load and dependencies
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => loadData(true), refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, loadData]);

  const handleSort = (key) => {
    if (!key) return;
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setPage(1); // Reset to first page on sort
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header / Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          {filterConfig.map(filter => (
            <select
              key={filter.key}
              value={activeFilters[filter.key] || ""}
              onChange={(e) => {
                setActiveFilters(prev => ({ ...prev, [filter.key]: e.target.value }));
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{filter.label}</option>
              {filter.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ))}

          <button
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className={`p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all ${refreshing ? 'text-blue-600' : 'text-gray-600'}`}
            title="Refresh Data"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          {extraActions && (
            <div className="flex items-center">
              {extraActions}
            </div>
          )}
        </div>
      </div>

      {/* Table Area */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm relative">
        {loading && !refreshing && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
              <p className="text-sm font-medium text-gray-500">Updating data...</p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && handleSort(col.key)}
                    className={`px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && sort.key === col.key && (
                        sort.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                ))}
                {actions && <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.length === 0 && !loading ? (
                <tr>
                  <td colSpan={columns.length + (actions ? 1 : 0)} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Filter className="h-8 w-8 text-gray-300" />
                      <p>No results found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr 
                    key={row.id || idx} 
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`${onRowClick ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50'} transition-colors`}
                  >
                    {columns.map(col => (
                      <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {col.render ? col.render(row[col.key], row) : (row[col.key] || "-")}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {actions(row)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            Showing {total > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, total)} of {total} results
          </span>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none"
          >
            {[5, 10, 20, 50, 100].map(v => (
              <option key={v} value={v}>{v} / page</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="p-2 rounded-lg border border-gray-300 bg-white disabled:opacity-50 hover:bg-gray-50 transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          <div className="flex items-center gap-1">
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              // Simple pagination logic for current range
              let pageNum = page;
              if (totalPages <= 5) pageNum = i + 1;
              else if (page <= 3) pageNum = i + 1;
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = page - 2 + i;

              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${page === pageNum ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-100 text-gray-600'}`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="p-2 rounded-lg border border-gray-300 bg-white disabled:opacity-50 hover:bg-gray-50 transition-all"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
