import { api } from '../api'

const STORAGE_KEY = 'satusehat_config'

export const loadSatusehatConfig = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {
      enabled: false,
      environment: 'STAGING',
      clientId: '',
      clientSecret: '',
      organizationId: ''
    }
  } catch (e) {
    console.warn('Failed to load SatuSehat config:', e)
    return {
      enabled: false,
      environment: 'STAGING',
      clientId: '',
      clientSecret: '',
      organizationId: ''
    }
  }
}

export const saveSatusehatConfig = async (config) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    
    // Also save to server if available
    try {
      await api.post('/api/satusehat/config', config)
    } catch (e) {
      console.warn('Failed to save SatuSehat config to server:', e)
    }
    
    return true
  } catch (e) {
    console.error('Failed to save SatuSehat config:', e)
    return false
  }
}

export const clearSatusehatConfig = () => {
  localStorage.removeItem(STORAGE_KEY)
}