import { useEffect, useState } from 'react';
import { 
  ChartBarIcon, 
  DocumentChartBarIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationIcon
} from '@heroicons/react/24/outline';
import reportService from '../../services/reportService';

export default function ReportsDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      setLoading(true);
      const data = await reportService.getDashboardStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Gagal memuat statistik dashboard');
      console.error('Error loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <ExclamationIcon className="w-5 h-5 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Orders',
      value: stats?.totalOrders || 0,
      icon: DocumentChartBarIcon,
      color: 'blue',
      trend: stats?.ordersTrend || 0
    },
    {
      title: 'Orders Hari Ini',
      value: stats?.ordersToday || 0,
      icon: ClockIcon,
      color: 'green',
      trend: stats?.ordersTodayTrend || 0
    },
    {
      title: 'Completed Studies',
      value: stats?.completedStudies || 0,
      icon: CheckCircleIcon,
      color: 'emerald',
      trend: stats?.completedStudiesTrend || 0
    },
    {
      title: 'Pending Orders',
      value: stats?.pendingOrders || 0,
      icon: ArrowTrendingUpIcon,
      color: 'amber',
      trend: stats?.pendingOrdersTrend || 0
    }
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Laporan</h1>
        <p className="text-gray-600 mt-2">Ringkasan statistik sistem PACS</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          const colorClasses = {
            blue: 'bg-blue-50 text-blue-600 border-blue-200',
            green: 'bg-green-50 text-green-600 border-green-200',
            emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
            amber: 'bg-amber-50 text-amber-600 border-amber-200'
          };

          return (
            <div
              key={index}
              className={`border rounded-lg p-6 ${colorClasses[card.color]}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium opacity-75">{card.title}</p>
                  <p className="text-3xl font-bold mt-2">{card.value.toLocaleString()}</p>
                  {card.trend !== 0 && (
                    <p className={`text-sm mt-2 ${card.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {card.trend > 0 ? '↑' : '↓'} {Math.abs(card.trend)}% dari kemarin
                    </p>
                  )}
                </div>
                <Icon className="w-12 h-12 opacity-20" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Laporan Tersedia</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <a
            href="/reports/registration"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <DocumentChartBarIcon className="w-8 h-8 text-blue-600 mb-2" />
            <h3 className="font-semibold text-gray-900">Laporan Pendaftaran</h3>
            <p className="text-sm text-gray-600 mt-1">Statistik pendaftaran order</p>
          </a>
          <a
            href="/reports/modality"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <ChartBarIcon className="w-8 h-8 text-blue-600 mb-2" />
            <h3 className="font-semibold text-gray-900">Laporan Modality</h3>
            <p className="text-sm text-gray-600 mt-1">Utilisasi modalitas</p>
          </a>
          <a
            href="/reports/worklist"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <DocumentChartBarIcon className="w-8 h-8 text-blue-600 mb-2" />
            <h3 className="font-semibold text-gray-900">Laporan Worklist</h3>
            <p className="text-sm text-gray-600 mt-1">Statistik workflow</p>
          </a>
          <a
            href="/reports/storage"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <ChartBarIcon className="w-8 h-8 text-blue-600 mb-2" />
            <h3 className="font-semibold text-gray-900">Laporan Storage</h3>
            <p className="text-sm text-gray-600 mt-1">Penggunaan storage</p>
          </a>
          <a
            href="/reports/productivity"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <ChartBarIcon className="w-8 h-8 text-blue-600 mb-2" />
            <h3 className="font-semibold text-gray-900">Laporan Produktivitas</h3>
            <p className="text-sm text-gray-600 mt-1">Performa dokter & operator</p>
          </a>
          <a
            href="/reports/audit"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <ChartBarIcon className="w-8 h-8 text-blue-600 mb-2" />
            <h3 className="font-semibold text-gray-900">Laporan Audit</h3>
            <p className="text-sm text-gray-600 mt-1">Aktivitas sistem</p>
          </a>
        </div>
      </div>
    </div>
  );
}
