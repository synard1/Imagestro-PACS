import { useState, useEffect } from 'react';
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import {
  KPICard,
  ReportChart,
  ReportTable,
  DateRangeFilter,
  ExportButtons,
  ReportHeader
} from '../../components/reports';
import { getRegistrationReport, exportReport } from '../../services/reportDataService';

const SOURCE_OPTIONS = [
  { value: 'all', label: 'Semua Sumber' },
  { value: 'SIMRS Khanza', label: 'SIMRS Khanza' },
  { value: 'API Integration', label: 'API Integration' },
  { value: 'Manual Entry', label: 'Manual Entry' }
];

const PATIENT_TYPE_OPTIONS = [
  { value: 'all', label: 'Semua Jenis' },
  { value: 'Rawat Jalan', label: 'Rawat Jalan' },
  { value: 'Rawat Inap', label: 'Rawat Inap' },
  { value: 'IGD', label: 'IGD' }
];

const TABLE_COLUMNS = [
  { key: 'orderNumber', label: 'No. Order', sortable: true },
  { key: 'patientName', label: 'Nama Pasien', sortable: true },
  { key: 'patientId', label: 'ID Pasien', sortable: false },
  { key: 'source', label: 'Sumber', sortable: true },
  { key: 'patientType', label: 'Jenis Rawat', sortable: true },
  { key: 'modality', label: 'Modality', sortable: true },
  { key: 'registeredAt', label: 'Waktu Daftar', sortable: true },
  { 
    key: 'status', 
    label: 'Status', 
    sortable: true,
    render: (value) => {
      const colors = {
        completed: 'bg-green-100 text-green-700',
        in_progress: 'bg-blue-100 text-blue-700',
        scheduled: 'bg-yellow-100 text-yellow-700',
        cancelled: 'bg-red-100 text-red-700'
      };
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[value] || 'bg-slate-100'}`}>
          {value?.replace('_', ' ').toUpperCase()}
        </span>
      );
    }
  }
];

export default function RegistrationReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    source: 'all',
    patientType: 'all'
  });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0 });

  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await getRegistrationReport(filters);
      setData(result);
      setPagination(prev => ({ ...prev, total: result.details?.length || 0 }));
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

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleExport = async (format) => {
    await exportReport('registration', format, filters);
  };

  const handlePrint = () => {
    window.print();
  };

  const paginatedData = data?.details?.slice(
    (pagination.page - 1) * pagination.pageSize,
    pagination.page * pagination.pageSize
  ) || [];

  const periodText = `${filters.startDate} - ${filters.endDate}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <ReportHeader
        title="Laporan Pendaftaran"
        subtitle="Statistik dan detail pendaftaran order radiologi"
        period={periodText}
        icon={ClipboardDocumentListIcon}
        actions={
          <ExportButtons
            onExportPDF={() => handleExport('pdf')}
            onExportExcel={() => handleExport('excel')}
            onExportCSV={() => handleExport('csv')}
            onPrint={handlePrint}
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <DateRangeFilter
          startDate={filters.startDate}
          endDate={filters.endDate}
          onChange={handleDateChange}
          className="lg:col-span-2"
        />
        
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="block text-xs text-slate-500 mb-2">Sumber Pendaftaran</label>
          <select
            value={filters.source}
            onChange={(e) => handleFilterChange('source', e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SOURCE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="block text-xs text-slate-500 mb-2">Jenis Rawat</label>
          <select
            value={filters.patientType}
            onChange={(e) => handleFilterChange('patientType', e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PATIENT_TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Pendaftaran"
          value={data?.summary?.totalRegistrations}
          change={data?.summary?.weeklyChange}
          changeType={data?.summary?.weeklyChange >= 0 ? 'increase' : 'decrease'}
          loading={loading}
        />
        <KPICard
          title="Pendaftaran Hari Ini"
          value={data?.summary?.todayRegistrations}
          loading={loading}
        />
        <KPICard
          title="Rata-rata per Hari"
          value={data?.summary?.averagePerDay}
          loading={loading}
        />
        <KPICard
          title="Perubahan Mingguan"
          value={data?.summary?.weeklyChange}
          format="percentage"
          changeType={data?.summary?.weeklyChange >= 0 ? 'increase' : 'decrease'}
          loading={loading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <ReportChart
          type="area"
          data={data?.trend || []}
          xKey="date"
          yKey="count"
          title="Trend Pendaftaran"
          height={250}
          loading={loading}
          className="lg:col-span-2"
        />

        {/* Source Breakdown */}
        <ReportChart
          type="pie"
          data={data?.bySource || []}
          xKey="source"
          yKey="count"
          title="Berdasarkan Sumber"
          height={250}
          loading={loading}
          showLegend={false}
        />
      </div>

      {/* Patient Type Breakdown */}
      <ReportChart
        type="bar"
        data={data?.byPatientType || []}
        xKey="type"
        yKey="count"
        title="Berdasarkan Jenis Rawat"
        height={200}
        loading={loading}
        colors={['#3B82F6']}
      />

      {/* Detail Table */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Detail Pendaftaran</h3>
        <ReportTable
          columns={TABLE_COLUMNS}
          data={paginatedData}
          pagination={pagination}
          onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
          loading={loading}
          emptyMessage="Tidak ada data pendaftaran untuk periode ini"
        />
      </div>
    </div>
  );
}
