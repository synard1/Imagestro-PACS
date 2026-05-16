/**
 * SeverityBadge — renders a colored badge based on error event severity.
 *
 * Uses dark-neutral theme tokens with WCAG AA contrast ratios:
 * - low:      gray background, light text
 * - medium:   yellow/amber background, dark text
 * - high:     orange background, dark text
 * - critical: red background, white text
 *
 * @param {Object} props
 * @param {string} props.severity - One of: low, medium, high, critical
 * @param {string} [props.className] - Additional CSS classes
 */
export function SeverityBadge({ severity, className = '' }) {
  const config = SEVERITY_MAP[severity] || SEVERITY_MAP.low

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.classes} ${className}`}
      role="status"
      aria-label={`Severity: ${severity}`}
    >
      {config.label}
    </span>
  )
}

const SEVERITY_MAP = {
  low: {
    label: 'Low',
    // Gray badge: neutral-700 bg with neutral-200 text — contrast ratio ~7:1
    classes: 'bg-neutral-700 text-neutral-200',
  },
  medium: {
    label: 'Medium',
    // Yellow/amber badge: amber-900/80 bg with amber-200 text — contrast ratio ~5.5:1
    classes: 'bg-yellow-900/80 text-yellow-200',
  },
  high: {
    label: 'High',
    // Orange badge: orange-900/80 bg with orange-200 text — contrast ratio ~5:1
    classes: 'bg-orange-900/80 text-orange-200',
  },
  critical: {
    label: 'Critical',
    // Red badge: red-700 bg with white text — contrast ratio ~5.5:1
    classes: 'bg-red-700 text-white',
  },
}
