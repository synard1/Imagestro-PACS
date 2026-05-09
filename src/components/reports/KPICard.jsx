import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from '@heroicons/react/24/solid';

/**
 * KPICard - Reusable card untuk menampilkan Key Performance Indicator
 * 
 * @param {string} title - Judul KPI
 * @param {number|string} value - Nilai KPI
 * @param {number} change - Persentase perubahan dari periode sebelumnya
 * @param {string} changeType - 'increase' | 'decrease' | 'neutral'
 * @param {ReactNode} icon - Icon untuk KPI
 * @param {function} onClick - Handler saat card diklik
 * @param {boolean} loading - Loading state
 * @param {string} subtitle - Subtitle/description
 * @param {string} format - Format value: 'number' | 'percentage' | 'duration' | 'bytes'
 */
export default function KPICard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon,
  onClick,
  loading = false,
  subtitle,
  format = 'number',
  className = ''
}) {
  const formatValue = (val) => {
    if (val === null || val === undefined) return '-';
    
    // Convert string to number if needed
    const numVal = typeof val === 'string' ? parseFloat(val) : val;
    
    // If conversion failed or value is not a number, return as string
    if (typeof numVal !== 'number' || isNaN(numVal)) {
      return String(val);
    }
    
    switch (format) {
      case 'percentage':
        return `${numVal.toFixed(1)}%`;
      case 'duration':
        // Assume value is in minutes
        if (numVal >= 60) {
          const hours = Math.floor(numVal / 60);
          const mins = Math.round(numVal % 60);
          return `${hours}h ${mins}m`;
        }
        return `${Math.round(numVal)}m`;
      case 'bytes':
        // Format bytes to human readable
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let unitIndex = 0;
        let size = numVal;
        while (size >= 1024 && unitIndex < units.length - 1) {
          size /= 1024;
          unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
      case 'number':
      default:
        return numVal.toLocaleString('id-ID');
    }
  };

  const getChangeIcon = () => {
    if (changeType === 'increase') {
      return <ArrowUpIcon className="w-4 h-4" />;
    } else if (changeType === 'decrease') {
      return <ArrowDownIcon className="w-4 h-4" />;
    }
    return <MinusIcon className="w-4 h-4" />;
  };

  const getChangeColor = () => {
    if (changeType === 'increase') return 'text-green-600 bg-green-50';
    if (changeType === 'decrease') return 'text-red-600 bg-red-50';
    return 'text-slate-600 bg-slate-50';
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-1/2 mb-3"></div>
          <div className="h-8 bg-slate-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-slate-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 p-5 transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300' : ''
      } ${className}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{formatValue(value)}</p>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            {icon}
          </div>
        )}
      </div>
      
      {change !== undefined && change !== null && (
        <div className="mt-3 flex items-center gap-1">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getChangeColor()}`}>
            {getChangeIcon()}
            {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-xs text-slate-400">vs periode sebelumnya</span>
        </div>
      )}
    </div>
  );
}
