import React, { createContext, useContext, useReducer, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Cookies from 'js-cookie'
import { decodeJwt } from 'jose'
import { authAPI } from '../services/api'
import { useNotification } from './NotificationContext'

// Auth context
const AuthContext = createContext(null)

// Auth actions
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  UPDATE_USER: 'UPDATE_USER',
  REFRESH_TOKEN: 'REFRESH_TOKEN',
}

// Initial state
const initialState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  accessToken: null,
  refreshToken: null,
  permissions: [],
  error: null,
}

// Auth reducer
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      }

    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        isAuthenticated: true,
        isLoading: false,
        user: action.payload.user,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
        permissions: action.payload.user.permissions || [],
        error: null,
      }

    case AUTH_ACTIONS.LOGIN_FAILURE:
      return {
        ...state,
        isAuthenticated: false,
        isLoading: false,
        user: null,
        accessToken: null,
        refreshToken: null,
        permissions: [],
        error: action.payload,
      }

    case AUTH_ACTIONS.LOGOUT:
      return {
        ...initialState,
        isLoading: false,
      }

    case AUTH_ACTIONS.UPDATE_USER:
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      }

    case AUTH_ACTIONS.REFRESH_TOKEN:
      return {
        ...state,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
      }

    default:
      return state
  }
}

// Token storage keys
const TOKEN_KEYS = {
  ACCESS_TOKEN: 'dicom_access_token',
  REFRESH_TOKEN: 'dicom_refresh_token',
  USER_DATA: 'dicom_user_data',
}

