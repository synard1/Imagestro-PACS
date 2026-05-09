import { apiClient } from './http'
import { loadRegistry } from './api-registry'

const SATUSEHAT_STATUS = {
  OK: 'ok',
  ERROR: 'error',
  UNAUTHORIZED: 'unauthorized',
  TIMEOUT: 'timeout'
}

class SatusehatHealthCheck {
  constructor() {
    this.lastCheck = null
    this.lastStatus = null
    this.checkInterval = 5 * 60 * 1000 // 5 minutes
  }

  async checkHealth() {
    // Return cached result if within interval
    if (this.lastCheck && (Date.now() - this.lastCheck) < this.checkInterval) {
      return {
        status: this.lastStatus,
        lastCheck: this.lastCheck,
        isCached: true
      }
    }

    try {
      // Check both backend API and SatuSehat organization status
      const [backendStatus, orgStatus] = await Promise.all([
        this.checkBackendAPI(),
        this.checkOrganization()
      ])

      const status = this.evaluateStatus(backendStatus, orgStatus)
      this.lastCheck = Date.now()
      this.lastStatus = status

      return {
        status,
        lastCheck: this.lastCheck,
        isCached: false,
        details: {
          backend: backendStatus,
          organization: orgStatus
        }
      }
    } catch (error) {
      console.error('Health check failed:', error)
      return {
        status: SATUSEHAT_STATUS.ERROR,
        error: error.message,
        lastCheck: Date.now(),
        isCached: false
      }
    }
  }

  async checkBackendAPI() {
    try {
      // Create API client for satusehat module
      const client = apiClient('satusehat')
      const response = await client.get('/api/satusehat/health')
      return {
        status: response.status === 200 ? SATUSEHAT_STATUS.OK : SATUSEHAT_STATUS.ERROR,
        responseTime: response.responseTime,
        details: response.data
      }
    } catch (error) {
      return {
        status: error.response?.status === 401 ? SATUSEHAT_STATUS.UNAUTHORIZED : SATUSEHAT_STATUS.ERROR,
        error: error.message
      }
    }
  }

  async checkOrganization() {
    try {
      // Create API client for satusehat module
      const client = apiClient('satusehat')
      const response = await client.get('/api/satusehat/organization-status')
      const orgData = response.data

      return {
        status: orgData.active ? SATUSEHAT_STATUS.OK : SATUSEHAT_STATUS.ERROR,
        organizationId: orgData.id,
        name: orgData.name,
        lastUpdated: orgData.meta?.lastUpdated,
        active: orgData.active,
        responseTime: response.responseTime
      }
    } catch (error) {
      return {
        status: error.response?.status === 401 ? SATUSEHAT_STATUS.UNAUTHORIZED : SATUSEHAT_STATUS.ERROR,
        error: error.message
      }
    }
  }

  evaluateStatus(backendStatus, orgStatus) {
    // If either check returned unauthorized, system is unauthorized
    if (backendStatus.status === SATUSEHAT_STATUS.UNAUTHORIZED || 
        orgStatus.status === SATUSEHAT_STATUS.UNAUTHORIZED) {
      return SATUSEHAT_STATUS.UNAUTHORIZED
    }

    // If either check failed, system is in error state
    if (backendStatus.status === SATUSEHAT_STATUS.ERROR || 
        orgStatus.status === SATUSEHAT_STATUS.ERROR) {
      return SATUSEHAT_STATUS.ERROR
    }

    // Both checks passed
    return SATUSEHAT_STATUS.OK
  }

  clearCache() {
    this.lastCheck = null
    this.lastStatus = null
  }
}

export const satusehatHealthCheck = new SatusehatHealthCheck()
export { SATUSEHAT_STATUS }