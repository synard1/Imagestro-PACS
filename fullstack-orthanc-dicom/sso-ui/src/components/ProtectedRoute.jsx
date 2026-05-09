import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from './LoadingSpinner'
import ErrorBoundary from './ErrorBoundary'

// Protected route component
function ProtectedRoute({ 
  children, 
  requiredPermissions = [], 
  requiredRoles = [],
  fallbackPath = '/login',
  showUnauthorized = false,
  exact = false 
}) {
  const { isAuthenticated, isLoading, user, hasPermission } = useAuth()
  const location = useLocation()

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" message="Verifying authentication..." />
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return (
      <Navigate 
        to={fallbackPath} 
        state={{ from: location }} 
        replace 
      />
    )
  }

  // Check role-based access
  if (requiredRoles.length > 0) {
    const userRoles = user?.roles || []
    const hasRequiredRole = requiredRoles.some(role => 
      userRoles.includes(role) || userRoles.includes('admin')
    )

    if (!hasRequiredRole) {
      if (showUnauthorized) {
        return <UnauthorizedAccess requiredRoles={requiredRoles} />
      }
      return <Navigate to="/unauthorized" replace />
    }
  }

  // Check permission-based access
  if (requiredPermissions.length > 0) {
    const hasRequiredPermission = hasPermission(requiredPermissions)

    if (!hasRequiredPermission) {
      if (showUnauthorized) {
        return <UnauthorizedAccess requiredPermissions={requiredPermissions} />
      }
      return <Navigate to="/unauthorized" replace />
    }
  }

  // Render children with error boundary
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  )
}

// Unauthorized access component
function UnauthorizedAccess({ requiredRoles = [], requiredPermissions = [] }) {
  const { user } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          {/* Icon */}
          <div className="mx-auto h-24 w-24 text-red-500 mb-6">
            <svg 
              className="w-full h-full" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" 
              />
            </svg>
          </div>

          {/* Title */}
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Access Denied
          </h2>

          {/* Message */}
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            You don't have permission to access this resource.
          </p>

          {/* Details */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
            <div className="text-left space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Current User:
                </span>
                <p className="text-sm text-gray-900 dark:text-white">
                  {user?.full_name || user?.username || 'Unknown'}
                </p>
              </div>

              <div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Your Roles:
                </span>
                <p className="text-sm text-gray-900 dark:text-white">
                  {user?.roles?.join(', ') || 'None'}
                </p>
              </div>

              {requiredRoles.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Required Roles:
                  </span>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {requiredRoles.join(', ')}
                  </p>
                </div>
              )}

              {requiredPermissions.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Required Permissions:
                  </span>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {requiredPermissions.join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={() => window.history.back()}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
            >
              Go Back
            </button>

            <button
              onClick={() => window.location.href = '/dashboard'}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
            >
              Go to Dashboard
            </button>
          </div>

          {/* Contact admin */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
            If you believe this is an error, please contact your system administrator.
          </p>
        </div>
      </div>
    </div>
  )
}

// Higher-order component for protecting routes
export function withAuth(Component, options = {}) {
  return function AuthenticatedComponent(props) {
    return (
      <ProtectedRoute {...options}>
        <Component {...props} />
      </ProtectedRoute>
    )
  }
}

// Hook for checking permissions in components
export function usePermissions() {
  const { hasPermission, user } = useAuth()

  const checkPermission = (permissions) => {
    return hasPermission(permissions)
  }

  const checkRole = (roles) => {
    if (!Array.isArray(roles)) {
      roles = [roles]
    }

    const userRoles = user?.roles || []
    return roles.some(role => 
      userRoles.includes(role) || userRoles.includes('admin')
    )
  }

  const isAdmin = () => {
    const userRoles = user?.roles || []
    return userRoles.includes('admin')
  }

  return {
    checkPermission,
    checkRole,
    isAdmin,
    user,
  }
}

// Note: PermissionGate is now imported from ./PermissionGate.jsx to avoid duplication

export default ProtectedRoute