/**
 * Mock API Service
 * Provides dummy data when real APIs are unavailable to prevent looping errors
 */

import {
  generateDashboardStats,
  generateServiceHealth,
  generateRecentActivity,
  generateDicomStudies,
  generateWorklistItems,
  generateUsers,
  generateOrders,
  generateSystemMetrics,
  simulateApiDelay
} from '../utils/dummyDataGenerator'

// Configuration for mock API behavior
const MOCK_CONFIG = {
  enabled: import.meta.env.VITE_USE_MOCK_DATA === 'true' || false,
  simulateDelay: true,
  delayRange: { min: 200, max: 800 },
  errorRate: 0.0, // 0% chance of simulated errors - disabled to prevent dashboard loading issues
  enableLogging: import.meta.env.VITE_DEBUG_MODE === 'true'
}

/**
 * Logger for mock API
 */
const mockLogger = {
  log: (message, data = null) => {
    if (MOCK_CONFIG.enableLogging) {
      console.log(`[MockAPI] ${message}`, data || '')
    }
  },
  warn: (message, data = null) => {
    if (MOCK_CONFIG.enableLogging) {
      console.warn(`[MockAPI] ${message}`, data || '')
    }
  },
  error: (message, error = null) => {
    if (MOCK_CONFIG.enableLogging) {
      console.error(`[MockAPI] ${message}`, error || '')
    }
  }
}

/**
 * Simulate API response with optional delay and error simulation
 */
async function simulateApiResponse(dataGenerator, endpoint = 'unknown') {
  mockLogger.log(`Generating mock data for endpoint: ${endpoint}`)
  
  // Simulate network delay
  if (MOCK_CONFIG.simulateDelay) {
    await simulateApiDelay(MOCK_CONFIG.delayRange.min, MOCK_CONFIG.delayRange.max)
  }
  
  // Simulate random errors
  if (Math.random() < MOCK_CONFIG.errorRate) {
    const error = new Error(`Simulated API error for ${endpoint}`)
    error.status = Math.random() > 0.5 ? 500 : 503
    mockLogger.error(`Simulated error for ${endpoint}`, error)
    throw error
  }
  
  const data = dataGenerator()
  mockLogger.log(`Successfully generated mock data for ${endpoint}`, { dataSize: JSON.stringify(data).length })
  
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
      'x-mock-data': 'true'
    }
  }
}

/**
 * Mock System API
 */
export const mockSystemAPI = {
  /**
   * Get system statistics
   */
  async getStatistics() {
    return simulateApiResponse(generateDashboardStats, '/api/system/statistics')
  },

  /**
   * Get system health check
   */
  async healthCheck() {
    return simulateApiResponse(() => ({
      services: generateServiceHealth(),
      overall_status: 'healthy',
      timestamp: new Date().toISOString()
    }), '/api/system/health')
  },

  /**
   * Get audit logs
   */
  async getAuditLogs(params = {}) {
    const limit = params.limit || 10
    return simulateApiResponse(() => generateRecentActivity(limit), '/api/system/audit')
  },

  /**
   * Get system metrics
   */
  async getMetrics() {
    return simulateApiResponse(generateSystemMetrics, '/api/system/metrics')
  }
}

/**
 * Mock Service API
 */
export const mockServiceAPI = {
  /**
   * Get DICOM studies
   */
  async getDicomStudies(params = {}) {
    const limit = params.limit || 20
    return simulateApiResponse(() => generateDicomStudies(limit), '/api/services/dicom/studies')
  },

  /**
   * Get worklist items
   */
  async getWorklistItems(params = {}) {
    const limit = params.limit || 15
    return simulateApiResponse(() => generateWorklistItems(limit), '/api/services/mwl/worklist')
  },

  /**
   * Get orders
   */
  async getOrders(params = {}) {
    const limit = params.limit || 20
    return simulateApiResponse(() => generateOrders(limit), '/api/services/orders')
  },

  /**
   * Create new order
   */
  async createOrder(orderData) {
    return simulateApiResponse(() => ({
      id: `ORD${Date.now()}`,
      ...orderData,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }), '/api/services/orders [POST]')
  },

  /**
   * Update order
   */
  async updateOrder(orderId, updateData) {
    return simulateApiResponse(() => ({
      id: orderId,
      ...updateData,
      updated_at: new Date().toISOString()
    }), `/api/services/orders/${orderId} [PUT]`)
  },

  /**
   * Delete order
   */
  async deleteOrder(orderId) {
    return simulateApiResponse(() => ({
      message: `Order ${orderId} deleted successfully`,
      deleted_at: new Date().toISOString()
    }), `/api/services/orders/${orderId} [DELETE]`)
  }
}

/**
 * Mock User API
 */
