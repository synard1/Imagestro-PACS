import React, { createContext, useContext, useReducer, useCallback } from 'react'

// Notification context
const NotificationContext = createContext(null)

// Notification actions
const NOTIFICATION_ACTIONS = {
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  REMOVE_NOTIFICATION: 'REMOVE_NOTIFICATION',
  CLEAR_ALL: 'CLEAR_ALL',
}

// Initial state
const initialState = {
  notifications: [],
}

// Generate unique ID
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Notification reducer
function notificationReducer(state, action) {
  switch (action.type) {
    case NOTIFICATION_ACTIONS.ADD_NOTIFICATION:
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      }

    case NOTIFICATION_ACTIONS.REMOVE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.filter(
          notification => notification.id !== action.payload
        ),
      }

    case NOTIFICATION_ACTIONS.CLEAR_ALL:
      return {
        ...state,
        notifications: [],
      }

    default:
      return state
  }
}

// Notification provider component
export function NotificationProvider({ children }) {
  const [state, dispatch] = useReducer(notificationReducer, initialState)

  // Add notification
  const showNotification = useCallback((notification) => {
    const id = generateId()
    const newNotification = {
      id,
      type: 'info', // default type
      title: '',
      message: '',
      duration: 5000, // default 5 seconds
      persistent: false,
      actions: [],
      ...notification,
      timestamp: new Date().toISOString(),
    }

    dispatch({
      type: NOTIFICATION_ACTIONS.ADD_NOTIFICATION,
      payload: newNotification,
    })

    // Auto-remove notification after duration (if not persistent)
    if (!newNotification.persistent && newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, newNotification.duration)
    }

    return id
  }, [])

  // Remove notification
  const removeNotification = useCallback((id) => {
    dispatch({
      type: NOTIFICATION_ACTIONS.REMOVE_NOTIFICATION,
      payload: id,
    })
  }, [])

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    dispatch({
      type: NOTIFICATION_ACTIONS.CLEAR_ALL,
    })
  }, [])

  // Convenience methods for different notification types
  const showSuccess = useCallback((title, message, options = {}) => {
    return showNotification({
      type: 'success',
      title,
      message,
      ...options,
    })
  }, [showNotification])

  const showError = useCallback((title, message, options = {}) => {
    return showNotification({
      type: 'error',
      title,
      message,
      duration: 8000, // Longer duration for errors
      ...options,
    })
  }, [showNotification])

  const showWarning = useCallback((title, message, options = {}) => {
    return showNotification({
      type: 'warning',
      title,
      message,
      duration: 6000,
      ...options,
    })
  }, [showNotification])

  const showInfo = useCallback((title, message, options = {}) => {
    return showNotification({
      type: 'info',
      title,
      message,
      ...options,
    })
  }, [showNotification])

  // Show loading notification
  const showLoading = useCallback((title, message, options = {}) => {
    return showNotification({
      type: 'loading',
      title,
      message,
      persistent: true, // Loading notifications are persistent by default
      ...options,
    })
  }, [showNotification])

  // Show confirmation notification with actions
  const showConfirmation = useCallback((title, message, onConfirm, onCancel, options = {}) => {
    return showNotification({
      type: 'warning',
      title,
      message,
      persistent: true,
      actions: [
        {
          label: 'Cancel',
          variant: 'secondary',
          onClick: (id) => {
            if (onCancel) onCancel()
            removeNotification(id)
          },
        },
        {
          label: 'Confirm',
          variant: 'primary',
          onClick: (id) => {
            if (onConfirm) onConfirm()
            removeNotification(id)
          },
        },
      ],
      ...options,
    })
  }, [showNotification, removeNotification])

  const value = {
    notifications: state.notifications,
    showNotification,
    removeNotification,
    clearAllNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading,
    showConfirmation,
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

// Custom hook to use notification context
export function useNotification() {
  const context = useContext(NotificationContext)
  
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  
  return context
}