/**
 * PACS/RIS Order Status Configuration
 * Based on DICOM MPPS (Modality Performed Procedure Step) and IHE Scheduled Workflow
 *
 * References:
 * - DICOM Standard Part 3: Scheduled Procedure Step Status
 * - DICOM MPPS: Modality Performed Procedure Step
 * - IHE Radiology Technical Framework: Scheduled Workflow
 */

export const ORDER_STATUS = {
  // === PRE-EXAMINATION PHASE ===
  CREATED: {
    key: 'created',
    label: 'Created',
    description: 'Order has been created, ready for editing and preparation',
    color: 'slate',
    bgColor: 'bg-slate-100',
    textColor: 'text-slate-700',
    phase: 'pre-exam',
    allowTransitions: ['draft', 'enqueued', 'scheduled', 'cancelled'],
    icon: '📝',
    order: 1
  },
  DRAFT: {
    key: 'draft',
    label: 'Draft',
    description: 'Order is being prepared, not yet finalized',
    color: 'slate',
    bgColor: 'bg-slate-100',
    textColor: 'text-slate-700',
    phase: 'pre-exam',
    allowTransitions: ['enqueued', 'scheduled', 'cancelled'],
    icon: '📝',
    order: 2
  },
  ENQUEUED: {
    key: 'enqueued',
    label: 'Enqueued',
    description: 'Order added to MWL queue, pending publish',
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    phase: 'pre-exam',
    allowTransitions: ['published', 'cancelled'],
    icon: '📋',
    order: 3,
    hidden: true // Hidden due to lack of modality integration
  },
  PUBLISHED: {
    key: 'published',
    label: 'Published',
    description: 'Order published to DICOM Modality Worklist (MWL)',
    color: 'indigo',
    bgColor: 'bg-indigo-100',
    textColor: 'text-indigo-700',
    phase: 'pre-exam',
    allowTransitions: ['scheduled', 'cancelled'],
    icon: '📤',
    order: 4,
    hidden: true // Hidden due to lack of modality integration
  },
  SCHEDULED: {
    key: 'scheduled',
    label: 'Scheduled',
    description: 'Scheduled Procedure Step (SPS) created, waiting for patient',
    color: 'sky',
    bgColor: 'bg-sky-100',
    textColor: 'text-sky-700',
    phase: 'pre-exam',
    allowTransitions: ['arrived', 'no_show', 'rescheduled', 'cancelled'],
    icon: '📅',
    order: 5,
    dicom: true // DICOM SPS Status
  },

  // === EXAMINATION PHASE ===
  ARRIVED: {
    key: 'arrived',
    label: 'Arrived',
    description: 'Patient checked-in and ready for examination',
    color: 'cyan',
    bgColor: 'bg-cyan-100',
    textColor: 'text-cyan-700',
    phase: 'exam',
    allowTransitions: ['in_progress', 'cancelled'],
    icon: '✅',
    order: 6,
    dicom: true // DICOM SPS Status
  },
  IN_PROGRESS: {
    key: 'in_progress',
    label: 'In Progress',
    description: 'Examination is being performed (MPPS IN PROGRESS)',
    color: 'amber',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    phase: 'exam',
    allowTransitions: ['completed', 'discontinued'],
    icon: '⚡',
    order: 7,
    dicom: true, // DICOM MPPS Status
    mpps: true
  },
  COMPLETED: {
    key: 'completed',
    label: 'Completed',
    description: 'Examination completed, images acquired (MPPS COMPLETED)',
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    phase: 'post-exam',
    allowTransitions: ['reported', 'archived'],
    icon: '✔️',
    order: 8,
    dicom: true, // DICOM MPPS Status
    mpps: true
  },
  DISCONTINUED: {
    key: 'discontinued',
    label: 'Discontinued',
    description: 'Examination started but could not be completed (MPPS DISCONTINUED)',
    color: 'orange',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    phase: 'post-exam',
    allowTransitions: ['rescheduled', 'cancelled'],
    icon: '⚠️',
    order: 9,
    dicom: true, // DICOM MPPS Status
    mpps: true
  },

  // === REPORTING PHASE ===
  REPORTED: {
    key: 'reported',
    label: 'Reported',
    description: 'Radiologist report created, pending verification',
    color: 'purple',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    phase: 'reporting',
    allowTransitions: ['verified', 'completed'], // can go back if report rejected
    icon: '📄',
    order: 10
  },
  VERIFIED: {
    key: 'verified',
    label: 'Verified',
    description: 'Report verified and finalized',
    color: 'violet',
    bgColor: 'bg-violet-100',
    textColor: 'text-violet-700',
    phase: 'reporting',
    allowTransitions: ['archived'],
    icon: '✓',
    order: 11
  },
  ARCHIVED: {
    key: 'archived',
    label: 'Archived',
    description: 'Images and report archived to PACS',
    color: 'emerald',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    phase: 'post-exam',
    allowTransitions: [],
    icon: '📦',
    order: 12
  },

  // === EXCEPTION STATES ===
  NO_SHOW: {
    key: 'no_show',
    label: 'No Show',
    description: 'Patient did not show up for scheduled appointment',
    color: 'rose',
    bgColor: 'bg-rose-100',
    textColor: 'text-rose-700',
    phase: 'exception',
    allowTransitions: ['rescheduled', 'cancelled'],
    icon: '❌',
    order: 13
  },
  RESCHEDULED: {
    key: 'rescheduled',
    label: 'Rescheduled',
    description: 'Order rescheduled for a new date/time',
    color: 'yellow',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    phase: 'exception',
    allowTransitions: ['scheduled', 'cancelled'],
    icon: '🔄',
    order: 14
  },
  CANCELLED: {
    key: 'cancelled',
    label: 'Cancelled',
    description: 'Order cancelled, will not be performed',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    phase: 'exception',
    allowTransitions: [],
    icon: '🚫',
    order: 15
  }
}

