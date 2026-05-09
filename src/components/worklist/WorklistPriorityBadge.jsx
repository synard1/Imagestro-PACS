import { getPriorityBadge } from '../../services/worklistService';

/**
 * Worklist Priority Badge Component
 * Displays order priority with color coding and icon
 */
export default function WorklistPriorityBadge({ priority, showIcon = true, className = '' }) {
  const config = getPriorityBadge(priority);
  
  const colorClasses = {
    red: 'bg-red-100 text-red-800 border-red-300',
    orange: 'bg-orange-100 text-orange-800 border-orange-300',
    blue: 'bg-blue-100 text-blue-800 border-blue-300',
    gray: 'bg-gray-100 text-gray-800 border-gray-300'
  };
  
  const colorClass = colorClasses[config.color] || colorClasses.gray;
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${colorClass} ${className}`}
    >
      {showIcon && <span>{config.icon}</span>}
      <span>{config.label}</span>
    </span>
  );
}
