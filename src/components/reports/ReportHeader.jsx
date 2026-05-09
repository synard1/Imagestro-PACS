import { DocumentChartBarIcon } from '@heroicons/react/24/outline';

/**
 * ReportHeader - Header untuk halaman laporan
 * 
 * @param {string} title - Judul laporan
 * @param {string} subtitle - Deskripsi laporan
 * @param {string} period - Periode laporan (e.g., "1 Dec - 7 Dec 2025")
 * @param {ReactNode} actions - Action buttons (export, filter, etc.)
 */
export default function ReportHeader({
  title,
  subtitle,
  period,
  actions,
  icon,
  className = ''
}) {
  const Icon = icon || DocumentChartBarIcon;

  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            {subtitle && (
              <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
            )}
            {period && (
              <p className="text-xs text-slate-400 mt-1">
                Periode: <span className="font-medium text-slate-600">{period}</span>
              </p>
            )}
          </div>
        </div>
        
        {actions && (
          <div className="flex items-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
