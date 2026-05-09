import React from 'react'
import { useAuth } from '../contexts/AuthContext'

/**
 * PermissionGate component for role-based access control
 * Renders children only if user has required permissions or roles
 */
export function PermissionGate({ 
  children, 
  permissions = [], 
  roles = [], 
  requireAll = false,
  fallback = null,
  showFallback = false 
}) {
  const { user, hasPermission, hasRole } = useAuth()

  // If user is not authenticated, don't render anything
  if (!user) {
    return showFallback ? fallback : null
  }

  // Check permissions
  const hasRequiredPermissions = permissions.length === 0 || (
    requireAll 
      ? permissions.every(permission => hasPermission(permission))
      : permissions.some(permission => hasPermission(permission))
  )

  // Check roles
  const hasRequiredRoles = roles.length === 0 || (
    requireAll
      ? roles.every(role => hasRole(role))
      : roles.some(role => hasRole(role))
  )

  // Determine if access should be granted
  const hasAccess = hasRequiredPermissions && hasRequiredRoles

  if (hasAccess) {
    return children
  }

  return showFallback ? fallback : null
}

/**
 * Hook for conditional rendering based on permissions
 */
export function usePermissionGate(permissions = [], roles = [], requireAll = false) {
  const { user, hasPermission, hasRole } = useAuth()

  if (!user) {
    return false
  }

  const hasRequiredPermissions = permissions.length === 0 || (
    requireAll 
      ? permissions.every(permission => hasPermission(permission))
      : permissions.some(permission => hasPermission(permission))
  )

  const hasRequiredRoles = roles.length === 0 || (
    requireAll
      ? roles.every(role => hasRole(role))
      : roles.some(role => hasRole(role))
  )

  return hasRequiredPermissions && hasRequiredRoles
}

/**
 * Higher-order component for protecting components with permissions
 */
export function withPermissions(WrappedComponent, permissions = [], roles = [], requireAll = false) {
  return function PermissionProtectedComponent(props) {
    return (
      <PermissionGate 
        permissions={permissions} 
        roles={roles} 
        requireAll={requireAll}
        showFallback={true}
        fallback={
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="text-6xl text-gray-400 mb-4">🔒</div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Access Denied
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                You don't have permission to access this component.
              </p>
            </div>
          </div>
        }
      >
        <WrappedComponent {...props} />
      </PermissionGate>
    )
  }
}

export default PermissionGate