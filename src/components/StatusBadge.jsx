import { getStatusConfig } from '../config/orderStatus'

// Map status to named badge utility classes (4-color rule: green/yellow/gray/red)
// Green = active/completed, Yellow = in-progress/pending, Gray = neutral, Red = action required
const BADGE_CLASS_MAP = {
  // Green - active, completed, verified
  scheduled:   'badge badge-green',
  arrived:     'badge badge-green',
  completed:   'badge badge-green',
  verified:    'badge badge-green',
  archived:    'badge badge-green',
  // Yellow - in progress, pending, warning
  in_progress: 'badge badge-yellow',
  discontinued: 'badge badge-yellow',
  reported:    'badge badge-yellow',
  rescheduled: 'badge badge-yellow',
  // Gray - neutral, inactive
  created:     'badge badge-gray',
  draft:       'badge badge-gray',
  enqueued:    'badge badge-gray',
  published:   'badge badge-gray',
  // Red - cancelled, error, no-show
  cancelled:   'badge badge-red',
  no_show:     'badge badge-red',
}

export default function StatusBadge({ status, showIcon = false, className = '' }) {
  const config = getStatusConfig(status)
  const badgeClass = BADGE_CLASS_MAP[status] || 'badge badge-gray'

  return (
    <span className={`${badgeClass} ${className}`}>
      {showIcon && <span>{config.icon}</span>}
      <span>{config.label}</span>
      {config.dicom && (
        <span
          className="text-[10px] opacity-60 leading-none"
          title="DICOM Standard Status"
        >
          ●
        </span>
      )}
    </span>
  )
}
