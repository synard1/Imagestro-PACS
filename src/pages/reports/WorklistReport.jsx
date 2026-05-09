import { useState, useEffect } from 'react';
import { QueueListIcon } from '@heroicons/react/24/outline';
import {
  KPICard,
  ReportChart,
  ReportTable,
  DateRangeFilter,
  ExportButtons,
  ReportHeader
} from '../../components/reports';
import { getWorklistReport, exportReport } from '../../services/reportDataService';

const STATUS_COLUMNS = [
  { key: 'status', label: 'Status', sortable: true },
  { key: 'count', label: 'Jumlah', sortable: true },
  { 
    key: 'percentage', 
    label: 'Persentase', 
    sortable: true,
    render: (value) => `${value.toFixed(1)}%`
  }
];

const SHIFT_COLUMNS = [
  { key: 'shift', label: 'Shift', sortable: true },
  { key: 'count', label: 'Jumlah', sortable: true },
  { 
    key: 'avgWait', 
    label: 'Avg Waiting', 
    sortable: true,
    render: (value) => `${value} menit`
  }
];

const SLA_COLUMNS = [
  { key: 'accessionNumber', label: 'Accession No', sortable: true },
  { key: 'patientName', label: 'Nama Pasien', sortable: true },
  { key: 'modality', label: 'Modality', sortable: true },
  { key: 'scheduledAt', label: 'Scheduled', sortable: true },
  { 
    key: 'waitingMinutes', 
    label: 'Waiting', 
    sortable: true,
    render: (value) => (
      <span className={`font-medium ${value > 45 ? 'text-red-600' : 'text-yellow-600'}`}>
        {value} menit
      </span>
    )
  },
  { 
    key: 'status', 
    label: 'Status', 
    sortable: true,
    render: (value) => {
      const colors = {
        in_progress: 'bg-blue-100 text-blue-700',
        scheduled: 'bg-yellow-100 text-yellow-700'
      };
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[value] || 'bg-slate-100'}`}>
          {value?.replace('_', ' ').toUpperCase()}
        </span>
      );
    }
  }
];

export default function WorklistReport() {
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
      const result = await getWorklistReport(filters);
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
    await exportReport('worklist', format, filters);
  };

  const periodText = `${filters.startDate} - ${filters.endDate}`;

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Laporan Worklist"
        subtitle="Statistik worklist dan workflow radiologi"
        period={periodText}
        icon={QueueListIcon}
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

      <DateRangeFilter
        startDate={filters.startDate}
        endDate={filters.endDate}
        onChange={handleDateChange}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard title="Total Entries" value={data?.summary?.totalEntries} loading={loading} />
        <KPICard title="Scheduled" value={data?.summary?.scheduled} loading={loading} />
        <KPICard title="In Progress" value={data?.summary?.inProgress} loading={loading} />
        <KPICard title="Completed" value={data?.summary?.completed} loading={loading} />
        <KPICard title="Avg Waiting" value={data?.summary?.avgWaitingTime} format="duration" loading={loading} subtitle="menit" />
        <KPICard title="Avg Exam Time" value={data?.summary?.avgExamTime} format="duration" loading={loading} subtitle="menit" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportChart
          type="pie"
          data={data?.byStatus || []}
          xKey="status"
          yKey="count"
          title="Distribusi Status"
          height={300}
          loading={loading}
        />
        <ReportChart
          type="line"
          data={data?.trend || []}
          xKey="date"
          yKey={['completed', 'scheduled']}
          title="Trend Worklist"
          height={300}
          loading={loading}
        />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Breakdown per Status</h3>
          <ReportTable columns={STATUS_COLUMNS} data={data?.byStatus || []} loading={loading} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Breakdown per Shift</h3>
          <ReportTable columns={SHIFT_COLUMNS} data={data?.byShift || []} loading={loading} />
        </div>
      </div>

      {/* SLA Breaches */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          SLA Breaches (Waiting &gt; 30 menit)
        </h3>
        <ReportTable
          columns={SLA_COLUMNS}
          data={data?.slaBreaches || []}
          loading={loading}
          emptyMessage="Tidak ada SLA breach"
        />
      </div>
    </div>
  );
}
