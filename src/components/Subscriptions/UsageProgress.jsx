import React from 'react';

/**
 * UsageProgress component using OKLCH color space for better accessibility
 * and visual consistency.
 */
const UsageProgress = ({ label, current, max, unit = '', color = '259 80% 50%' }) => {
  const percentage = Math.min(100, Math.round((current / max) * 100)) || 0;
  
  // Status-based color logic
  let statusColor = `oklch(${color})`; // Default
  if (percentage > 90) statusColor = 'oklch(60% 0.15 20)'; // Red-ish for danger
  else if (percentage > 70) statusColor = 'oklch(70% 0.15 50)'; // Amber-ish for warning
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="text-xs font-mono text-slate-500">
          {(current || 0).toLocaleString()} / {(max || 0).toLocaleString()} {unit}
          <span className="ml-2 font-bold" style={{ color: statusColor }}>{percentage}%</span>
        </span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
        <div 
          className="h-full transition-all duration-1000 ease-out rounded-full"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: statusColor,
            boxShadow: `0 0 10px ${statusColor}40`
          }}
        />
      </div>
    </div>
  );
};

export default UsageProgress;
