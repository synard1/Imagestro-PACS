import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardDocumentListIcon,
  ComputerDesktopIcon,
  CloudArrowUpIcon,
  QueueListIcon,
  CircleStackIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { KPICard, ReportChart } from '../../components/reports';
import { getDashboardData } from '../../services/reportDataService';

const REPORT_LINKS = [
  {
    title: 'Laporan Pendaftaran',
    description: 'Statistik dan detail pendaftaran order',
    icon: ClipboardDocumentListIcon,
    path: '/reports/registration',
    color: 'bg-blue-50 text-blue-600'
  },
  {
    title: 'Laporan Modality',
    description: 'Utilisasi dan performa modalitas',
    icon: ComputerDesktopIcon,
    path: '/reports/modality',
    color: 'bg-green-50 text-green-600'
  },
  {
    title: 'Laporan SATUSEHAT',
    description: 'Status sinkronisasi SATUSEHAT',
    icon: CloudArrowUpIcon,
    path: '/reports/satusehat',
    color: 'bg-purple-50 text-purple-600'
  },
  {
    title: 'Laporan Worklist',
    description: 'Statistik worklist dan workflow',
    icon: QueueListIcon,
    path: '/reports/worklist',
    color: 'bg-yellow-50 text-yellow-600'
  },
  {
    title: 'Laporan Storage',
    description: 'Penggunaan storage DICOM',
    icon: CircleStackIcon,
    path: '/reports/storage',
    color: 'bg-red-50 text-red-600'
  },
  {
    title: 'Laporan Produktivitas',
    description: 'Performa dokter dan operator',
    icon: UserGroupIcon,
    path: '/reports/productivity',
    color: 'bg-indigo-50 text-indigo-600'
  },
  {
    title: 'Laporan Audit',
    description: 'Aktivitas sistem dan user',
    icon: ShieldCheckIcon,
    path: '/reports/audit',
    color: 'bg-slate-100 text-slate-600'
  }
];

export default function ReportsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await getDashboardData();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Laporan</h1>
        <p className="text-sm text-slate-500 mt-1">
          Ringkasan metrik dan akses cepat ke semua jenis laporan
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          title="Total Orders"
          value={data?.kpis?.totalOrders?.value}
          change={data?.kpis?.totalOrders?.change}
          changeType={data?.kpis?.totalOrders?.changeType}
          loading={loading}
          subtitle="7 hari terakhir"
        />
        <KPICard
          title="Completion Rate"
          value={data?.kpis?.completionRate?.value}
          change={data?.kpis?.completionRate?.change}
          changeType={data?.kpis?.completionRate?.changeType}
          format="percentage"
          loading={loading}
        />
        <KPICard
          title="Avg Turnaround"
          value={data?.kpis?.avgTurnaround?.value}
          change={data?.kpis?.avgTurnaround?.change}
          changeType="increase" // decrease in turnaround is good
          format="duration"
          loading={loading}
        />
        <KPICard
          title="SATUSEHAT Sync"
          value={data?.kpis?.satusehatSync?.value}
          change={data?.kpis?.satusehatSync?.change}
          changeType={data?.kpis?.satusehatSync?.changeType}
          format="percentage"
          loading={loading}
        />
        <KPICard
          title="Storage Usage"
          value={data?.kpis?.storageUsage?.value}
          change={data?.kpis?.storageUsage?.change}
          changeType={data?.kpis?.storageUsage?.changeType}
          format="percentage"
          loading={loading}
        />
        <KPICard
          title="Active Worklist"
          value={data?.kpis?.activeWorklist?.value}
          change={data?.kpis?.activeWorklist?.change}
          changeType={data?.kpis?.activeWorklist?.changeType}
          loading={loading}
        />
      </div>

      {/* Quick Stats & Mini Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders Trend */}
        <ReportChart
          type="area"
          data={data?.miniTrends?.orders || []}
          xKey="date"
          yKey="value"
          title="Trend Orders (7 Hari)"
          height={200}
          loading={loading}
          showLegend={false}
        />

        {/* Completion Trend */}
        <ReportChart
          type="line"
          data={data?.miniTrends?.completion || []}
          xKey="date"
          yKey="value"
          title="Trend Completion Rate (7 Hari)"
          height={200}
          loading={loading}
          showLegend={false}
          colors={['#10B981']}
        />
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-600 font-medium">Orders Hari Ini</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">
            {loading ? '...' : data?.quickStats?.todayOrders || 0}
          </p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4">
          <p className="text-xs text-yellow-600 font-medium">Pending Worklist</p>
          <p className="text-2xl font-bold text-yellow-900 mt-1">
            {loading ? '...' : data?.quickStats?.pendingWorklist || 0}
          </p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-xs text-red-600 font-medium">Failed Sync</p>
          <p className="text-2xl font-bold text-red-900 mt-1">
            {loading ? '...' : data?.quickStats?.failedSync || 0}
          </p>
        </div>
        <div className={`rounded-xl p-4 ${data?.quickStats?.storageWarning ? 'bg-red-50' : 'bg-green-50'}`}>
          <p className={`text-xs font-medium ${data?.quickStats?.storageWarning ? 'text-red-600' : 'text-green-600'}`}>
            Storage Status
          </p>
          <p className={`text-2xl font-bold mt-1 ${data?.quickStats?.storageWarning ? 'text-red-900' : 'text-green-900'}`}>
            {loading ? '...' : data?.quickStats?.storageWarning ? 'Warning!' : 'OK'}
          </p>
        </div>
      </div>

      {/* Report Links */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Akses Laporan</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {REPORT_LINKS.map((report) => {
            const Icon = report.icon;
            return (
              <Link
                key={report.path}
                to={report.path}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-blue-300 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${report.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-slate-900 group-hover:text-blue-600">
                      {report.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {report.description}
                    </p>
                  </div>
                  <ArrowRightIcon className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
