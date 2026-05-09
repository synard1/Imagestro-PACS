/**
 * Order Action Permissions
 * Defines what actions are allowed based on order status
 */

import { ORDER_STATUS } from "./orderStatus";

export const ORDER_ACTIONS = {
  VIEW: "view",
  EDIT: "edit",
  DELETE: "delete",
  CHANGE_STATUS: "change_status",
  PUBLISH: "publish",
  PRINT: "print",
  EXPORT: "export",
  ADD_REPORT: "add_report",
};

/**
 * Action permissions for each status
 * true = allowed, false = not allowed
 */
export const STATUS_ACTIONS = {
  // === PRE-EXAMINATION PHASE ===
  draft: {
    view: true,
    edit: true, // Can edit all fields
    delete: true, // Can delete draft orders
    change_status: true, // Can move to next status
    publish: false, // Not yet ready to publish
    print: true,
    export: true,
    add_report: false,
  },
  // Backend uses CREATED status (equivalent to draft)
  created: {
    view: true,
    edit: true, // Can edit all fields
    delete: true, // Can delete created orders
    change_status: true, // Can move to next status
    publish: false, // Can publish to MWL
    print: true,
    export: true,
    add_report: false,
  },
  CREATED: {
    // Uppercase variant for backend compatibility
    view: true,
    edit: true,
    delete: true,
    change_status: true,
    publish: false,
    print: true,
    export: true,
    add_report: false,
  },
  enqueued: {
    view: true,
    edit: true, // Can still edit before publish
    delete: true, // Can delete if not published yet
    change_status: true,
    publish: false, // Ready to publish to MWL
    print: true,
    export: true,
    add_report: false,
  },
  published: {
    view: true,
    edit: false, // Cannot edit once published (would break MWL)
    delete: false, // Cannot delete published orders
    change_status: true, // Can schedule
    publish: false, // Already published
    print: true,
    export: true,
    add_report: false,
  },
  scheduled: {
    view: true,
    edit: true, // Allow editing to enable rescheduling
    delete: false, // Cannot delete, use cancel status
    change_status: true, // Can mark arrived, no-show, reschedule, cancel
    publish: false,
    print: true,
    export: true,
    add_report: false,
  },

  // === EXAMINATION PHASE ===
  arrived: {
    view: true,
    edit: false, // Patient arrived, order locked
    delete: false,
    change_status: true, // Can start exam or cancel
    publish: false,
    print: true,
    export: true,
    add_report: false,
  },
  in_progress: {
    view: true,
    edit: true, // Exam in progress, order locked
    delete: false, // Cannot delete active exams
    change_status: true, // Can complete or discontinue
    publish: false,
    print: true,
    export: true,
    add_report: false, // Report only after completion
  },
  completed: {
    view: true,
    edit: true, // Exam completed, order finalized
    delete: false, // Cannot delete completed exams
    change_status: true, // Can add report or archive
    publish: false,
    print: true,
    export: true,
    add_report: true, // Can add radiologist report
  },
  discontinued: {
    view: true,
    edit: false, // Discontinued exams are locked
    delete: false, // Keep record of discontinued exams
    change_status: true, // Can reschedule or cancel
    publish: false,
    print: true,
    export: true,
    add_report: false,
  },

  // === REPORTING PHASE ===
  reported: {
    view: true,
    edit: false, // Report created, order locked
    delete: false,
    change_status: true, // Can verify report
    publish: false,
    print: true,
    export: true,
    add_report: true, // Can edit existing report
  },
  verified: {
    view: true,
    edit: false, // Verified report is final
    delete: false,
    change_status: true, // Can archive
    publish: false,
    print: true,
    export: true,
    add_report: false, // Report finalized
  },
  archived: {
    view: true, // View only
    edit: false, // Archived orders are immutable
    delete: false, // Never delete archived orders
    change_status: false, // Terminal state
    publish: false,
    print: true,
    export: true,
    add_report: false,
  },

  // === EXCEPTION STATES ===
  no_show: {
    view: true,
    edit: false, // No-show is recorded, cannot edit
    delete: false, // Keep no-show records
    change_status: true, // Can reschedule or cancel
    publish: false,
    print: true,
    export: true,
    add_report: false,
  },
  rescheduled: {
    view: true,
    edit: true, // Can edit rescheduled orders
    delete: true, // Can delete if rescheduling failed
    change_status: true, // Can move to scheduled or cancel
    publish: false,
    print: true,
    export: true,
    add_report: false,
  },
  cancelled: {
    view: true, // View only
    edit: false, // Cancelled orders are locked
    delete: false, // Keep cancellation records
    change_status: false, // Terminal state
    publish: false,
    print: true,
    export: true,
    add_report: false,
  },
};

