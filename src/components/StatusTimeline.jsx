import { getStatusConfig } from '../config/orderStatus'

/**
 * StatusTimeline - Shows history of status changes for an order
 * Displays chronological timeline with timestamps and user info
 */
export default function StatusTimeline({ history = [], compact = false }) {
  if (!history || history.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic">
        No status history available
      </div>
    )
  }

  // Sort by timestamp descending (newest first)
  const sortedHistory = [...history].sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  )

  if (compact) {
    return (
      <div className="space-y-2">
        {sortedHistory.map((entry, idx) => {
          const config = getStatusConfig(entry.status)
          const date = new Date(entry.timestamp)

          return (
            <div key={idx} className="flex items-center gap-3 text-sm">
              <div className={`w-2 h-2 rounded-full ${config.bgColor}`}></div>
              <div className="flex-1">
                <span className={`font-medium ${config.textColor}`}>{config.label}</span>
                <span className="text-slate-500 text-xs ml-2">
                  {date.toLocaleString()}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200"></div>

      {/* Timeline entries */}
      <div className="space-y-6">
        {sortedHistory.map((entry, idx) => {
          const config = getStatusConfig(entry.status)
          const date = new Date(entry.timestamp)
          const isFirst = idx === 0

          return (
            <div key={idx} className="relative flex gap-4">
              {/* Timeline dot */}
              <div className="relative flex-shrink-0">
                <div className={`w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${config.bgColor} ${isFirst ? 'ring-4 ring-blue-100' : ''}`}>
                  <span className="text-sm">{config.icon}</span>
                </div>
                {isFirst && (
                  <div className="absolute -top-1 -right-1">
                    <span className="flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                    </span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className={`flex-1 pb-6 ${isFirst ? 'pt-0.5' : ''}`}>
                <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                  {/* Status header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-sm font-semibold ${config.bgColor} ${config.textColor}`}>
                        {config.label}
                      </span>
                      {config.dicom && (
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          DICOM {config.mpps ? 'MPPS' : 'SPS'}
                        </span>
                      )}
                    </div>
                    {isFirst && (
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        Current
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <div className="text-sm text-slate-600 mb-3">
                    {config.description}
                  </div>

                  {/* Metadata */}
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <span>📅</span>
                      <span>{date.toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>🕐</span>
                      <span>{date.toLocaleTimeString()}</span>
                    </div>
                    {entry.user && (
                      <div className="flex items-center gap-1">
                        <span>👤</span>
                        <span>{entry.user}</span>
                      </div>
                    )}
                    {entry.notes && (
                      <div className="w-full mt-2 pt-2 border-t border-slate-100">
                        <div className="text-slate-600">
                          <span className="font-medium">Notes: </span>
                          {entry.notes}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
