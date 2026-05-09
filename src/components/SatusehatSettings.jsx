import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { loadSatusehatConfig, saveSatusehatConfig } from '../config/satusehatConfig'
import { satusehatService } from '../services/satusehatService'

export default function SatusehatSettings() {
  const [config, setConfig] = useState(() => loadSatusehatConfig())
  const [status, setStatus] = useState(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Check connection status on mount if enabled
    if (config.enabled) {
      checkConnectionStatus()
    }
  }, [])

  const handleChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const checkConnectionStatus = async () => {
    setTesting(true)
    try {
      const health = await satusehatService.checkHealth()
      setStatus(health)
      
      if (health.status === 'ok') {
        toast.success('SatuSehat connection is working')
      } else {
        toast.error(\`SatuSehat connection error: \${health.error?.message || 'Unknown error'}\`)
      }
    } catch (error) {
      console.error('Failed to check SatuSehat connection:', error)
      setStatus({
        status: 'error',
        error: {
          message: error.message
        }
      })
      toast.error('Failed to check connection')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Validate required fields if enabled
      if (config.enabled) {
        if (!config.clientId || !config.clientSecret || !config.organizationId) {
          throw new Error('Please fill in all required fields')
        }
      }

      // Save configuration
      await saveSatusehatConfig(config)
      
      // Test connection if enabled
      if (config.enabled) {
        await checkConnectionStatus()
      }

      toast.success('SatuSehat configuration saved successfully')
    } catch (error) {
      console.error('Failed to save SatuSehat config:', error)
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-lg font-medium mb-4">SatuSehat Integration Settings</h3>
        
        {/* Enable/Disable toggle */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <label className="font-medium">Enable SatuSehat Integration</label>
            <p className="text-sm text-gray-500">Enable integration with SatuSehat system</p>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleChange('enabled', e.target.checked)}
              className="toggle"
            />
          </div>
        </div>

        {config.enabled && (
          <>
            {/* Environment selection */}
            <div className="mb-4">
              <label className="block font-medium mb-1">Environment</label>
              <select
                value={config.environment}
                onChange={(e) => handleChange('environment', e.target.value)}
                className="select w-full"
              >
                <option value="STAGING">Staging Environment</option>
                <option value="PRODUCTION">Production Environment</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Select 'Staging' for testing, 'Production' for live deployment
              </p>
            </div>

            {/* Client credentials */}
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label className="block font-medium mb-1">Client ID</label>
                <input
                  type="text"
                  value={config.clientId}
                  onChange={(e) => handleChange('clientId', e.target.value)}
                  className="input w-full"
                  placeholder="Enter your Client ID"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Client Secret</label>
                <input
                  type="password"
                  value={config.clientSecret}
                  onChange={(e) => handleChange('clientSecret', e.target.value)}
                  className="input w-full"
                  placeholder="Enter your Client Secret"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Organization ID</label>
                <input
                  type="text"
                  value={config.organizationId}
                  onChange={(e) => handleChange('organizationId', e.target.value)}
                  className="input w-full"
                  placeholder="Enter your Organization ID"
                />
              </div>
            </div>

            {/* Connection status */}
            {status && (
              <div className={`p-4 rounded-lg mb-4 ${
                status.status === 'ok' 
                  ? 'bg-green-50 text-green-700' 
                  : 'bg-red-50 text-red-700'
              }`}>
                <div className="flex items-center">
                  <span className="mr-2">
                    {status.status === 'ok' ? '✅' : '❌'}
                  </span>
                  <div>
                    <p className="font-medium">
                      {status.status === 'ok' 
                        ? 'Connected to SatuSehat' 
                        : 'Connection Error'}
                    </p>
                    {status.error && (
                      <p className="text-sm mt-1">{status.error.message}</p>
                    )}
                    {status.tokenInfo && (
                      <p className="text-sm mt-1">
                        Token expires in: {Math.round((status.tokenInfo.expiresIn || 0) / 60)} minutes
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2">
              <button
                onClick={checkConnectionStatus}
                disabled={testing}
                className="btn btn-secondary"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || testing}
                className="btn btn-primary"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}