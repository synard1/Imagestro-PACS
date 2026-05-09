import React, { useEffect } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import { useTheme } from '../contexts/ThemeContext'

function NotificationContainer() {
  const { notifications, removeNotification } = useNotification()
  const { theme, reducedMotion } = useTheme()

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={removeNotification}
          reducedMotion={reducedMotion}
        />
      ))}
    </div>
  )
}

function NotificationItem({ notification, onRemove, reducedMotion }) {
  const { id, type, title, message, duration, actions, persistent } = notification

  // Auto-remove notification after duration
  useEffect(() => {
    if (!persistent && duration > 0) {
      const timer = setTimeout(() => {
        onRemove(id)
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [id, duration, persistent, onRemove])

  // Get notification styles based on type
  const getNotificationStyles = () => {
    const baseStyles = "relative p-4 rounded-lg shadow-lg border backdrop-blur-sm"
    
    switch (type) {
      case 'success':
        return `${baseStyles} bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200`
      case 'error':
        return `${baseStyles} bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200`
      case 'warning':
        return `${baseStyles} bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200`
      case 'info':
        return `${baseStyles} bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200`
      case 'loading':
        return `${baseStyles} bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200`
      case 'confirm':
        return `${baseStyles} bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200`
      default:
        return `${baseStyles} bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200`
    }
  }

  // Get notification icon
  const getNotificationIcon = () => {
    switch (type) {
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      case 'loading':
        return '⏳'
      case 'confirm':
        return '❓'
      default:
        return '📢'
    }
  }

  const animationClass = reducedMotion 
    ? 'opacity-100' 
    : 'animate-slide-in-right hover:scale-105 transition-transform'

  return (
    <div className={`${getNotificationStyles()} ${animationClass}`}>
      {/* Close button */}
      {!persistent && (
        <button
          onClick={() => onRemove(id)}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close notification"
        >
          ✕
        </button>
      )}

      {/* Content */}
      <div className="flex items-start space-x-3 pr-6">
        {/* Icon */}
        <div className="flex-shrink-0 text-lg">
          {type === 'loading' ? (
            <div className={`w-5 h-5 border-2 border-current border-t-transparent rounded-full ${
              reducedMotion ? '' : 'animate-spin'
            }`} />
          ) : (
            getNotificationIcon()
          )}
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="text-sm font-medium mb-1">
              {title}
            </h4>
          )}
          {message && (
            <p className="text-sm opacity-90">
              {message}
            </p>
          )}

          {/* Actions */}
          {actions && actions.length > 0 && (
            <div className="mt-3 flex space-x-2">
              {actions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => {
                    action.handler()
                    if (action.closeOnClick !== false) {
                      onRemove(id)
                    }
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    action.variant === 'primary'
                      ? 'bg-current text-white hover:opacity-80'
                      : 'bg-white/20 hover:bg-white/30 dark:bg-black/20 dark:hover:bg-black/30'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar for timed notifications */}
      {!persistent && duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10 dark:bg-white/10 rounded-b-lg overflow-hidden">
          <div 
            className={`h-full bg-current opacity-50 ${
              reducedMotion ? '' : 'animate-progress'
            }`}
            style={{
              animationDuration: `${duration}ms`,
              animationTimingFunction: 'linear',
              animationFillMode: 'forwards'
            }}
          />
        </div>
      )}
    </div>
  )
}

export default NotificationContainer