export const mockUserAPI = {
  /**
   * Get users
   */
  async getUsers(params = {}) {
    const limit = params.limit || 25
    return simulateApiResponse(() => generateUsers(limit), '/api/users')
  },

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    return simulateApiResponse(() => {
      const users = generateUsers(1)
      return { ...users[0], id: userId }
    }, `/api/users/${userId}`)
  },

  /**
   * Create user
   */
  async createUser(userData) {
    return simulateApiResponse(() => ({
      id: Date.now(),
      ...userData,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }), '/api/users [POST]')
  },

  /**
   * Update user
   */
  async updateUser(userId, updateData) {
    return simulateApiResponse(() => ({
      id: userId,
      ...updateData,
      updated_at: new Date().toISOString()
    }), `/api/users/${userId} [PUT]`)
  },

  /**
   * Delete user
   */
  async deleteUser(userId) {
    return simulateApiResponse(() => ({
      message: `User ${userId} deleted successfully`,
      deleted_at: new Date().toISOString()
    }), `/api/users/${userId} [DELETE]`)
  }
}

/**
 * Mock Authentication API
 */
export const mockAuthAPI = {
  /**
   * Login
   */
  async login(credentials) {
    return simulateApiResponse(() => {
      const users = generateUsers(1)
      const user = users[0]
      return {
        user: {
          ...user,
          username: credentials.username
        },
        token: `mock_token_${Date.now()}`,
        expires_in: 3600,
        refresh_token: `mock_refresh_${Date.now()}`
      }
    }, '/api/auth/login [POST]')
  },

  /**
   * Logout
   */
  async logout() {
    return simulateApiResponse(() => ({
      message: 'Logged out successfully'
    }), '/api/auth/logout [POST]')
  },

  /**
   * Refresh token
   */
  async refreshToken(refreshToken) {
    return simulateApiResponse(() => ({
      token: `mock_token_${Date.now()}`,
      expires_in: 3600,
      refresh_token: `mock_refresh_${Date.now()}`
    }), '/api/auth/refresh [POST]')
  },

  /**
   * Get current user profile
   */
  async getProfile() {
    return simulateApiResponse(() => {
      const users = generateUsers(1)
      return users[0]
    }, '/api/auth/profile')
  }
}

/**
 * API Wrapper that falls back to mock data when real API fails
 */
export class ApiWithFallback {
  constructor(realApi, mockApi, serviceName = 'Unknown') {
    this.realApi = realApi
    this.mockApi = mockApi
    this.serviceName = serviceName
    this.consecutiveFailures = 0
    this.maxFailures = 3
    this.useMockMode = false
  }

  /**
   * Execute API call with fallback to mock data
   */
  async executeWithFallback(methodName, ...args) {
    // If we're in mock mode or mock is explicitly enabled, use mock data
    if (this.useMockMode || MOCK_CONFIG.enabled) {
      mockLogger.log(`Using mock data for ${this.serviceName}.${methodName}`)
      return await this.mockApi[methodName](...args)
    }

    try {
      // Try real API first
      const result = await this.realApi[methodName](...args)
      
      // Reset failure counter on success
      this.consecutiveFailures = 0
      
      return result
    } catch (error) {
      this.consecutiveFailures++
      
      mockLogger.warn(`Real API failed for ${this.serviceName}.${methodName} (attempt ${this.consecutiveFailures})`, error.message)
      
      // Switch to mock mode after consecutive failures
      if (this.consecutiveFailures >= this.maxFailures) {
        this.useMockMode = true
        mockLogger.warn(`Switching to mock mode for ${this.serviceName} after ${this.maxFailures} consecutive failures`)
      }
      
      // Use mock data as fallback
      try {
        const mockResult = await this.mockApi[methodName](...args)
        mockLogger.log(`Fallback to mock data successful for ${this.serviceName}.${methodName}`)
        return mockResult
      } catch (mockError) {
        mockLogger.error(`Mock API also failed for ${this.serviceName}.${methodName}`, mockError)
        throw error // Throw original error if mock also fails
      }
    }
  }

  /**
   * Reset to try real API again
   */
  resetToRealApi() {
    this.useMockMode = false
    this.consecutiveFailures = 0
    mockLogger.log(`Reset ${this.serviceName} to use real API`)
  }

  /**
   * Force mock mode
   */
  forceMockMode() {
    this.useMockMode = true
    mockLogger.log(`Forced ${this.serviceName} to use mock mode`)
  }
}

/**
 * Utility to check if mock data is being used
 */
export function isMockDataEnabled() {
  return MOCK_CONFIG.enabled
}

/**
 * Utility to enable/disable mock data
 */
export function setMockDataEnabled(enabled) {
  MOCK_CONFIG.enabled = enabled
  mockLogger.log(`Mock data ${enabled ? 'enabled' : 'disabled'}`)
}

/**
 * Get mock configuration
 */
export function getMockConfig() {
  return { ...MOCK_CONFIG }
}

/**
 * Update mock configuration
 */
export function updateMockConfig(newConfig) {
  Object.assign(MOCK_CONFIG, newConfig)
  mockLogger.log('Mock configuration updated', MOCK_CONFIG)
}

export default {
  mockSystemAPI,
  mockServiceAPI,
  mockUserAPI,
  mockAuthAPI,
  ApiWithFallback,
  isMockDataEnabled,
  setMockDataEnabled,
  getMockConfig,
  updateMockConfig
}