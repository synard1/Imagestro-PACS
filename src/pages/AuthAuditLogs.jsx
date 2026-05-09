import { useEffect, useState, useMemo } from 'react'
import {
  Shield, CheckCircle, XCircle, Search, Filter,
  RefreshCw, Download, FileText, ChevronLeft, ChevronRight,
  UserCheck, UserX, Clock, Globe, Laptop
} from 'lucide-react'
import { listAuthAuditLogs } from '../services/auditService'

export default function AuthAuditLogs() {
  // State
  const [allRows, setAllRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20
  })

  // State for Modal
  const [selectedLog, setSelectedLog] = useState(null)

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    action: '',
    success: 'all', // 'all', 'true', 'false'
    startDate: '',
    endDate: ''
  })

  const [showFilters, setShowFilters] = useState(false)

  // Derived Statistics
  const stats = useMemo(() => {
    if (!allRows.length) return null;

    const total = allRows.length;
    const successCount = allRows.filter(r => r.success).length;
    const failedCount = total - successCount;
    const uniqueUsers = new Set(allRows.map(r => r.username).filter(Boolean)).size;
    const uniqueIPs = new Set(allRows.map(r => r.ip_address).filter(Boolean)).size;

    return {
      total,
      successCount,
      failedCount,
      uniqueUsers,
      uniqueIPs
    };
  }, [allRows]);

  // Derived Filter Options
  const availableActions = useMemo(() => {
    const actions = new Set(allRows.map(log => log.action).filter(Boolean));
    return Array.from(actions).sort();
  }, [allRows]);

  useEffect(() => {
    loadAllAuthAuditLogs()
  }, [])

  // Filtering Logic
  const filteredData = useMemo(() => {
    return allRows.filter(log => {
      // Search term
      const term = filters.search.toLowerCase();
      const matchesSearch = !term ||
        log.username?.toLowerCase().includes(term) ||
        log.ip_address?.toLowerCase().includes(term) ||
        log.user_id?.toLowerCase().includes(term) ||
        log.user_agent?.toLowerCase().includes(term);

      // Action
      const matchesAction = !filters.action || log.action === filters.action;

      // Success Status
      const matchesSuccess = filters.success === 'all' ||
        (filters.success === 'true' && log.success) ||
        (filters.success === 'false' && !log.success);

      // Date Range
      let matchesDate = true;
      if (filters.startDate || filters.endDate) {
        const logDate = new Date(log.created_at).setHours(0, 0, 0, 0);
        if (filters.startDate) {
          matchesDate = matchesDate && logDate >= new Date(filters.startDate).setHours(0, 0, 0, 0);
        }
        if (filters.endDate) {
          matchesDate = matchesDate && logDate <= new Date(filters.endDate).setHours(0, 0, 0, 0);
        }
      }

      return matchesSearch && matchesAction && matchesSuccess && matchesDate;
    });
  }, [allRows, filters]);

  // Pagination Logic
  const paginatedData = useMemo(() => {
    const start = (pagination.page - 1) * pagination.limit;
    return filteredData.slice(start, start + pagination.limit);
  }, [filteredData, pagination]);

  const totalPages = Math.ceil(filteredData.length / pagination.limit);

  async function loadAllAuthAuditLogs() {
    try {
      setLoading(true)
      setError(null)
      // Load larger dataset for client-side processing
      const response = await listAuthAuditLogs({ page: 1, limit: 10000 })
      setAllRows(response.data || [])
      setPagination(p => ({ ...p, page: 1 }))
    } catch (err) {
      setError(err.message || 'Failed to load auth audit logs')
      console.error('Error loading auth audit logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    loadAllAuthAuditLogs();
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      action: '',
      success: 'all',
      startDate: '',
      endDate: ''
    });
    setPagination(p => ({ ...p, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPagination(p => ({ ...p, page: newPage }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleLimitChange = (e) => {
    setPagination(p => ({ ...p, limit: Number(e.target.value), page: 1 }));
  };

  const StatCard = ({ title, value, icon: Icon, color, className }) => (
    <div className={`bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 text-sm font-medium uppercase tracking-wider">{title}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value?.toLocaleString() || 0}</div>
    </div>
  );

  const getActionStyle = (action) => {
    const styles = {
      LOGIN: 'bg-green-100 text-green-800',
      LOGOUT: 'bg-blue-100 text-blue-800',
      FAILED_LOGIN: 'bg-red-100 text-red-800',
      CREATE: 'bg-purple-100 text-purple-800',
      UPDATE: 'bg-yellow-100 text-yellow-800',
      DELETE: 'bg-red-100 text-red-800',
    }
    return styles[action] || 'bg-gray-100 text-gray-800';
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Authentication Logs</h1>
          <div className="flex items-center gap-2 mt-1">
            <Shield className="w-4 h-4 text-indigo-600" />
            <p className="text-sm text-gray-500">Security access and authentication tracking</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRefresh}
            className="btn bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm hover:shadow transition-all flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Logs"
            value={stats.total}
            icon={FileText}
            color="bg-blue-50 text-blue-600"
          />
          <StatCard
            title="Successful"
            value={stats.successCount}
            icon={CheckCircle}
            color="bg-green-50 text-green-600"
          />
          <StatCard
            title="Failed"
            value={stats.failedCount}
            icon={XCircle}
            color="bg-red-50 text-red-600"
          />
          <StatCard
            title="Unique Users"
            value={stats.uniqueUsers}
            icon={UserCheck}
            color="bg-indigo-50 text-indigo-600"
          />
          <StatCard
            title="Unique IPs"
            value={stats.uniqueIPs}
            icon={Globe}
            color="bg-purple-50 text-purple-600"
          />
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-2 font-semibold text-gray-700">
            <Filter className="w-4 h-4" />
            <span>Filter Records</span>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>

        {showFilters && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Search</label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Username, IP, ID..."
                  value={filters.search}
                  onChange={(e) => setFilters(p => ({ ...p, search: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Action Type</label>
              <select
                value={filters.action}
                onChange={(e) => setFilters(p => ({ ...p, action: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm bg-white"
              >
                <option value="">All Actions</option>
                {availableActions.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Status</label>
              <select
                value={filters.success}
                onChange={(e) => setFilters(p => ({ ...p, success: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm bg-white"
              >
                <option value="all">All Status</option>
                <option value="true">Success Only</option>
                <option value="false">Failed Only</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Date Range</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters(p => ({ ...p, startDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                />
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>

            <div className="md:col-span-4 flex justify-end pt-2">
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all"
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[500px]">
        {error && (
          <div className="p-4 bg-red-50 border-b border-red-100 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-200">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Network</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                      <p className="text-gray-500 font-medium">Loading records...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-gray-300" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">No records found</h3>
                      <p className="text-gray-500 text-sm">Try adjusting your time range or search terms.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((log) => (
                  <tr
                    key={log.id}
                    className={`hover:bg-gray-50/80 transition-colors ${!log.success ? 'bg-red-50/20' : ''}`}
                  >
                    <td className="px-6 py-4 text-center">
                      {log.success ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <Clock className="w-4 h-4 text-gray-400" />
                        {(() => {
                          const dateStr = log.created_at.endsWith('Z') ? log.created_at : `${log.created_at}Z`;
                          return new Date(dateStr).toLocaleString();
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                          {(log.username || 'A').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{log.username || 'Anonymous'}</div>
                          <div className="text-xs text-gray-500 font-mono">{log.user_id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${getActionStyle(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Globe className="w-3 h-3 text-gray-400" />
                          {log.ip_address || '-'}
                        </div>
                        <div className="flex items-center gap-2" title={log.user_agent}>
                          <Laptop className="w-3 h-3 text-gray-400" />
                          <span className="truncate max-w-[150px]">{log.user_agent || '-'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {log.details ? (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-medium transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                          View Details
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <select
              value={pagination.limit}
              onChange={handleLimitChange}
              className="border border-gray-300 rounded-lg text-sm p-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="10">10 per page</option>
              <option value="20">20 per page</option>
              <option value="50">50 per page</option>
              <option value="100">100 per page</option>
            </select>
            <span>
              Showing <span className="font-semibold">{Math.min(filteredData.length, (pagination.page - 1) * pagination.limit + 1)}</span> to <span className="font-semibold">{Math.min(filteredData.length, pagination.page * pagination.limit)}</span> of <span className="font-semibold">{filteredData.length}</span> results
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-sm font-medium text-gray-700">
              Page {pagination.page} of {totalPages || 1}
            </span>

            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === totalPages || totalPages === 0}
              className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-500" />
                Log Details
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto bg-gray-900">
              <pre className="p-4 text-sm font-mono text-gray-100 whitespace-pre-wrap">
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(selectedLog.details, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `log-${selectedLog.id}-details.json`;
                  a.click();
                }}
                className="btn bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 btn-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download JSON
              </button>
              <button
                onClick={() => setSelectedLog(null)}
                className="btn btn-primary btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
