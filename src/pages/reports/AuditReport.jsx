import { useState, useEffect } from 'react';
import { ShieldCheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  KPICard,
  ReportChart,
  ReportTable,
  DateRangeFilter,
  ExportButtons,
  ReportHeader
} from '../../components/reports';
import { getAuditReport, exportReport } from '../../services/reportDataService';

const ACTION_COLUMNS = [
  { key: 'action', label: 'Action', sortable: true },
  { key: 'count', label: 'Count', sortable: true }
];

const USER_COLUMNS = [
  { key: 'userName', label: 'Username', sortable: true },
  { key: 'actionCount', label: 'Actions', sortable: true },
  { key: 'lastActivity', label: 'Last Activity', sortable: true }
];

const TIMELINE_COLUMNS = [
  { key: 'timestamp', label: 'Timestamp', sortable: true },
  { key: 'user', label: 'User', sortable: true },
  { 
    key: 'action', 
    label: 'Action', 
    sortable: true,
    render: (value) => {
      const colors = {
        VIEW: 'bg-blue-100 text-blue-700',
        CREATE: 'bg-green-100 text-green-700',
        UPDATE: 'bg-yellow-100 text-yellow-700',
        DELETE: 'bg-red-100 text-red-700',
        LOGIN: 'bg-purple-100 text-purple-700',
        LOGOUT: 'bg-slate-100 text-slate-700'
      };
      return (
        <span className={`px-2 py-1 rounded text-xs font-medium ${colors[value] || 'bg-slate-100'}`}>
          {value}
        </span>
      );
    }
  },
  { key: 'module', label: 'Module', sortable: true },
  { key: 'details', label: 'Details', sortable: false }
];

export default function AuditReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    user: '',
    action: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await getAuditReport(filters);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filters]);

  const handleDateChange = ({ startDate, endDate }) => {
    setFilters(prev => ({ ...prev, startDate, endDate }));
  };

  const handleExport = async (format) => {
    await exportReport('audit', format, filters);
  };

  const periodText = `${filters.startDate} - ${filters.endDate}`;

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Laporan Audit"
        subtitle="Aktivitas sistem dan user"
        period={periodText}
        icon={ShieldCheckIcon}
        actions={
          <ExportButtons
            onExportPDF={() => handleExport('pdf')}
            onExportExcel={() => handleExport('excel')}
            onExportCSV={() => handleExport('csv')}
            onPrint={() => window.print()}
          />
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Failed Login Warning */}
      {data?.summary?.failedLogins > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600" />
          <div>
            <p className="font-medium text-yellow-700">Security Alert</p>
            <p className="text-sm text-yellow-600">
              Terdapat {data.summary.failedLogins} failed login attempts dalam periode ini.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <DateRangeFilter
          startDate={filters.startDate}
          endDate={filters.endDate}
          onChange={handleDateChange}
          className="lg:col-span-2"
        />
        
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="block text-xs text-slate-500 mb-2">Filter User</label>
          <input
            type="text"
            value={filters.user}
            onChange={(e) => setFilters(prev => ({ ...prev, user: e.target.value }))}
            placeholder="Username..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="block text-xs text-slate-500 mb-2">Filter Action</label>
          <select
            value={filters.action}
            onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Semua Action</option>
            <option value="VIEW">VIEW</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Total Actions"
          value={data?.summary?.totalActions}
          loading={loading}
          subtitle="Aktivitas tercatat"
        />
        <KPICard
          title="Unique Users"
          value={data?.summary?.uniqueUsers}
          loading={loading}
          subtitle="User aktif"
        />
        <KPICard
          title="Failed Logins"
          value={data?.summary?.failedLogins}
          loading={loading}
          subtitle="Percobaan gagal"
          icon={data?.summary?.failedLogins > 0 ? <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" /> : null}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportChart
          type="bar"
          data={data?.byAction || []}
          xKey="action"
          yKey="count"
          title="Aktivitas per Action"
          height={300}
          loading={loading}
        />
        <ReportChart
          type="line"
          data={data?.trend || []}
          xKey="date"
          yKey="actions"
          title="Trend Aktivitas"
          height={300}
          loading={loading}
          colors={['#8B5CF6']}
        />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Breakdown per Action</h3>
          <ReportTable
            columns={ACTION_COLUMNS}
            data={data?.byAction || []}
            loading={loading}
            emptyMessage="Tidak ada data action"
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Aktivitas per User</h3>
          <ReportTable
            columns={USER_COLUMNS}
            data={data?.byUser || []}
            loading={loading}
            emptyMessage="Tidak ada data user"
          />
        </div>
      </div>

      {/* Timeline */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Timeline Aktivitas Terbaru</h3>
        <ReportTable
          columns={TIMELINE_COLUMNS}
          data={data?.timeline || []}
          loading={loading}
          emptyMessage="Tidak ada aktivitas"
        />
      </div>
    </div>
  );
}
