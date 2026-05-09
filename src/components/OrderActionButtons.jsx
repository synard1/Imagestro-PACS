import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from './ToastProvider'
import { useConfirm } from './ConfirmDialog'
import { useAuth } from '../hooks/useAuth'
import { canPerformAction, getDisabledMessage } from '../config/orderActions'
import { getAvailableTransitions, getStatusConfig } from '../config/orderStatus'
import { can, canAny, getCurrentUser } from '../services/rbac'
import Icon from '../components/common/Icon'

/**
 * OrderActionButtons - Clean icon-based action buttons for order list
 * Modern, professional design with dropdown menu
 *
 * Required Permissions:
 * - order:read or order:* - View order
 * - order:update or order:* - Edit order
 * - order:delete or order:* - Delete order
 * - order:publish or order:* - Publish to MWL
 * - order:status or order:* - Change status
 * - order:print or order:* - Print
 * - order:export or order:* - Export
 */
export default function OrderActionButtons({
  order,
  onDelete,
  onChangeStatus,
  onPublish,
  onSync,
  syncingOrders = [],
  compact = false
}) {
  const nav = useNavigate()
  const toast = useToast()
  const { confirm } = useConfirm()
  const { currentUser } = useAuth() || {}
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, openUpward: false })
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  // Permission checks - reactive to currentUser changes
  // Using useMemo to ensure permissions are recalculated when currentUser changes
  const permissions = useMemo(() => {
    // Get user for permission check
    const user = currentUser

    // Check permissions using direct can() calls with current user context
    const canView = can('order.view', user) || can('order.*', user)
    const canEdit = can('order.update', user) || can('order.*', user)
    const canDelete = can('order.delete', user) || can('order.*', user)
    const canPublish = can('order.publish', user) || can('order.*', user)
    // Allow status change if user has specific permission OR generic update permission
    const canChangeStatus = can('order.status', user) || can('order.update', user) || can('order.*', user)
    const canPrint = can('order.print', user) || can('order.*', user)
    const canExport = can('order.export', user) || can('order.*', user)

    // Enhanced debug logging
    // if (process.env.NODE_ENV !== 'production') {
    //   console.log('[OrderActionButtons] Permissions check', {
    //     userId: user?.id,
    //     userRole: user?.role,
    //     userPermissions: user?.permissions?.slice(0, 5), // First 5 permissions
    //     permissionCount: user?.permissions?.length,
    //     canChangeStatus,
    //     hasStatusPerm: can('order:status', user),
    //     hasUpdatePerm: can('order:update', user),
    //     hasWildcard: can('order:*', user)
    //   });
    // }

    return {
      canView,
      canEdit,
      canDelete,
      canPublish,
      canChangeStatus,
      canPrint,
      canExport
    }
  }, [currentUser])

  // Destructure for easier use
  const { canView, canEdit, canDelete, canPublish, canChangeStatus, canPrint, canExport } = permissions

  const availableTransitions = getAvailableTransitions(order.status, false)
  const hasStatusTransitions = availableTransitions.length > 0

  // Calculate dropdown position when menu opens
  const calculatePosition = () => {
    if (!buttonRef.current) return

    const buttonRect = buttonRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const menuHeight = 300 // Estimated max menu height

    // Check if there's enough space below
    const spaceBelow = viewportHeight - buttonRect.bottom
    const openUpward = spaceBelow < menuHeight && buttonRect.top > menuHeight

    setMenuPosition({
      top: openUpward ? buttonRect.top : buttonRect.bottom + 4,
      left: buttonRect.right - 224, // 224px = w-56 (14rem)
      openUpward
    })
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target) &&
        buttonRef.current && !buttonRef.current.contains(event.target)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Recalculate position on scroll (but don't close if scrolling inside the menu itself)
  useEffect(() => {
    if (showMenu) {
      calculatePosition()
      const handleScroll = (event) => {
        // Don't close if scrolling inside the dropdown menu
        if (menuRef.current && menuRef.current.contains(event.target)) {
          return
        }
        // Close if scrolling outside the menu (e.g., table scroll)
        setShowMenu(false)
      }
      window.addEventListener('scroll', handleScroll, true)
      return () => window.removeEventListener('scroll', handleScroll, true)
    }
  }, [showMenu])
  // Using async function with custom confirm dialog (not window.confirm)
  // The custom confirm dialog is rendered as a React component and is not affected by StrictMode
  const handleStatusChange = async (statusKey) => {
    // console.log('[OrderActionButtons] handleStatusChange initiated', { statusKey, canChangeStatus });

    // Permission re-check using statically imported getCurrentUser
    const liveUser = getCurrentUser();
    const liveCanChangeStatus = can('order:status', liveUser) || can('order:update', liveUser) || can('order:*', liveUser);

    // console.log('[OrderActionButtons] Live permission check', {
    //   liveUserId: liveUser?.id,
    //   liveUserRole: liveUser?.role,
    //   liveUserPermissions: liveUser?.permissions?.slice(0, 5),
    //   liveCanChangeStatus,
    //   closureCanChangeStatus: canChangeStatus
    // });

    if (!liveCanChangeStatus) {
      toast.notify({
        type: 'error',
        message: 'You do not have permission to change order status'
      })
      return
    }

    const config = getStatusConfig(statusKey)
    if (!config) {
      toast.notify({ type: 'error', message: 'Invalid status configuration' });
      return;
    }

    // Close menu first
    setShowMenu(false);
    // console.log('[OrderActionButtons] Menu closed');

    // Use custom confirm dialog (React component, not window.confirm)
    // This is safe to use with async/await as it's not affected by browser popup blocking
    const message = `Are you sure you want to change the order status to "${config.label}"?`;
    // console.log('[OrderActionButtons] Showing custom confirm dialog...', message);

    const shouldProceed = await confirm(message, 'Change Order Status');
    // console.log('[OrderActionButtons] User response:', shouldProceed);

    if (shouldProceed) {
      try {
        // console.log('[OrderActionButtons] Executing status change...');
        if (typeof onChangeStatus !== 'function') {
          throw new Error('onChangeStatus callback is missing');
        }

        await onChangeStatus(order, statusKey);
        // console.log('[OrderActionButtons] Status change completed');
      } catch (error) {
        toast.notify({
          type: 'error',
          message: `Failed to update status: ${error.message}`
        })
      }
    } else {
      // console.log('[OrderActionButtons] Action cancelled by user');
    }
  }

  const handleDelete = () => {
    setShowMenu(false)
    onDelete?.(order)
  }

  const handlePublish = () => {
    setShowMenu(false)
    onPublish?.(order)
  }

  const handleToggleMenu = () => {
    if (!showMenu) {
      calculatePosition()
    }
    setShowMenu(!showMenu)
  }

  // If user has no permissions at all, return null
  if (!canView && !canEdit && !canDelete && !canPublish && !canChangeStatus && !canPrint && !canExport) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400 px-2 py-1">No access</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {/* Primary Action: View (if has permission) */}
      {canView && (
        <button
          onClick={() => nav(`/orders/${order.id}`)}
          className="p-1.5 text-themed-primary hover:bg-themed-accent-light/10 rounded-lg transition-colors focus:ring-2 focus:ring-themed-accent-light focus:outline-none"
          title="View order details"
        >
          <Icon name="eye" className="w-4 h-4" />
        </button>
      )}

      {/* Secondary Action: Edit (if editable and has permission) */}
      {canEdit && canPerformAction(order.status, 'edit') && (
        <button
          onClick={() => nav(`/orders/${order.id}`)}
          className="p-1.5 text-themed-primary hover:bg-themed-accent-light/10 rounded-lg transition-colors focus:ring-2 focus:ring-themed-accent-light focus:outline-none"
          title="Edit order"
        >
          <Icon name="edit" className="w-4 h-4" />
        </button>
      )}

      {/* Sync Action: For offline orders only */}
      {order._offline && onSync && (
        <button
          onClick={() => onSync(order)}
          disabled={syncingOrders.includes(order.id)}
          className={`p-1.5 rounded-lg transition-colors focus:ring-2 focus:ring-themed-accent-light focus:outline-none ${
            syncingOrders.includes(order.id)
              ? 'text-amber-400 bg-amber-50 cursor-not-allowed opacity-50'
              : 'text-amber-600 hover:bg-amber-50'
          }`}
          title={syncingOrders.includes(order.id) ? 'Syncing to backend...' : 'Sync to backend'}
        >
          <Icon name="refresh" className={`w-4 h-4 ${syncingOrders.includes(order.id) ? 'animate-spin' : ''}`} />
        </button>
      )}

      {/* More Actions Dropdown */}
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={handleToggleMenu}
          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:ring-2 focus:ring-themed-accent-light focus:outline-none"
          title="More actions"
        >
          <Icon name="moreVertical" className="w-4 h-4" />
        </button>

        {/* Dropdown Menu - Fixed position to escape overflow */}
        {showMenu && (
          <div
            ref={menuRef}
            className="fixed w-56 bg-white rounded-lg shadow-xl border border-slate-200 py-1"
            style={{
              top: menuPosition.openUpward ? 'auto' : menuPosition.top,
              bottom: menuPosition.openUpward ? (window.innerHeight - menuPosition.top + 4) : 'auto',
              left: Math.max(8, menuPosition.left), // Ensure at least 8px from left edge
              zIndex: 9999,
              maxHeight: '300px',
              overflowY: 'auto'
            }}
          >
            {/* Publish Action - Requires order:publish or order:* */}
            {canPublish && !order._offline && canPerformAction(order.status, 'publish') && onPublish && (
              <>
                <button
                  onClick={handlePublish}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-themed-accent-light/10 flex items-center gap-3 text-themed-primary focus:outline-none focus:ring-2 focus:ring-themed-accent-light"
                >
                  <Icon name="upload" className="w-4 h-4" />
                  <span className="font-medium">Publish to MWL</span>
                </button>
                <div className="border-t border-slate-200 my-1"></div>
              </>
            )}

            {/* Change Status Actions - Requires order:status or order:* */}
            {canChangeStatus && canPerformAction(order.status, 'change_status') && hasStatusTransitions && onChangeStatus && (
              <>
                <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Change Status
                </div>
                {availableTransitions
                  .filter(transition => {
                    // Hide 'draft' option when current status is 'created'
                    if (order.status === 'created' && transition.key === 'draft') {
                      return false;
                    }
                    return true;
                  })
                  .map(transition => {
                    const config = getStatusConfig(transition.key)
                    const isCritical = ['cancelled', 'discontinued'].includes(transition.key)

                    return (
                      <button
                        key={transition.key}
                        onClick={() => handleStatusChange(transition.key)}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-3 ${isCritical ? 'text-red-700' : config.textColor
                          }`}
                      >
                        <span className="text-base">{config.icon}</span>
                        <span>{config.label}</span>
                        {config.dicom && (
                          <span className="ml-auto text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                            DICOM
                          </span>
                        )}
                      </button>
                    )
                  })}
                <div className="border-t border-slate-200 my-1"></div>
              </>
            )}

            {/* Upload DICOM / Studies - Requires order:update or order:* */}
            {canEdit && !order._offline && (
              <button
                onClick={() => {
                  setShowMenu(false)
                  nav(`/upload?orderId=${order.id}`)
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-themed-accent-light/10 flex items-center gap-3 text-themed-primary focus:outline-none focus:ring-2 focus:ring-themed-accent-light"
              >
                <Icon name="cloudUpload" className="w-4 h-4" />
                <span>Upload DICOM / Studies</span>
              </button>
            )}

            {/* Print Action - Requires order:print or order:* */}
            {canPrint && canPerformAction(order.status, 'print') && (
              <button
                onClick={() => {
                  setShowMenu(false)
                  window.print()
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <Icon name="printer" className="w-4 h-4" />
                <span>Print Order</span>
              </button>
            )}

            {/* Export Action - Requires order:export or order:* */}
            {canExport && canPerformAction(order.status, 'export') && (
              <button
                onClick={() => {
                  setShowMenu(false)
                  alert('Export feature coming soon')
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <Icon name="download" className="w-4 h-4" />
                <span>Export Data</span>
              </button>
            )}

            {/* Delete Action - Requires order:delete or order:* */}
            {((canPrint && canPerformAction(order.status, 'print')) || (canExport && canPerformAction(order.status, 'export'))) && (
              <div className="border-t border-slate-200 my-1"></div>
            )}

            {canDelete && canPerformAction(order.status, 'delete') ? (
              <button
                onClick={handleDelete}
                className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-3 text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
              >
                <Icon name="trash" className="w-4 h-4" />
                <span className="font-medium">Delete Order</span>
              </button>
            ) : canDelete ? (
              <div
                className="px-4 py-2 text-left text-sm text-slate-400 flex items-center gap-3 cursor-not-allowed"
                title={getDisabledMessage(order.status, 'delete')}
              >
                <Icon name="trash" className="w-4 h-4" />
                <span>Delete Order</span>
                <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                </svg>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
