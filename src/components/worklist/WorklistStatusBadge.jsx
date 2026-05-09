import { getStatusBadge } from '../../services/worklistService';

/**
 * Worklist Status Badge Component
 * Displays order status with color coding and icon
 */
export default function WorklistStatusBadge({ status, showIcon = true, showDescription = false, className = '' }) {
  const config = getStatusBadge(status);
  
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-800 border-gray-300',
    blue: 'bg-blue-100 text-blue-800 border-blue-300',
    indigo: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    purple: 'bg-purple-100 text-purple-800 border-purple-300',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    cyan: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    green: 'bg-green-100 text-green-800 border-green-300',
    teal: 'bg-teal-100 text-teal-800 border-teal-300',
    emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    red: 'bg-red-100 text-red-800 border-red-300',
    orange: 'bg-orange-100 text-orange-800 border-orange-300'
  };
  
  const colorClass = colorClasses[config.color] || colorClasses.gray;
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${colorClass} ${className}`}
      title={showDescription ? config.description : undefined}
    >
      {showIcon && <span>{config.icon}</span>}
      <span>{config.label}</span>
    </span>
  );
}
