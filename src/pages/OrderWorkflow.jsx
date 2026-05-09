import { useState } from 'react'
import StatusFlowDiagram from '../components/StatusFlowDiagram'
import StatusBadge from '../components/StatusBadge'
import { getAllStatuses, WORKFLOW_PHASES, getStatusConfig, getStatusesByPhase, getAvailableTransitions } from '../config/orderStatus'
import { STATUS_ACTIONS } from '../config/orderActions'

/**
 * OrderWorkflow Page - Documentation and visualization of order workflow
 */
export default function OrderWorkflow() {
  const [selectedStatus, setSelectedStatus] = useState('scheduled')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Order Workflow Documentation</h1>
        <p className="text-slate-600">
          Complete PACS/RIS order status workflow based on DICOM MPPS and IHE Scheduled Workflow standards.
        </p>
      </div>

      {/* Interactive Status Selector */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Select Status to View Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {getAllStatuses(false).map(status => (
            <button
              key={status.key}
              onClick={() => setSelectedStatus(status.key)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                selectedStatus === status.key
                  ? `${status.bgColor} border-${status.color}-500 shadow-md`
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{status.icon}</span>
                <span className={`font-semibold text-sm ${selectedStatus === status.key ? status.textColor : 'text-slate-700'}`}>
                  {status.label}
                </span>
              </div>
              {status.dicom && (
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  DICOM
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Status Details */}
      {selectedStatus && (
        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <StatusBadge status={selectedStatus} showIcon={true} />
                <div className="text-sm text-slate-500">
                  Phase: <span className="font-medium">{WORKFLOW_PHASES[getStatusConfig(selectedStatus).phase].label}</span>
                </div>
              </div>
              <p className="text-slate-600">{getStatusConfig(selectedStatus).description}</p>
            </div>
          </div>

          {/* Action Permissions */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-3">Available Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(STATUS_ACTIONS[selectedStatus] || {}).map(([action, allowed]) => (
                <div
                  key={action}
                  className={`p-3 rounded-lg border ${
                    allowed
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{allowed ? '✅' : '🚫'}</span>
                    <span className={`text-sm font-medium ${allowed ? 'text-green-700' : 'text-red-700'}`}>
                      {action.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className={`text-xs ${allowed ? 'text-green-600' : 'text-red-600'}`}>
                    {allowed ? 'Allowed' : 'Not Allowed'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Allowed Transitions */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-3">Allowed Status Transitions</h3>
            {getStatusConfig(selectedStatus).allowTransitions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {getAvailableTransitions(selectedStatus, false).map(nextConfig => (
                  <button
                    key={nextConfig.key}
                    onClick={() => setSelectedStatus(nextConfig.key)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${nextConfig.bgColor} ${nextConfig.textColor} hover:shadow-md transition-shadow`}
                  >
                    <span className="mr-1">{nextConfig.icon}</span>
                    {nextConfig.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500 italic">
                No further transitions available (terminal state)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Complete Workflow Diagram */}
      <div className="card">
        <StatusFlowDiagram currentStatus={selectedStatus} />
      </div>

      {/* Workflow Phases Summary */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Workflow Phases Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(WORKFLOW_PHASES).map(([key, phase]) => {
            const statuses = getStatusesByPhase(key, false)
            return (
              <div key={key} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h3 className="font-semibold text-slate-800 mb-1">{phase.label}</h3>
                <p className="text-sm text-slate-600 mb-3">{phase.description}</p>
                <div className="space-y-1">
                  {statuses.map(s => (
                    <div key={s.key} className="text-xs flex items-center gap-1">
                      <span>{s.icon}</span>
                      <span>{s.label}</span>
                      {s.dicom && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>}
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {statuses.length} status{statuses.length !== 1 ? 'es' : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* DICOM Standards Info */}
      <div className="card bg-blue-50 border-blue-200">
        <h2 className="text-lg font-semibold text-blue-900 mb-3">DICOM Standards Compliance</h2>
        <div className="space-y-3 text-sm">
          <div>
            <div className="font-medium text-blue-800 mb-1">DICOM Modality Worklist (MWL)</div>
            <div className="text-blue-700">
              Statuses: <strong>PUBLISHED</strong>, <strong>SCHEDULED</strong>, <strong>ARRIVED</strong>
              <br />
              Provides patient and procedure information to modalities via DICOM C-FIND MWL query.
            </div>
          </div>
          <div>
            <div className="font-medium text-blue-800 mb-1">DICOM Modality Performed Procedure Step (MPPS)</div>
            <div className="text-blue-700">
              Statuses: <strong>IN_PROGRESS</strong>, <strong>COMPLETED</strong>, <strong>DISCONTINUED</strong>
              <br />
              Communicates exam status from modality to RIS/PACS in real-time during acquisition.
            </div>
          </div>
          <div className="text-xs text-blue-600 pt-2 border-t border-blue-200">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1"></span>
            Blue dot indicator shows DICOM standard-compliant statuses
          </div>
        </div>
      </div>

      {/* Documentation Link */}
      <div className="card bg-slate-50">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📚</span>
          <div>
            <h3 className="font-semibold text-slate-800 mb-1">Full Documentation</h3>
            <p className="text-sm text-slate-600 mb-2">
              For complete technical documentation including transition rules, API integration, and best practices,
              see the ORDER_WORKFLOW.md file in the docs folder.
            </p>
            <a
              href="/docs/ORDER_WORKFLOW.md"
              target="_blank"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              View Full Documentation →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
