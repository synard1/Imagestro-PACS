import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function PermissionWarning({ 
  requiredPermissions = [], 
  title = "Access Restricted",
  message = "You don't have permission to access this page.",
  showRequiredPermissions = true,
  showContactAdmin = true,
  className = ""
}) {
  const { user } = useAuth()

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 ${className}`}>
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          {/* Warning Icon */}
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 dark:bg-yellow-900/20 mb-6">
            <svg 
              className="h-8 w-8 text-yellow-600 dark:text-yellow-400" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" 
              />
            </svg>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {title}
          </h1>

          {/* Message */}
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {message}
          </p>

          {/* User Info */}
          {user && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">Current User:</span> {user.full_name || user.username}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">Role:</span> {user.role || 'No role assigned'}
              </p>
            </div>
          )}

          {/* Required Permissions */}
          {showRequiredPermissions && requiredPermissions.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-400 mb-2">
                Required Permissions:
              </h3>
              <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                {requiredPermissions.map((permission, index) => (
                  <li key={index} className="flex items-center">
                    <span className="w-2 h-2 bg-red-400 rounded-full mr-2"></span>
                    <code className="bg-red-100 dark:bg-red-800/30 px-2 py-1 rounded text-xs">
                      {permission}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <Link
              to="/dashboard"
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Go to Dashboard
            </Link>

            {showContactAdmin && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Need access? Contact your system administrator to request the required permissions.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PermissionWarning