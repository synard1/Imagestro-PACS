import { api } from '../api'
import { setEncrypted, getEncrypted, removeEncrypted } from '../utils/encryptedStorage'

const STORAGE_KEY = 'satusehat_config'

const DEFAULTS = {
  enabled: false,
  environment: 'STAGING',
  clientId: '',
  clientSecret: '',
  organizationId: ''
}

// Async — clientSecret is sensitive, stored AES-GCM encrypted.
export const loadSatusehatConfig = async () => {
  try {
    const stored = await getEncrypted(STORAGE_KEY)
    return stored ?? { ...DEFAULTS }
  } catch (e) {
    console.warn('Failed to load SatuSehat config:', e)
    return { ...DEFAULTS }
  }
}

export const saveSatusehatConfig = async (config) => {
  try {
    await setEncrypted(STORAGE_KEY, config)

    // Also save to server (non-secret fields only)
    try {
      const { clientSecret: _omit, ...safeConfig } = config
      await api.post('/api/satusehat/config', safeConfig)
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
  removeEncrypted(STORAGE_KEY)
}
