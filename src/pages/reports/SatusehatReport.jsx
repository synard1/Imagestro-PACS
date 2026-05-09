import { useState, useEffect } from 'react';
import { CloudArrowUpIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import {
  KPICard,
  ReportChart,
  ReportTable,
  DateRangeFilter,
  ExportButtons,
  ReportHeader
} from '../../components/reports';
import { getSatusehatReport, exportReport } from '../../services/reportDataService';

const FAILED_COLUMNS = [
  { key: 'orderId', label: 'Order ID', sortable: true },
  { key: 'patientName', label: 'Nama Pasien', sortable: true },
  { 
    key: 'errorCode', 
    label: 'Error Code', 
    sortable: true,
    render: (value) => (
      <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-mono">
        {value}
      </span>
    )
  },
  { key: 'errorMessage', label: 'Error Message', sortable: false },
  { key: 'lastAttempt', label: 'Last Attempt', sortable: true },
  { key: 'retryCount', label: 'Retry', sortable: true },
  {
    key: 'actions',
    label: 'Aksi',
    render: (_, row) => (
      <button
        onClick={() => console.log('Retry:', row.orderId)}
        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100"
      >
        <ArrowPathIcon className="w-3 h-3" />
        Retry
      </button>
    )
  }
];

export default function SatusehatReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await getSatusehatReport(filters);
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
    await exportReport('satusehat', format, filters);
  };

  const periodText = `${filters.startDate} - ${filters.endDate}`;

  // Calculate success rate color
  const getSuccessRateColor = (rate) => {
    if (rate >= 95) return 'text-green-600';
    if (rate >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <ReportHeader
        title="Laporan SATUSEHAT"
        subtitle="Status sinkronisasi dengan SATUSEHAT"
        period={periodText}
        icon={CloudArrowUpIcon}
        actions={
          <ExportButtons
            onExportPDF={() => handleExport('pdf')}
            onExportExcel={() => handleExport('excel')}
            onExportCSV={() => handleExport('csv')}
            onPrint={() => window.print()}
          />
        }
      />

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <DateRangeFilter
        startDate={filters.startDate}
        endDate={filters.endDate}
        onChange={handleDateChange}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="Total Synced"
          value={data?.summary?.totalSynced}
          loading={loading}
          subtitle="ServiceRequest berhasil"
          icon={<CloudArrowUpIcon className="w-5 h-5" />}
        />
        <KPICard
          title="Pending Sync"
          value={data?.summary?.totalPending}
          loading={loading}
          subtitle="Menunggu sinkronisasi"
        />
        <KPICard
          title="Failed Sync"
          value={data?.summary?.totalFailed}
          loading={loading}
          subtitle="Gagal sinkronisasi"
        />
        <KPICard
          title="Success Rate"
          value={data?.summary?.successRate}
          format="percentage"
          loading={loading}
          subtitle="Tingkat keberhasilan"
        />
        <KPICard
          title="Avg Sync Time"
          value={data?.summary?.avgSyncTime}
          loading={loading}
          subtitle="Detik per request"
        />
      </div>

      {/* Success Rate Gauge */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Success Rate Overview</h3>
        <div className="flex items-center gap-8">
          <div className="flex-1">
            <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                style={{ width: `${data?.summary?.successRate || 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="text-center">
            <p className={`text-4xl font-bold ${getSuccessRateColor(data?.summary?.successRate || 0)}`}>
              {loading ? '...' : `${data?.summary?.successRate?.toFixed(1)}%`}
            </p>
            <p className="text-xs text-slate-500 mt-1">Success Rate</p>
          </div>
        </div>
      </div>

      {/* Sync Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-xl p-5 border border-green-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Synced</p>
              <p className="text-3xl font-bold text-green-700 mt-1">
                {loading ? '...' : data?.summary?.totalSynced?.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-green-600 text-lg">✓</span>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">Pending</p>
              <p className="text-3xl font-bold text-yellow-700 mt-1">
                {loading ? '...' : data?.summary?.totalPending?.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <span className="text-yellow-600 text-lg">⏳</span>
            </div>
          </div>
        </div>
        
        <div className="bg-red-50 rounded-xl p-5 border border-red-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Failed</p>
              <p className="text-3xl font-bold text-red-700 mt-1">
                {loading ? '...' : data?.summary?.totalFailed?.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <span className="text-red-600 text-lg">✗</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <ReportChart
        type="area"
        data={data?.trend || []}
        xKey="date"
        yKey={['synced', 'failed']}
        title="Trend Sinkronisasi"
        height={300}
        loading={loading}
        colors={['#10B981', '#EF4444']}
      />

      {/* Failed List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Daftar Gagal Sync</h3>
          {data?.failedList?.length > 0 && (
            <button
              onClick={() => console.log('Retry all failed')}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Retry Semua
            </button>
          )}
        </div>
        <ReportTable
          columns={FAILED_COLUMNS}
          data={data?.failedList || []}
          loading={loading}
          emptyMessage="Tidak ada data yang gagal sync"
        />
      </div>
    </div>
  );
}