// Auth provider component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)
  const navigate = useNavigate()
  const location = useLocation()
  const { showNotification } = useNotification()

  // Token management utilities
  const setTokens = (accessToken, refreshToken, user) => {
    if (accessToken) {
      Cookies.set(TOKEN_KEYS.ACCESS_TOKEN, accessToken, {
        expires: 1, // 1 day
        secure: window.location.protocol === 'https:',
        sameSite: 'strict',
      })
    }

    if (refreshToken) {
      Cookies.set(TOKEN_KEYS.REFRESH_TOKEN, refreshToken, {
        expires: 30, // 30 days
        secure: window.location.protocol === 'https:',
        sameSite: 'strict',
      })
    }

    if (user) {
      localStorage.setItem(TOKEN_KEYS.USER_DATA, JSON.stringify(user))
    }
  }

  const clearTokens = () => {
    Cookies.remove(TOKEN_KEYS.ACCESS_TOKEN)
    Cookies.remove(TOKEN_KEYS.REFRESH_TOKEN)
    localStorage.removeItem(TOKEN_KEYS.USER_DATA)
  }

  const getStoredTokens = () => {
    const accessToken = Cookies.get(TOKEN_KEYS.ACCESS_TOKEN)
    const refreshToken = Cookies.get(TOKEN_KEYS.REFRESH_TOKEN)
    const userData = localStorage.getItem(TOKEN_KEYS.USER_DATA)

    return {
      accessToken,
      refreshToken,
      user: userData ? JSON.parse(userData) : null,
    }
  }

  // Check if token is expired
  const isTokenExpired = (token) => {
    if (!token) return true

    try {
      const decoded = decodeJwt(token)
      const currentTime = Date.now() / 1000
      return decoded.exp < currentTime
    } catch (error) {
      console.error('Error decoding token:', error)
      return true
    }
  }

  // Login function
  const login = async (credentials) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true })

      const response = await authAPI.login(credentials)
      
      if (response.status === 'success') {
        const { access_token, refresh_token, user } = response

        // Store tokens
        setTokens(access_token, refresh_token, user)

        // Update state
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: {
            accessToken: access_token,
            refreshToken: refresh_token,
            user,
          },
        })

        // Show success notification
        showNotification({
          type: 'success',
          title: 'Login Successful',
          message: `Welcome back, ${user.full_name || user.username}!`,
        })

        // Redirect to intended page or dashboard
        const from = location.state?.from?.pathname || '/dashboard'
        navigate(from, { replace: true })

        return { success: true }
      } else {
        throw new Error(response.message || 'Login failed')
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Login failed'
      
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: errorMessage,
      })

      showNotification({
        type: 'error',
        title: 'Login Failed',
        message: errorMessage,
      })

      return { success: false, error: errorMessage }
    }
  }

  // Logout function
  const logout = async (showMessage = true) => {
    try {
      // Clear tokens
      clearTokens()

      // Update state
      dispatch({ type: AUTH_ACTIONS.LOGOUT })

      if (showMessage) {
        showNotification({
          type: 'info',
          title: 'Logged Out',
          message: 'You have been successfully logged out.',
        })
      }

      // Redirect to login
      navigate('/login', { replace: true })
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  // Refresh token function
  const refreshAccessToken = async () => {
    try {
      const { refreshToken } = getStoredTokens()
      
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }

      const response = await authAPI.refreshToken(refreshToken)
      
      if (response.status === 'success') {
        const { access_token, refresh_token } = response

        // Update tokens
        setTokens(access_token, refresh_token)

        dispatch({
          type: AUTH_ACTIONS.REFRESH_TOKEN,
          payload: {
            accessToken: access_token,
            refreshToken: refresh_token,
          },
        })

        return access_token
      } else {
        throw new Error('Token refresh failed')
      }
    } catch (error) {
      console.error('Token refresh error:', error)
      logout(false)
      return null
    }
  }

  // Verify token and get user info
  const verifyToken = async (token) => {
    try {
      const response = await authAPI.verifyToken(token)
      return response.status === 'success' && response.valid
    } catch (error) {
      console.error('Token verification error:', error)
      return false
    }
  }

  // Get current user info
  const getCurrentUser = async () => {
    try {
      const response = await authAPI.getCurrentUser()
      
      if (response.status === 'success') {
        dispatch({
          type: AUTH_ACTIONS.UPDATE_USER,
          payload: response.user,
        })
        
        // Update stored user data
        localStorage.setItem(TOKEN_KEYS.USER_DATA, JSON.stringify(response.user))
        
        return response.user
      }
    } catch (error) {
      console.error('Get current user error:', error)
      return null
    }
  }

  // Check permissions
  const hasPermission = (requiredPermissions) => {
    if (!Array.isArray(requiredPermissions)) {
      requiredPermissions = [requiredPermissions]
    }

    const userPermissions = state.permissions || []
    const userRoles = state.user?.roles || []
    
    // Debug logging
    console.log('Permission check:', {
      requiredPermissions,
      userPermissions,
      userRoles,
      user: state.user
    })
    
    // Admin role or wildcard permission has all permissions
    if (userPermissions.includes('*') || userRoles.includes('admin') || userRoles.includes('system_administrator')) {
      console.log('Admin access granted')
      return true
    }

    // If no specific permissions required, allow access
    if (!requiredPermissions.length || requiredPermissions.every(p => !p)) {
      console.log('No permissions required, access granted')
      return true
    }

    // Check if user has any of the required permissions
    const hasAccess = requiredPermissions.some(permission => {
      if (permission === '*') return true
      return userPermissions.includes(permission)
    })
    
    console.log('Permission check result:', hasAccess)
    return hasAccess
  }

  // Check roles
  const hasRole = (requiredRoles) => {
    if (!Array.isArray(requiredRoles)) {
      requiredRoles = [requiredRoles]
    }

    const userRoles = state.user?.roles || []
    
    // Admin role has all access
    if (userRoles.includes('admin')) {
      return true
    }

    // Check if user has any of the required roles
    return requiredRoles.some(role => 
      userRoles.includes(role)
    )
  }

  // Initialize authentication on app start
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { accessToken, refreshToken, user } = getStoredTokens()

        if (!accessToken || !user) {
          dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false })
          return
        }

        // Check if access token is expired
        if (isTokenExpired(accessToken)) {
          // Try to refresh token
          const newAccessToken = await refreshAccessToken()
          
          if (!newAccessToken) {
            dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false })
            return
          }
          
          // Update accessToken for verification
          accessToken = newAccessToken
        }

        // Verify token with server
        const isValid = await verifyToken(accessToken)
        
        if (isValid) {
          // Get fresh user data
          const currentUser = await getCurrentUser()
          
          dispatch({
            type: AUTH_ACTIONS.LOGIN_SUCCESS,
            payload: {
              accessToken,
              refreshToken,
              user: currentUser || user,
            },
          })
        } else {
          // Token is invalid, clear everything
          clearTokens()
          dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false })
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        clearTokens()
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false })
      }
    }

    initializeAuth()
  }, [])

  // Auto-refresh token before expiration
  useEffect(() => {
    if (!state.accessToken || !state.isAuthenticated) return

    const checkTokenExpiration = () => {
      if (isTokenExpired(state.accessToken)) {
        refreshAccessToken()
      }
    }

    // Check every 5 minutes
    const interval = setInterval(checkTokenExpiration, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [state.accessToken, state.isAuthenticated])

  const value = {
    ...state,
    login,
    logout,
    refreshAccessToken,
    getCurrentUser,
    hasPermission,
    hasRole,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext)
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  
  return context
}