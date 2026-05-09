import { useState, useEffect } from 'react';
import { CircleStackIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  KPICard,
  ReportChart,
  ReportTable,
  DateRangeFilter,
  ExportButtons,
  ReportHeader
} from '../../components/reports';
import { getStorageReport, exportReport } from '../../services/reportDataService';

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const MODALITY_COLUMNS = [
  { key: 'modality', label: 'Modality', sortable: true },
  { 
    key: 'sizeBytes', 
    label: 'Size', 
    sortable: true,
    render: (value) => formatBytes(value)
  },
  { key: 'studyCount', label: 'Studies', sortable: true },
  { 
    key: 'avgFileSize', 
    label: 'Avg File Size', 
    sortable: true,
    render: (value) => formatBytes(value)
  }
];

export default function StorageReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await getStorageReport(filters);
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
    await exportReport('storage', format, filters);
  };

  const periodText = `${filters.startDate} - ${filters.endDate}`;
  const usagePercentage = data?.summary?.usagePercentage || 0;
  const isWarning = usagePercentage >= 80;
  const isCritical = usagePercentage >= 90;

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Laporan Storage"
        subtitle="Penggunaan storage DICOM"
        period={periodText}
        icon={CircleStackIcon}
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

      {/* Warning Alert */}
      {isWarning && (
        <div className={`rounded-xl p-4 flex items-center gap-3 ${isCritical ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
          <ExclamationTriangleIcon className={`w-6 h-6 ${isCritical ? 'text-red-600' : 'text-yellow-600'}`} />
          <div>
            <p className={`font-medium ${isCritical ? 'text-red-700' : 'text-yellow-700'}`}>
              {isCritical ? 'Storage Kritis!' : 'Storage Warning'}
            </p>
            <p className={`text-sm ${isCritical ? 'text-red-600' : 'text-yellow-600'}`}>
              Penggunaan storage mencapai {usagePercentage.toFixed(1)}%. 
              {isCritical ? ' Segera lakukan cleanup!' : ' Pertimbangkan untuk cleanup.'}
            </p>
          </div>
        </div>
      )}

      <DateRangeFilter
        startDate={filters.startDate}
        endDate={filters.endDate}
        onChange={handleDateChange}
      />

      {/* Storage Gauge */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Storage Usage</h3>
        <div className="flex items-center gap-8">
          <div className="flex-1">
            <div className="h-6 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  isCritical ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-blue-500'
                }`}
                style={{ width: `${usagePercentage}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              <span>0%</span>
              <span className="text-yellow-600">80%</span>
              <span className="text-red-600">90%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="text-center min-w-[120px]">
            <p className={`text-4xl font-bold ${isCritical ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-blue-600'}`}>
              {loading ? '...' : `${usagePercentage.toFixed(1)}%`}
            </p>
            <p className="text-xs text-slate-500 mt-1">Used</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard title="Total Storage" value={data?.summary?.totalBytes} format="bytes" loading={loading} />
        <KPICard title="Used" value={data?.summary?.usedBytes} format="bytes" loading={loading} />
        <KPICard title="Available" value={data?.summary?.availableBytes} format="bytes" loading={loading} />
        <KPICard title="Total Studies" value={data?.summary?.totalStudies} loading={loading} />
        <KPICard title="Total Series" value={data?.summary?.totalSeries} loading={loading} />
        <KPICard title="Total Instances" value={data?.summary?.totalInstances} loading={loading} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportChart
          type="pie"
          data={(data?.byModality || []).map(m => ({ ...m, name: m.modality, value: m.sizeBytes }))}
          xKey="name"
          yKey="value"
          title="Storage per Modality"
          height={300}
          loading={loading}
        />
        <ReportChart
          type="area"
          data={data?.trend || []}
          xKey="date"
          yKey="usagePercentage"
          title="Trend Penggunaan Storage (30 Hari)"
          height={300}
          loading={loading}
          colors={[isWarning ? '#F59E0B' : '#3B82F6']}
        />
      </div>

      {/* Modality Breakdown Table */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Detail per Modality</h3>
        <ReportTable
          columns={MODALITY_COLUMNS}
          data={data?.byModality || []}
          loading={loading}
          emptyMessage="Tidak ada data storage"
        />
      </div>
    </div>
  );
}