/**
 * Check if an action is allowed for a specific status
 * Handles case-insensitive status matching
 */
export const canPerformAction = (status, action) => {
  if (!status) return false;

  // Try exact match first
  let permissions = STATUS_ACTIONS[status];

  // If not found, try lowercase
  if (!permissions && typeof status === "string") {
    permissions = STATUS_ACTIONS[status.toLowerCase()];
  }

  // If still not found, try uppercase
  if (!permissions && typeof status === "string") {
    permissions = STATUS_ACTIONS[status.toUpperCase()];
  }

  if (!permissions) {
    console.warn(`[orderActions] No permissions found for status: ${status}`);
    return false;
  }

  return permissions[action] === true;
};

/**
 * Get all allowed actions for a status
 */
export const getAllowedActions = (status) => {
  const permissions = STATUS_ACTIONS[status];
  if (!permissions) return [];

  return Object.entries(permissions)
    .filter(([action, allowed]) => allowed === true)
    .map(([action]) => action);
};

/**
 * Get action button configuration with icons and labels
 */
export const getActionConfig = (action) => {
  const configs = {
    view: {
      label: "View",
      icon: "👁️",
      color: "blue",
      className: "text-blue-600 hover:text-blue-800",
    },
    edit: {
      label: "Edit",
      icon: "✏️",
      color: "indigo",
      className: "text-indigo-600 hover:text-indigo-800",
    },
    delete: {
      label: "Delete",
      icon: "🗑️",
      color: "red",
      className: "text-red-600 hover:text-red-800",
    },
    change_status: {
      label: "Change Status",
      icon: "🔄",
      color: "green",
      className: "text-green-600 hover:text-green-800",
    },
    publish: {
      label: "Publish",
      icon: "📤",
      color: "purple",
      className: "text-purple-600 hover:text-purple-800",
    },
    print: {
      label: "Print",
      icon: "🖨️",
      color: "slate",
      className: "text-slate-600 hover:text-slate-800",
    },
    export: {
      label: "Export",
      icon: "💾",
      color: "cyan",
      className: "text-cyan-600 hover:text-cyan-800",
    },
    add_report: {
      label: "Add Report",
      icon: "📝",
      color: "emerald",
      className: "text-emerald-600 hover:text-emerald-800",
    },
  };

  return (
    configs[action] || {
      label: action,
      icon: "•",
      color: "slate",
      className: "text-slate-600",
    }
  );
};

/**
 * Get disabled message for an action
 */
export const getDisabledMessage = (status, action) => {
  const statusConfig = ORDER_STATUS[status.toUpperCase()];
  const statusLabel = statusConfig ? statusConfig.label : status;

  const messages = {
    edit: `Cannot edit ${statusLabel} orders. Order is locked at this status.`,
    delete: `Cannot delete ${statusLabel} orders. Use cancel status instead or contact administrator.`,
    change_status: `Cannot change status from ${statusLabel}. This is a terminal state.`,
    publish: `Cannot publish ${statusLabel} orders. Order must be in enqueued status.`,
    add_report: `Cannot add report to ${statusLabel} orders. Report can only be added after completion.`,
  };

  return (
    messages[action] ||
    `Action ${action} is not allowed for ${statusLabel} orders.`
  );
};
