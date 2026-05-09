import { WORKFLOW_PHASES, getStatusesByPhase, getStatusConfig } from '../config/orderStatus'

/**
 * StatusFlowDiagram - Visual representation of PACS/RIS workflow
 * Shows all available statuses grouped by workflow phase
 */
export default function StatusFlowDiagram({ currentStatus, compact = false }) {
  const phases = Object.entries(WORKFLOW_PHASES)

  if (compact) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {phases.map(([key, phase]) => {
          const statuses = getStatusesByPhase(key, false)
          const hasCurrentStatus = statuses.some(s => s.key === currentStatus)

          return (
            <div key={key} className={`flex-shrink-0 px-3 py-2 rounded border-2 ${hasCurrentStatus ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
              <div className="text-xs font-semibold text-slate-700">{phase.label}</div>
              <div className="flex gap-1 mt-1">
                {statuses.map(s => (
                  <span
                    key={s.key}
                    className={`inline-block w-2 h-2 rounded-full ${s.key === currentStatus ? s.bgColor : 'bg-slate-200'}`}
                    title={s.label}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-800">PACS/RIS Order Workflow</h3>
        <p className="text-sm text-slate-500 mt-1">Based on DICOM MPPS and IHE Scheduled Workflow</p>
      </div>

      {/* Flow Diagram */}
      <div className="space-y-4">
        {phases.map(([phaseKey, phase], phaseIdx) => {
          const statuses = getStatusesByPhase(phaseKey, false)

          return (
            <div key={phaseKey} className="relative">
              {/* Phase Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-1 h-8 rounded bg-${phase.color}-500`}></div>
                <div>
                  <div className="font-semibold text-slate-800">{phase.label}</div>
                  <div className="text-xs text-slate-500">{phase.description}</div>
                </div>
              </div>

              {/* Status Cards in Phase */}
              <div className="ml-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {statuses.map((status, idx) => {
                  const isActive = status.key === currentStatus
                  const config = getStatusConfig(status.key)

                  return (
                    <div
                      key={status.key}
                      className={`relative p-3 rounded-lg border-2 transition-all ${
                        isActive
                          ? `${config.bgColor} border-${config.color}-500 shadow-md scale-105`
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Status Header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{status.icon}</span>
                        <div className="flex-1">
                          <div className={`font-semibold text-sm ${isActive ? config.textColor : 'text-slate-700'}`}>
                            {status.label}
                          </div>
                          {status.dicom && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              DICOM
                              {status.mpps && ' MPPS'}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <div className="text-xs text-slate-600 mb-2">
                        {status.description}
                      </div>

                      {/* Transitions */}
                      {status.allowTransitions.length > 0 && (
                        <div className="text-xs text-slate-500 border-t border-slate-200 pt-2 mt-2">
                          <div className="font-medium mb-1">Next →</div>
                          <div className="flex flex-wrap gap-1">
                            {status.allowTransitions.map(nextKey => {
                              const nextConfig = getStatusConfig(nextKey)
                              return (
                                <span
                                  key={nextKey}
                                  className={`px-1.5 py-0.5 rounded text-[10px] ${nextConfig.bgColor} ${nextConfig.textColor}`}
                                >
                                  {nextConfig.label}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Active Indicator */}
                      {isActive && (
                        <div className="absolute -top-1 -right-1">
                          <span className="flex h-3 w-3">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-${config.color}-400 opacity-75`}></span>
                            <span className={`relative inline-flex rounded-full h-3 w-3 bg-${config.color}-500`}></span>
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Arrow to next phase */}
              {phaseIdx < phases.length - 1 && (
                <div className="flex justify-center my-2">
                  <div className="text-slate-400">↓</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="text-sm font-semibold text-slate-700 mb-2">Legend</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            <span>DICOM Standard Status (MPPS/SPS)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded border-2 border-blue-500 bg-blue-50"></span>
            <span>Current Status</span>
          </div>
          <div className="flex items-center gap-2">
            <span>→</span>
            <span>Allowed status transitions</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <span>Exception states (cancelled, no-show, etc.)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
