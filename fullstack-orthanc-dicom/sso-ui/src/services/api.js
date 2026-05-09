import axios from 'axios'
import Cookies from 'js-cookie'

// API configuration
const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_GATEWAY_URL || 'http://103.42.117.19:8888',
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
}

// Token storage keys
const TOKEN_KEYS = {
  ACCESS_TOKEN: 'dicom_access_token',
  REFRESH_TOKEN: 'dicom_refresh_token',
}

// Create axios instance
const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = Cookies.get(TOKEN_KEYS.ACCESS_TOKEN)
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // Add CSRF token if available
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken
    }

    // Add request timestamp for audit logging
    config.headers['X-Request-Timestamp'] = new Date().toISOString()
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
  (response) => {
    return response.data
  },
  async (error) => {
    const originalRequest = error.config

    // Handle 401 Unauthorized - token expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = Cookies.get(TOKEN_KEYS.REFRESH_TOKEN)
        
        if (refreshToken) {
          const response = await axios.post(
            `${API_CONFIG.BASE_URL}/auth/refresh`,
            { refresh_token: refreshToken },
            { timeout: API_CONFIG.TIMEOUT }
          )

          if (response.data.status === 'success') {
            const { access_token, refresh_token } = response.data

            // Update tokens
            Cookies.set(TOKEN_KEYS.ACCESS_TOKEN, access_token, {
              expires: 1,
              secure: window.location.protocol === 'https:',
              sameSite: 'strict',
            })

            if (refresh_token) {
              Cookies.set(TOKEN_KEYS.REFRESH_TOKEN, refresh_token, {
                expires: 30,
                secure: window.location.protocol === 'https:',
                sameSite: 'strict',
              })
            }

            // Retry original request with new token
            originalRequest.headers.Authorization = `Bearer ${access_token}`
            return apiClient(originalRequest)
          }
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError)
        
        // Clear tokens and redirect to login
        Cookies.remove(TOKEN_KEYS.ACCESS_TOKEN)
        Cookies.remove(TOKEN_KEYS.REFRESH_TOKEN)
        localStorage.removeItem('dicom_user_data')
        
        // Redirect to login if not already there
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }

    // Handle network errors
    if (!error.response) {
      return Promise.reject({
        message: 'Network error. Please check your connection.',
        type: 'network',
        originalError: error,
      })
    }

    // Handle other HTTP errors
    const errorData = error.response.data || {}
    return Promise.reject({
      message: errorData.message || `HTTP ${error.response.status}: ${error.response.statusText}`,
      status: error.response.status,
      type: 'http',
      data: errorData,
      originalError: error,
    })
  }
)

// Retry mechanism for failed requests
const retryRequest = async (requestFn, attempts = API_CONFIG.RETRY_ATTEMPTS) => {
  try {
    return await requestFn()
  } catch (error) {
    if (attempts > 1 && error.type === 'network') {
      await new Promise(resolve => setTimeout(resolve, API_CONFIG.RETRY_DELAY))
      return retryRequest(requestFn, attempts - 1)
    }
    throw error
  }
}

// Authentication API
export const authAPI = {
  // Login
  login: async (credentials) => {
    return retryRequest(() => 
      apiClient.post('/auth/login', credentials)
    )
  },

  // Logout
  logout: async () => {
    return retryRequest(() => 
      apiClient.post('/auth/logout')
    )
  },

  // Refresh token
  refreshToken: async (refreshToken) => {
    return retryRequest(() => 
      apiClient.post('/auth/refresh', { refresh_token: refreshToken })
    )
  },

  // Verify token
  verifyToken: async (token) => {
    return retryRequest(() => 
      apiClient.post('/auth/verify', { token })
    )
  },

  // Get current user
  getCurrentUser: async () => {
    return retryRequest(() => 
      apiClient.get('/auth/me')
    )
  },

  // Update user profile
  updateProfile: async (profileData) => {
    return retryRequest(() => 
      apiClient.put('/auth/profile', profileData)
    )
  },

  // Change password
  changePassword: async (passwordData) => {
    return retryRequest(() => 
      apiClient.put('/auth/password', passwordData)
    )
  },

  // Request password reset
  requestPasswordReset: async (email) => {
    return retryRequest(() => 
      apiClient.post('/auth/password-reset/request', { email })
    )
  },

  // Reset password
  resetPassword: async (token, newPassword) => {
    return retryRequest(() => 
      apiClient.post('/auth/password-reset/confirm', { token, new_password: newPassword })
    )
  },
}

// User management API (admin only)
export const userAPI = {
  // Get all users
  getUsers: async (params = {}) => {
    return retryRequest(() => 
      apiClient.get('/users', { params })
    )
  },

  // Get user by ID
  getUser: async (userId) => {
    return retryRequest(() => 
      apiClient.get(`/users/${userId}`)
    )
  },

  // Create user
  createUser: async (userData) => {
    return retryRequest(() => 
      apiClient.post('/users', userData)
    )
  },

  // Update user
  updateUser: async (userId, userData) => {
    return retryRequest(() => 
      apiClient.put(`/users/${userId}`, userData)
    )
  },

  // Delete user
  deleteUser: async (userId) => {
    return retryRequest(() => 
      apiClient.delete(`/users/${userId}`)
    )
  },

  // Get user roles
  getUserRoles: async (userId) => {
    return retryRequest(() => 
      apiClient.get(`/users/${userId}/roles`)
    )
  },

  // Update user roles
  updateUserRoles: async (userId, roles) => {
    return retryRequest(() => 
      apiClient.put(`/users/${userId}/roles`, { roles })
    )
  },
}

