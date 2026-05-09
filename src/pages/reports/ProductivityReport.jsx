import { useState, useEffect } from 'react';
import { UserGroupIcon, TrophyIcon } from '@heroicons/react/24/outline';
import {
  KPICard,
  ReportChart,
  ReportTable,
  DateRangeFilter,
  ExportButtons,
  ReportHeader
} from '../../components/reports';
import { getProductivityReport, exportReport } from '../../services/reportDataService';

const DOCTOR_COLUMNS = [
  { 
    key: 'rank',
    label: '#',
    render: (_, __, index) => (
      <span className={`font-bold ${index < 3 ? 'text-yellow-600' : 'text-slate-400'}`}>
        {index + 1}
      </span>
    )
  },
  { key: 'doctorName', label: 'Nama Dokter', sortable: true },
  { key: 'totalOrders', label: 'Total Orders', sortable: true },
  { key: 'completedOrders', label: 'Completed', sortable: true },
  { 
    key: 'completionRate', 
    label: 'Completion Rate', 
    sortable: true,
    render: (value) => {
      const color = value >= 95 ? 'text-green-600' : value >= 80 ? 'text-yellow-600' : 'text-red-600';
      return <span className={`font-medium ${color}`}>{value.toFixed(1)}%</span>;
    }
  },
  { 
    key: 'avgTurnaround', 
    label: 'Avg Turnaround', 
    sortable: true,
    render: (value) => `${value} menit`
  }
];

const OPERATOR_COLUMNS = [
  { 
    key: 'rank',
    label: '#',
    render: (_, __, index) => (
      <span className={`font-bold ${index < 3 ? 'text-yellow-600' : 'text-slate-400'}`}>
        {index + 1}
      </span>
    )
  },
  { key: 'operatorName', label: 'Nama Operator', sortable: true },
  { key: 'totalExams', label: 'Total Exams', sortable: true },
  { 
    key: 'avgExamTime', 
    label: 'Avg Exam Time', 
    sortable: true,
    render: (value) => `${value} menit`
  },
  { 
    key: 'completionRate', 
    label: 'Completion Rate', 
    sortable: true,
    render: (value) => {
      const color = value >= 95 ? 'text-green-600' : value >= 80 ? 'text-yellow-600' : 'text-red-600';
      return <span className={`font-medium ${color}`}>{value.toFixed(1)}%</span>;
    }
  }
];

export default function ProductivityReport() {
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
      const result = await getProductivityReport(filters);
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
    await exportReport('productivity', format, filters);
  };

  const periodText = `${filters.startDate} - ${filters.endDate}`;

  // Calculate totals
  const totalDoctorOrders = data?.byDoctor?.reduce((sum, d) => sum + d.totalOrders, 0) || 0;
  const totalOperatorExams = data?.byOperator?.reduce((sum, o) => sum + o.totalExams, 0) || 0;
  const avgDoctorCompletion = data?.byDoctor?.length 
    ? (data.byDoctor.reduce((sum, d) => sum + d.completionRate, 0) / data.byDoctor.length).toFixed(1)
    : 0;
  const avgOperatorCompletion = data?.byOperator?.length
    ? (data.byOperator.reduce((sum, o) => sum + o.completionRate, 0) / data.byOperator.length).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Laporan Produktivitas"
        subtitle="Performa dokter perujuk dan operator radiologi"
        period={periodText}
        icon={UserGroupIcon}
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

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Doctor Orders" value={totalDoctorOrders} loading={loading} />
        <KPICard title="Avg Doctor Completion" value={avgDoctorCompletion} format="percentage" loading={loading} />
        <KPICard title="Total Operator Exams" value={totalOperatorExams} loading={loading} />
        <KPICard title="Avg Operator Completion" value={avgOperatorCompletion} format="percentage" loading={loading} />
      </div>

      {/* Top Performers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Doctor */}
        {data?.byDoctor?.[0] && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl p-5 border border-yellow-200">
            <div className="flex items-center gap-3 mb-3">
              <TrophyIcon className="w-6 h-6 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-700">Top Referring Doctor</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{data.byDoctor[0].doctorName}</p>
            <div className="flex gap-4 mt-2 text-sm text-slate-600">
              <span>{data.byDoctor[0].totalOrders} orders</span>
              <span>{data.byDoctor[0].completionRate}% completion</span>
            </div>
          </div>
        )}

        {/* Top Operator */}
        {data?.byOperator?.[0] && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
            <div className="flex items-center gap-3 mb-3">
              <TrophyIcon className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">Top Operator</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{data.byOperator[0].operatorName}</p>
            <div className="flex gap-4 mt-2 text-sm text-slate-600">
              <span>{data.byOperator[0].totalExams} exams</span>
              <span>{data.byOperator[0].completionRate}% completion</span>
            </div>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportChart
          type="bar"
          data={data?.byDoctor || []}
          xKey="doctorName"
          yKey="totalOrders"
          title="Orders per Dokter"
          height={300}
          loading={loading}
          colors={['#3B82F6']}
        />
        <ReportChart
          type="bar"
          data={data?.byOperator || []}
          xKey="operatorName"
          yKey="totalExams"
          title="Exams per Operator"
          height={300}
          loading={loading}
          colors={['#10B981']}
        />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Ranking Dokter Perujuk</h3>
          <ReportTable
            columns={DOCTOR_COLUMNS}
            data={data?.byDoctor || []}
            loading={loading}
            emptyMessage="Tidak ada data dokter"
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Ranking Operator</h3>
          <ReportTable
            columns={OPERATOR_COLUMNS}
            data={data?.byOperator || []}
            loading={loading}
            emptyMessage="Tidak ada data operator"
          />
        </div>
      </div>
    </div>
  );
}
