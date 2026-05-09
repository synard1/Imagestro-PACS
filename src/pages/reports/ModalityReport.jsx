import { useState, useEffect } from 'react';
import { ComputerDesktopIcon } from '@heroicons/react/24/outline';
import {
  KPICard,
  ReportChart,
  ReportTable,
  DateRangeFilter,
  ExportButtons,
  ReportHeader
} from '../../components/reports';
import { getModalityReport, exportReport } from '../../services/reportDataService';

const MODALITY_OPTIONS = [
  { value: 'all', label: 'Semua Modality' },
  { value: 'CT', label: 'CT Scan' },
  { value: 'MR', label: 'MRI' },
  { value: 'CR', label: 'CR (X-Ray)' },
  { value: 'US', label: 'Ultrasound' },
  { value: 'DX', label: 'Digital X-Ray' }
];

const MODALITY_COLUMNS = [
  { key: 'modality', label: 'Modality', sortable: true },
  { key: 'count', label: 'Total Pemeriksaan', sortable: true },
  { key: 'completed', label: 'Selesai', sortable: true },
  { 
    key: 'avgTurnaround', 
    label: 'Avg Turnaround', 
    sortable: true,
    render: (value) => `${value} menit`
  },
  { 
    key: 'utilizationRate', 
    label: 'Utilisasi', 
    sortable: true,
    render: (value) => {
      const color = value >= 80 ? 'text-green-600' : value >= 60 ? 'text-yellow-600' : 'text-red-600';
      return <span className={`font-medium ${color}`}>{value.toFixed(1)}%</span>;
    }
  }
];

const BODY_PART_COLUMNS = [
  { key: 'bodyPart', label: 'Body Part', sortable: true },
  { key: 'count', label: 'Jumlah Pemeriksaan', sortable: true }
];

export default function ModalityReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    modality: 'all'
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await getModalityReport(filters);
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
    await exportReport('modality', format, filters);
  };

  const periodText = `${filters.startDate} - ${filters.endDate}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <ReportHeader
        title="Laporan Modality"
        subtitle="Utilisasi dan performa modalitas radiologi"
        period={periodText}
        icon={ComputerDesktopIcon}
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DateRangeFilter
          startDate={filters.startDate}
          endDate={filters.endDate}
          onChange={handleDateChange}
          className="lg:col-span-2"
        />
        
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="block text-xs text-slate-500 mb-2">Filter Modality</label>
          <select
            value={filters.modality}
            onChange={(e) => setFilters(prev => ({ ...prev, modality: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MODALITY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Total Pemeriksaan"
          value={data?.summary?.totalExaminations}
          loading={loading}
          subtitle="Periode terpilih"
        />
        <KPICard
          title="Avg Turnaround Time"
          value={data?.summary?.averageTurnaround}
          format="duration"
          loading={loading}
          subtitle="Dari mulai hingga selesai"
        />
        <KPICard
          title="Rata-rata Utilisasi"
          value={data?.summary?.utilizationRate}
          format="percentage"
          loading={loading}
          subtitle="Dari kapasitas tersedia"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Modality Comparison */}
        <ReportChart
          type="bar"
          data={data?.byModality || []}
          xKey="modality"
          yKey={['count', 'completed']}
          title="Perbandingan per Modality"
          height={300}
          loading={loading}
        />

        {/* Utilization Rate */}
        <ReportChart
          type="bar"
          data={data?.byModality || []}
          xKey="modality"
          yKey="utilizationRate"
          title="Tingkat Utilisasi per Modality"
          height={300}
          loading={loading}
          colors={['#10B981']}
        />
      </div>

      {/* Trend Chart */}
      <ReportChart
        type="line"
        data={data?.trend || []}
        xKey="date"
        yKey={['CT', 'MR', 'CR', 'US', 'DX']}
        title="Trend Pemeriksaan per Modality"
        height={300}
        loading={loading}
      />

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Modality Detail */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Detail per Modality</h3>
          <ReportTable
            columns={MODALITY_COLUMNS}
            data={data?.byModality || []}
            loading={loading}
            emptyMessage="Tidak ada data modality"
          />
        </div>

        {/* Body Part Breakdown */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Berdasarkan Body Part</h3>
          <ReportTable
            columns={BODY_PART_COLUMNS}
            data={data?.byBodyPart || []}
            loading={loading}
            emptyMessage="Tidak ada data body part"
          />
        </div>
      </div>
    </div>
  );
}
