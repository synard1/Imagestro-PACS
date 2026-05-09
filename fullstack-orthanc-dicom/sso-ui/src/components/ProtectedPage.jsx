import React, { useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import PermissionWarning from './PermissionWarning'
import { useComponentLogger } from '../utils/logger'
import { PerformanceMonitor } from '../utils/performance'
import { ErrorHandler } from '../utils/errorHandler'

/**
 * ProtectedPage component for wrapping entire pages with permission checks
 * Shows PermissionWarning if user lacks required permissions
 */
export function ProtectedPage({ 
  children, 
  permissions = [], 
  roles = [], 
  requireAll = false,
  title = "Page Access Restricted",
  message = "You don't have permission to access this page."
}) {
  const { user, hasPermission, hasRole } = useAuth()
  const logger = useComponentLogger('ProtectedPage')
  const performanceMonitor = new PerformanceMonitor('ProtectedPage')

  // Initialize logging
  useEffect(() => {
    const startTime = performance.now()
    
    logger.info('🛡️ ProtectedPage component mounted', {
      userId: user?.id,
      username: user?.username,
      userRoles: user?.roles,
      requiredPermissions: permissions,
      requiredRoles: roles,
      requireAll,
      title,
      timestamp: new Date().toISOString(),
      context: {
        hasUser: !!user,
        permissionsCount: permissions.length,
        rolesCount: roles.length
      }
    })

    performanceMonitor.start('page_protection_check')

    return () => {
      const endTime = performance.now()
      logger.info('🛡️ ProtectedPage component unmounted', {
        userId: user?.id,
        duration: endTime - startTime,
        timestamp: new Date().toISOString()
      })
    }
  }, [user?.id, permissions, roles, requireAll, title, logger, performanceMonitor])

  // If user is not authenticated, this should be handled by ProtectedRoute
  if (!user) {
    logger.warn('🚫 ProtectedPage access denied - user not authenticated', {
      requiredPermissions: permissions,
      requiredRoles: roles,
      requireAll,
      title,
      timestamp: new Date().toISOString(),
      context: {
        reason: 'no_user',
        redirectTo: 'authentication_required'
      }
    })

    performanceMonitor.end('page_protection_check')

    return (
      <PermissionWarning 
        requiredPermissions={permissions}
        title="Authentication Required"
        message="Please log in to access this page."
        showRequiredPermissions={false}
      />
    )
  }

  // Check permissions
  logger.info('🔍 ProtectedPage checking permissions', {
    userId: user.id,
    username: user.username,
    userRoles: user.roles,
    requiredPermissions: permissions,
    requireAll,
    timestamp: new Date().toISOString()
  })

  const hasRequiredPermissions = permissions.length === 0 || (
    requireAll 
      ? permissions.every(permission => hasPermission(permission))
      : permissions.some(permission => hasPermission(permission))
  )

  logger.info('✅ ProtectedPage permission check result', {
    userId: user.id,
    hasRequiredPermissions,
    requiredPermissions: permissions,
    userPermissions: user.permissions || [],
    requireAll,
    timestamp: new Date().toISOString()
  })

  // Check roles
  logger.info('🔍 ProtectedPage checking roles', {
    userId: user.id,
    username: user.username,
    userRoles: user.roles,
    requiredRoles: roles,
    requireAll,
    timestamp: new Date().toISOString()
  })

  const hasRequiredRoles = roles.length === 0 || (
    requireAll
      ? roles.every(role => hasRole(role))
      : roles.some(role => hasRole(role))
  )

  logger.info('✅ ProtectedPage role check result', {
    userId: user.id,
    hasRequiredRoles,
    requiredRoles: roles,
    userRoles: user.roles || [],
    requireAll,
    timestamp: new Date().toISOString()
  })

  // Determine if access should be granted
  const hasAccess = hasRequiredPermissions && hasRequiredRoles

  logger.info('🎯 ProtectedPage final access decision', {
    userId: user.id,
    username: user.username,
    hasAccess,
    hasRequiredPermissions,
    hasRequiredRoles,
    requiredPermissions: permissions,
    requiredRoles: roles,
    requireAll,
    timestamp: new Date().toISOString(),
    context: {
      permissionCheckPassed: hasRequiredPermissions,
      roleCheckPassed: hasRequiredRoles,
      finalDecision: hasAccess ? 'GRANTED' : 'DENIED'
    }
  })

  if (!hasAccess) {
    logger.warn('🚫 ProtectedPage access denied - insufficient permissions/roles', {
      userId: user.id,
      username: user.username,
      userRoles: user.roles,
      userPermissions: user.permissions || [],
      requiredPermissions: permissions,
      requiredRoles: roles,
      hasRequiredPermissions,
      hasRequiredRoles,
      requireAll,
      title,
      message,
      timestamp: new Date().toISOString(),
      context: {
        reason: 'insufficient_permissions_or_roles',
        permissionCheckFailed: !hasRequiredPermissions,
        roleCheckFailed: !hasRequiredRoles,
        redirectTo: 'permission_warning'
      }
    })

    performanceMonitor.end('page_protection_check')

    return (
      <PermissionWarning 
        requiredPermissions={permissions}
        title={title}
        message={message}
      />
    )
  }

  logger.info('✅ ProtectedPage access granted - rendering protected content', {
    userId: user.id,
    username: user.username,
    userRoles: user.roles,
    requiredPermissions: permissions,
    requiredRoles: roles,
    hasRequiredPermissions,
    hasRequiredRoles,
    requireAll,
    timestamp: new Date().toISOString(),
    context: {
      accessGranted: true,
      permissionCheckPassed: hasRequiredPermissions,
      roleCheckPassed: hasRequiredRoles
    }
  })

  performanceMonitor.end('page_protection_check')

  return children
}

export default ProtectedPage