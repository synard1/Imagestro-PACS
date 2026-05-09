import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ChartBarIcon,
  DocumentChartBarIcon,
  QueueListIcon,
  UserGroupIcon,
  CircleStackIcon,
  ShieldCheckIcon,
  ComputerDesktopIcon,
  CloudArrowUpIcon,
  ArrowLeftIcon,
  DocumentIcon
} from '@heroicons/react/24/outline';
import { usePermissions } from '../../hooks/usePermissions';

const reportMenuItems = [
  {
    name: 'Dashboard',
    href: '/reports/dashboard',
    icon: ChartBarIcon,
    description: 'Ringkasan semua laporan',
    permissions: ['report.view', '*']
  },
  {
    name: 'Laporan Study',
    href: '/reports/study-reports',
    icon: DocumentIcon,
    description: 'Buat laporan pemeriksaan dari study',
    permissions: ['report.view', '*']
  },
  {
    name: 'Laporan Pendaftaran',
    href: '/reports/registration',
    icon: DocumentChartBarIcon,
    description: 'Statistik pendaftaran order',
    permissions: ['report.view', '*']
  },
  {
    name: 'Laporan Modality',
    href: '/reports/modality',
    icon: ComputerDesktopIcon,
    description: 'Utilisasi modalitas',
    permissions: ['report.view', '*']
  },
  {
    name: 'Laporan SATUSEHAT',
    href: '/reports/satusehat',
    icon: CloudArrowUpIcon,
    description: 'Status sinkronisasi',
    permissions: ['report.view', '*']
  },
  {
    name: 'Laporan Worklist',
    href: '/reports/worklist',
    icon: QueueListIcon,
    description: 'Statistik workflow',
    permissions: ['report.view', '*']
  },
  {
    name: 'Laporan Storage',
    href: '/reports/storage',
    icon: CircleStackIcon,
    description: 'Penggunaan storage',
    permissions: ['report.view', '*']
  },
  {
    name: 'Laporan Produktivitas',
    href: '/reports/productivity',
    icon: UserGroupIcon,
    description: 'Performa dokter & operator',
    permissions: ['report.view', '*']
  },
  {
    name: 'Laporan Audit',
    href: '/reports/audit',
    icon: ShieldCheckIcon,
    description: 'Aktivitas sistem',
    permissions: ['report.view', '*']
  }
];

export default function ReportsLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { hasPermission } = usePermissions();
  const location = useLocation();

  const visibleItems = reportMenuItems.filter(item => 
    hasPermission(item.permissions)
  );

  const isActive = (href) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  return (
    <div className="flex h-full gap-4">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-gray-200 transition-all duration-300 flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <h2 className="text-lg font-bold text-gray-900">Laporan</h2>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors"
              title={sidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}
            >
              {sidebarOpen ? (
                <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronRightIcon className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-2">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                isActive(item.href)
                  ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              title={item.name}
            >
              <item.icon
                className={`w-5 h-5 flex-shrink-0 ${
                  isActive(item.href) ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'
                }`}
              />
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{item.name}</div>
                  <div className="text-xs text-gray-500 truncate">{item.description}</div>
                </div>
              )}
            </Link>
          ))}
        </nav>

        {/* Back Button */}
        <div className="p-3 border-t border-gray-200">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            title="Kembali ke dashboard"
          >
            <ArrowLeftIcon className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm font-medium">Kembali</span>}
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
