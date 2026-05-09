import React, { useState, useEffect } from 'react';
import {
    Download, FileText, AlertCircle, CheckCircle, XCircle,
    Filter, RefreshCw, ChevronLeft, ChevronRight, Search,
    Shield, Activity, User, Users, Calendar
} from 'lucide-react';
import auditService from '../services/auditService';

const EnhancedAuditLogs = () => {
    // State
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        limit: 20
    });

    // Filters
    const [filters, setFilters] = useState({
        username: '',
        action: '',
        resourceType: '',
        severity: '',
        phiOnly: false,
        failedOnly: false,
        startDate: '',
        endDate: ''
    });

    const [showFilters, setShowFilters] = useState(false);

    // Dropdowns data
    const [actions, setActions] = useState([]);
    const [resourceTypes, setResourceTypes] = useState([]);

    useEffect(() => {
        loadLogs();
        loadStats();
        loadFilterOptions();
    }, [pagination.page, pagination.limit]);

    const loadLogs = async () => {
        try {
            setLoading(true);
            setError(null);

            // Prepare payload
            const payload = {
                ...filters,
                page: pagination.page,
                limit: pagination.limit
            };

            const data = await auditService.listLogs(payload);
            setLogs(data.logs || []);
            setPagination(prev => ({
                ...prev,
                total: data.pagination?.total || 0
            }));
        } catch (err) {
            setError('Failed to load audit logs: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const statsData = await auditService.getStats();
            setStats(statsData);
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    };

    const loadFilterOptions = async () => {
        try {
            const [actionsData, typesData] = await Promise.all([
                auditService.listActions(),
                auditService.listResourceTypes()
            ]);
            setActions(actionsData);
            setResourceTypes(typesData);
        } catch (err) {
            console.error('Failed to load filter options:', err);
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleApplyFilters = () => {
        setPagination(prev => ({ ...prev, page: 1 }));
        loadLogs();
    };

    const handleResetFilters = () => {
        setFilters({
            username: '', action: '', resourceType: '', severity: '',
            phiOnly: false, failedOnly: false, startDate: '', endDate: ''
        });
        setPagination(prev => ({ ...prev, page: 1 }));
        // loadLogs will be triggered by useEffect due to pagination reset if page was not 1, 
        // but if page was 1, we need to trigger it manually or add filters dependency to useEffect.
        // To avoid double fetch, we'll just call loadLogs manually in next render cycle or use a specific effect.
        // For simplicity, we can just call loadLogs() here wrapped in timeout or rely on the user to click apply.
        // Better UX: Auto apply on reset?
        setTimeout(() => loadLogs(), 0);
    };

    const handleRefresh = () => {
        loadLogs();
        loadStats();
    };

    const handleExport = async (format) => {
        try {
            await auditService.exportLogs(format, filters);
        } catch (err) {
            alert('Export failed: ' + err.message);
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= Math.ceil(pagination.total / pagination.limit)) {
            setPagination(prev => ({ ...prev, page: newPage }));
        }
    };

    const handleLimitChange = (e) => {
        setPagination(prev => ({
            ...prev,
            limit: parseInt(e.target.value),
            page: 1
        }));
    };

    const getSeverityBadge = (severity) => {
        const styles = {
            'INFO': 'bg-blue-50 text-blue-700 border-blue-200',
            'WARNING': 'bg-yellow-50 text-yellow-700 border-yellow-200',
            'ERROR': 'bg-red-50 text-red-700 border-red-200',
            'CRITICAL': 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse'
        };
        return `border ${styles[severity] || 'bg-gray-50 text-gray-700 border-gray-200'}`;
    };

    const getStatusIcon = (status) => {
        if (status >= 200 && status < 300) return <CheckCircle className="w-4 h-4 text-green-500" />;
        if (status >= 400) return <XCircle className="w-4 h-4 text-red-500" />;
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
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

    const totalPages = Math.ceil(pagination.total / pagination.limit);

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Audit Logs</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <Shield className="w-4 h-4 text-emerald-600" />
                        <p className="text-sm text-gray-500">HIPAA & GDPR Compliant access trails</p>
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
                    <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>
                    <button
                        onClick={() => handleExport('csv')}
                        className="btn bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm hover:shadow transition-all flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                    >
                        <Download className="w-4 h-4" />
                        CSV
                    </button>
                    <button
                        onClick={() => handleExport('json')}
                        className="btn bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm hover:shadow transition-all flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                    >
                        <FileText className="w-4 h-4" />
                        JSON
                    </button>
                </div>
            </div>

            {/* Statistics Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCard
                        title="Total Events"
                        value={stats.total_events}
                        icon={Activity}
                        color="bg-blue-50 text-blue-600"
                    />
                    <StatCard
                        title="PHI Access"
                        value={stats.phi_access_count}
                        icon={Shield}
                        color="bg-purple-50 text-purple-600"
                    />
                    <StatCard
                        title="Failed Ops"
                        value={stats.failed_operations}
                        icon={AlertCircle}
                        color="bg-red-50 text-red-600"
                    />
                    <StatCard
                        title="Unique Users"
                        value={stats.unique_users}
                        icon={User}
                        color="bg-green-50 text-green-600"
                    />
                    <StatCard
                        title="Unique Patients"
                        value={stats.unique_patients}
                        icon={Users}
                        color="bg-indigo-50 text-indigo-600"
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
                            <label className="text-xs font-medium text-gray-500">Username</label>
                            <div className="relative">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search user..."
                                    value={filters.username}
                                    onChange={(e) => handleFilterChange('username', e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500">Action Type</label>
                            <select
                                value={filters.action}
                                onChange={(e) => handleFilterChange('action', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm bg-white"
                            >
                                <option value="">All Actions</option>
                                {actions.map(action => (
                                    <option key={action} value={action}>{action}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500">Resource</label>
                            <select
                                value={filters.resourceType}
                                onChange={(e) => handleFilterChange('resourceType', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm bg-white"
                            >
                                <option value="">All Resources</option>
                                {resourceTypes.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500">Severity</label>
                            <select
                                value={filters.severity}
                                onChange={(e) => handleFilterChange('severity', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm bg-white"
                            >
                                <option value="">All Severities</option>
                                <option value="INFO">INFO</option>
                                <option value="WARNING">WARNING</option>
                                <option value="ERROR">ERROR</option>
                                <option value="CRITICAL">CRITICAL</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500">Date Range</label>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    value={filters.startDate}
                                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                />
                                <input
                                    type="date"
                                    value={filters.endDate}
                                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                />
                            </div>
                        </div>

                        <div className="md:col-span-3 flex items-end gap-4 pb-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={filters.phiOnly}
                                        onChange={(e) => handleFilterChange('phiOnly', e.target.checked)}
                                        className="peer h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                </div>
                                <span className="text-sm text-purple-700 font-medium bg-purple-50 px-2 py-0.5 rounded-full">PHI Only</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={filters.failedOnly}
                                        onChange={(e) => handleFilterChange('failedOnly', e.target.checked)}
                                        className="peer h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                    />
                                </div>
                                <span className="text-sm text-red-700 font-medium bg-red-50 px-2 py-0.5 rounded-full">Failed Only</span>
                            </label>

                            <div className="flex-1"></div>

                            <button
                                onClick={handleResetFilters}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all"
                            >
                                Reset
                            </button>
                            <button
                                onClick={handleApplyFilters}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow rounded-lg transition-all flex items-center gap-2"
                            >
                                <Search className="w-4 h-4" />
                                Apply Filters
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[500px]">
                {/* Error Message */}
                {error && (
                    <div className="p-4 bg-red-50 border-b border-red-100 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                        <p className="text-sm text-red-800">{error}</p>
                    </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto flex-1">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-200">
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Resource</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Severity</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-24 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                                            <p className="text-gray-500 font-medium">Loading audit trail...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-24 text-center">
                                        <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                                <Search className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-1">No records found</h3>
                                            <p className="text-gray-500 text-sm mb-6">We couldn't find any audit logs matching your current filters. Try adjusting your search criteria.</p>
                                            <button
                                                onClick={handleResetFilters}
                                                className="btn btn-secondary text-sm"
                                            >
                                                Clear all filters
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr
                                        key={log.id}
                                        className={`hover:bg-gray-50/80 transition-colors ${log.phi_accessed ? 'bg-purple-50/30' : ''}`}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">
                                                {new Date(log.created_at).toLocaleDateString()}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                                    {(log.username || 'A').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">{log.username || 'Anonymous'}</div>
                                                    <div className="text-xs text-gray-500">{log.user_role || 'Unknown Role'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900">{log.resource_type}</div>
                                            {log.resource_id && (
                                                <div className="text-xs text-gray-500 font-mono truncate max-w-[150px]" title={log.resource_id}>
                                                    {log.resource_id}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                {getStatusIcon(log.response_status)}
                                                <span className={`text-sm font-medium ${log.response_status >= 400 ? 'text-red-700' : 'text-gray-700'
                                                    }`}>
                                                    {log.response_status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${getSeverityBadge(log.severity)}`}>
                                                {log.severity}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {log.phi_accessed && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                                                        <Shield className="w-3 h-3" /> PHI
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-400" title={log.ip_address}>
                                                    {log.ip_address}
                                                </span>
                                            </div>
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
                            Showing <span className="font-semibold">{Math.min(pagination.total, (pagination.page - 1) * pagination.limit + 1)}</span> to <span className="font-semibold">{Math.min(pagination.total, pagination.page * pagination.limit)}</span> of <span className="font-semibold">{pagination.total}</span> results
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handlePageChange(pagination.page - 1)}
                            disabled={pagination.page === 1 || loading}
                            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                // Logic to show window of pages around current page
                                let pageNum = i + 1;
                                if (totalPages > 5) {
                                    if (pagination.page > 3) {
                                        pageNum = pagination.page - 2 + i;
                                    }
                                    if (pageNum > totalPages) {
                                        pageNum = totalPages - 4 + i;
                                    }
                                }

                                // Adjust if pageNum becomes invalid due to simple logic
                                if (pageNum > totalPages) return null;
                                if (pageNum < 1) return null;

                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => handlePageChange(pageNum)}
                                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${pagination.page === pageNum
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'text-gray-600 hover:bg-gray-100'
                                            }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => handlePageChange(pagination.page + 1)}
                            disabled={pagination.page === totalPages || loading || totalPages === 0}
                            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EnhancedAuditLogs;