// Role and permission API
export const rbacAPI = {
  // Get all roles
  getRoles: async () => {
    return retryRequest(() => 
      apiClient.get('/roles')
    )
  },

  // Get role by ID
  getRole: async (roleId) => {
    return retryRequest(() => 
      apiClient.get(`/roles/${roleId}`)
    )
  },

  // Create role
  createRole: async (roleData) => {
    return retryRequest(() => 
      apiClient.post('/roles', roleData)
    )
  },

  // Update role
  updateRole: async (roleId, roleData) => {
    return retryRequest(() => 
      apiClient.put(`/roles/${roleId}`, roleData)
    )
  },

  // Delete role
  deleteRole: async (roleId) => {
    return retryRequest(() => 
      apiClient.delete(`/roles/${roleId}`)
    )
  },

  // Get all permissions
  getPermissions: async () => {
    return retryRequest(() => 
      apiClient.get('/permissions')
    )
  },

  // Get role permissions
  getRolePermissions: async (roleId) => {
    return retryRequest(() => 
      apiClient.get(`/roles/${roleId}/permissions`)
    )
  },

  // Update role permissions
  updateRolePermissions: async (roleId, permissions) => {
    return retryRequest(() => 
      apiClient.put(`/roles/${roleId}/permissions`, { permissions })
    )
  },
}

// System API
export const systemAPI = {
  // Health check
  healthCheck: async () => {
    return retryRequest(() => 
      apiClient.get('/health')
    )
  },

  // Get system configuration
  getConfig: async () => {
    return retryRequest(() => 
      apiClient.get('/config')
    )
  },

  // Get system statistics
  getStatistics: async () => {
    return retryRequest(() => 
      apiClient.get('/statistics')
    )
  },

  // Get audit logs
  getAuditLogs: async (params = {}) => {
    return retryRequest(() => 
      apiClient.get('/audit-logs', { params })
    )
  },
}

// Orthanc API
export const orthancAPI = {
  getSystemInfo: async () => {
    return retryRequest(() =>
      apiClient.get('/orthanc/system')
    )
  },
  getPatients: async (params = {}) => {
    return retryRequest(() =>
      apiClient.get('/orthanc/patients', { params })
    )
  },
  getStudies: async (patientId) => {
    return retryRequest(() =>
      apiClient.get(`/orthanc/patients/${patientId}/studies`)
    )
  },
  getSeries: async (studyId) => {
    return retryRequest(() =>
      apiClient.get(`/orthanc/studies/${studyId}/series`)
    )
  },
  getInstances: async (seriesId) => {
    return retryRequest(() =>
      apiClient.get(`/orthanc/series/${seriesId}/instances`)
    )
  },
  searchPatients: async (query) => {
    return retryRequest(() =>
      apiClient.get('/orthanc/patients', { params: { query } })
    )
  },
  downloadInstance: async (instanceId) => {
    return retryRequest(() =>
      apiClient.get(`/orthanc/instances/${instanceId}/file`, { responseType: 'blob' })
    )
  },
  deleteResource: async (resourceType, resourceId) => {
    return retryRequest(() =>
      apiClient.delete(`/orthanc/${resourceType}s/${resourceId}`)
    )
  },
}

// Service integration APIs
export const serviceAPI = {
  // MWL service
  mwl: {
    getWorklist: async (params = {}) => {
      return retryRequest(() => 
        apiClient.get('/mwl/worklist', { params })
      )
    },

    getWorklistItem: async (accessionNumber) => {
      return retryRequest(() => 
        apiClient.get(`/mwl/worklist/${accessionNumber}`)
      )
    },

    updateWorklistItem: async (accessionNumber, data) => {
      return retryRequest(() => 
        apiClient.put(`/mwl/worklist/${accessionNumber}`, data)
      )
    },

    deleteWorklistItem: async (accessionNumber) => {
      return retryRequest(() => 
        apiClient.delete(`/mwl/worklist/${accessionNumber}`)
      )
    },
  },

  // Orders service
  orders: {
    getOrders: async (params = {}) => {
      return retryRequest(() => 
        apiClient.get('/orders', { params })
      )
    },

    getOrder: async (orderId) => {
      return retryRequest(() => 
        apiClient.get(`/orders/${orderId}`)
      )
    },

    createOrder: async (orderData) => {
      return retryRequest(() => 
        apiClient.post('/orders', orderData)
      )
    },

    updateOrder: async (orderId, orderData) => {
      return retryRequest(() => 
        apiClient.put(`/orders/${orderId}`, orderData)
      )
    },

    deleteOrder: async (orderId) => {
      return retryRequest(() => 
        apiClient.delete(`/orders/${orderId}`)
      )
    },
  },
}

// Generic API client for custom requests
export const apiRequest = {
  get: (url, config = {}) => retryRequest(() => apiClient.get(url, config)),
  post: (url, data = {}, config = {}) => retryRequest(() => apiClient.post(url, data, config)),
  put: (url, data = {}, config = {}) => retryRequest(() => apiClient.put(url, data, config)),
  patch: (url, data = {}, config = {}) => retryRequest(() => apiClient.patch(url, data, config)),
  delete: (url, config = {}) => retryRequest(() => apiClient.delete(url, config)),
}

// Export the configured axios instance for advanced usage
export { apiClient }

export default {
  auth: authAPI,
  user: userAPI,
  rbac: rbacAPI,
  system: systemAPI,
  orthanc: orthancAPI, // Add orthancAPI to default export
  service: serviceAPI,
  request: apiRequest,
}