// Workflow phases for grouping
export const WORKFLOW_PHASES = {
  'pre-exam': {
    label: 'Pre-Examination',
    description: 'Order preparation and scheduling',
    color: 'blue'
  },
  'exam': {
    label: 'Examination',
    description: 'Patient arrival and image acquisition',
    color: 'amber'
  },
  'post-exam': {
    label: 'Post-Examination',
    description: 'Image processing and archiving',
    color: 'green'
  },
  'reporting': {
    label: 'Reporting',
    description: 'Report creation and verification',
    color: 'purple'
  },
  'exception': {
    label: 'Exception',
    description: 'Cancelled, rescheduled, or no-show',
    color: 'red'
  }
}

// Helper functions
export const getStatusConfig = (statusKey) => {
  return Object.values(ORDER_STATUS).find(s => s.key === statusKey) || ORDER_STATUS.DRAFT
}

export const canTransitionTo = (currentStatus, targetStatus) => {
  const config = getStatusConfig(currentStatus)
  return config.allowTransitions.includes(targetStatus)
}

export const getStatusesByPhase = (phase, includeHidden = false) => {
  const statuses = Object.values(ORDER_STATUS).filter(s => s.phase === phase)
  if (!includeHidden) {
    return statuses.filter(s => !s.hidden)
  }
  return statuses
}

export const getAllStatuses = (includeHidden = false) => {
  const statuses = Object.values(ORDER_STATUS)
  if (!includeHidden) {
    return statuses.filter(s => !s.hidden).sort((a, b) => a.order - b.order)
  }
  return statuses.sort((a, b) => a.order - b.order)
}

export const getStatusLabel = (statusKey) => {
  return getStatusConfig(statusKey).label
}

export const getStatusIcon = (statusKey) => {
  return getStatusConfig(statusKey).icon
}

// Status validation
export const isValidTransition = (currentStatus, newStatus, includeHidden = false) => {
  const current = getStatusConfig(currentStatus)
  
  // Check if the transition is allowed
  const isAllowed = current.allowTransitions.includes(newStatus)
  
  // If transition is not allowed, return false
  if (!isAllowed) return false
  
  // If we're including hidden statuses, return true
  if (includeHidden) return true
  
  // Check if the target status is hidden
  const targetStatus = getStatusConfig(newStatus)
  return !targetStatus.hidden
}

// Get available next statuses
export const getAvailableTransitions = (currentStatus, includeHidden = false) => {
  const config = getStatusConfig(currentStatus)
  // Map all allowed transitions to their status configs
  let transitions = config.allowTransitions
    .map(key => getStatusConfig(key))
  
  // Filter out hidden statuses unless explicitly requested
  if (!includeHidden) {
    transitions = transitions.filter(status => !status.hidden)
  }
  
  return transitions
}
