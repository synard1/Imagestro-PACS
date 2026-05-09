import { useState, useEffect } from 'react'
import { logger } from '../../../utils/logger'
import * as khanzaService from '../../../services/khanzaService'

/**
 * Connection Settings Page
 * 
 * Allows administrators to configure Khanza API connection settings:
 * - API URL
 * - API Key
 * - Connection timeout
 * - Test connection functionality
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export default function ConnectionSettings() {
  const [config, setConfig] = useState({
    baseUrl: 'http://localhost:3007',
    apiKey: '',
    timeoutMs: 30000,
  })

  const [draftConfig, setDraftConfig] = useState(config)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Load current configuration on mount
  useEffect(() => {
    const loadConfig = () => {
      try {
        const currentConfig = khanzaService.getKhanzaConfig()
        setConfig(currentConfig)
        setDraftConfig(currentConfig)
      } catch (err) {
        logger.error('[ConnectionSettings]', 'Failed to load config:', err.message)
        setError('Failed to load current configuration')
      }
    }
    loadConfig()
  }, [])

  // Handle field changes
  const handleChange = (field, value) => {
    setDraftConfig(prev => ({
      ...prev,
      [field]: value
    }))
    setError(null)
    setSuccess(false)
  }

  // Test connection with real API call
  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    setError(null)

    try {
      // Validate required fields first
      if (!draftConfig.baseUrl?.trim()) {
        throw new Error('API URL is required')
      }
      if (!draftConfig.apiKey?.trim()) {
        throw new Error('API Key is required')
      }

      // Temporarily apply draft config for testing
      const originalConfig = khanzaService.getKhanzaConfig()
      khanzaService.saveKhanzaConfig(draftConfig)

      logger.info('[ConnectionSettings]', 'Testing connection to:', draftConfig.baseUrl)

      // Perform real health check with actual API call
      const startTime = Date.now()
      const result = await khanzaService.checkHealth()
      const responseTime = Date.now() - startTime

      // Restore original config
      khanzaService.saveKhanzaConfig(originalConfig)

      // Enhance result with response time
      const enhancedResult = {
        ...result,
        responseTime: responseTime,
        timestamp: new Date().toISOString()
      }

      setTestResult(enhancedResult)

      if (result.status === 'connected') {
        logger.info('[ConnectionSettings]', 'Connection test successful', {
          responseTime,
          url: draftConfig.baseUrl
        })
      } else {
        logger.warn('[ConnectionSettings]', 'Connection test failed:', {
          message: result.message,
          error: result.error,
          url: draftConfig.baseUrl
        })
      }
    } catch (err) {
      logger.error('[ConnectionSettings]', 'Connection test error:', err.message)
      
      // Restore original config on error
      try {
        const originalConfig = khanzaService.getKhanzaConfig()
        khanzaService.saveKhanzaConfig(originalConfig)
      } catch (e) {
        // Ignore restoration errors
      }

      setTestResult({
        status: 'disconnected',
        message: err.message,
        error: 'TEST_ERROR',
        timestamp: new Date().toISOString()
      })
    } finally {
      setTesting(false)
    }
  }

  // Save configuration
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      // Validate required fields
      if (!draftConfig.baseUrl || !draftConfig.baseUrl.trim()) {
        throw new Error('API URL is required')
      }

      if (!draftConfig.apiKey || !draftConfig.apiKey.trim()) {
        throw new Error('API Key is required')
      }

      if (!draftConfig.timeoutMs || draftConfig.timeoutMs < 1000) {
        throw new Error('Timeout must be at least 1000ms')
      }

      // Test connection before saving
      khanzaService.saveKhanzaConfig(draftConfig)
      const testResult = await khanzaService.checkHealth()

      if (testResult.status !== 'connected') {
        throw new Error(`Connection test failed: ${testResult.message}`)
      }

      // Save configuration
      khanzaService.saveKhanzaConfig(draftConfig)
      setConfig(draftConfig)
      setSuccess(true)
      setTestResult(testResult)

      logger.info('[ConnectionSettings]', 'Configuration saved successfully')

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      logger.error('[ConnectionSettings]', 'Failed to save configuration:', err.message)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Reset to current configuration
  const handleReset = () => {
    setDraftConfig(config)
    setError(null)
    setSuccess(false)
    setTestResult(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Khanza API Connection</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure the connection to your SIMRS Khanza API server
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <span className="text-red-600 mr-3">⚠️</span>
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Alert */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start">
            <span className="text-green-600 mr-3">✓</span>
            <div>
              <h3 className="font-semibold text-green-900">Success</h3>
              <p className="text-sm text-green-700 mt-1">Configuration saved and connection verified</p>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <div className="card space-y-4">
        {/* API URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API URL <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={draftConfig.baseUrl}
            onChange={(e) => handleChange('baseUrl', e.target.value)}
            placeholder="http://localhost:3007"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            The base URL of your Khanza API server (e.g., http://localhost:3007)
          </p>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={draftConfig.apiKey}
            onChange={(e) => handleChange('apiKey', e.target.value)}
            placeholder="Enter your API key"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            The API key for authentication with Khanza API (sent as X-API-Key header)
          </p>
        </div>

        {/* Timeout */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Connection Timeout (ms) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={draftConfig.timeoutMs}
            onChange={(e) => handleChange('timeoutMs', parseInt(e.target.value) || 30000)}
            min="1000"
            step="1000"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Maximum time to wait for API response (minimum 1000ms)
          </p>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`p-4 rounded-lg border ${
          testResult.status === 'connected'
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start">
            <span className={`mr-3 text-lg ${
              testResult.status === 'connected' ? 'text-green-600' : 'text-red-600'
            }`}>
              {testResult.status === 'connected' ? '✓' : '✗'}
            </span>
            <div className="flex-1">
              <h3 className={`font-semibold ${
                testResult.status === 'connected' ? 'text-green-900' : 'text-red-900'
              }`}>
                {testResult.status === 'connected' ? 'Connection Successful' : 'Connection Failed'}
              </h3>
              <p className={`text-sm mt-1 ${
                testResult.status === 'connected' ? 'text-green-700' : 'text-red-700'
              }`}>
                {testResult.message}
              </p>
              
              {/* Additional Details */}
              <div className={`mt-3 pt-3 border-t ${
                testResult.status === 'connected' ? 'border-green-200' : 'border-red-200'
              }`}>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="font-semibold">API URL:</span>
                    <p className="text-gray-600 break-all">{draftConfig.baseUrl}</p>
                  </div>
                  {testResult.responseTime && (
                    <div>
                      <span className="font-semibold">Response Time:</span>
                      <p className="text-gray-600">{testResult.responseTime}ms</p>
                    </div>
                  )}
                  {testResult.timestamp && (
                    <div className="col-span-2">
                      <span className="font-semibold">Tested at:</span>
                      <p className="text-gray-600">{new Date(testResult.timestamp).toLocaleString()}</p>
                    </div>
                  )}
                  {testResult.error && (
                    <div className="col-span-2">
                      <span className="font-semibold">Error Code:</span>
                      <p className="text-gray-600">{testResult.error}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={handleReset}
          disabled={saving || testing}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Reset
        </button>
        <button
          onClick={handleTestConnection}
          disabled={saving || testing || !draftConfig.baseUrl || !draftConfig.apiKey}
          className="px-4 py-2 border border-blue-500 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || testing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {/* Info Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Configuration Information</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Configuration is validated by testing the connection before saving</li>
          <li>• The API Key is stored securely in the browser's local storage</li>
          <li>• Changes take effect immediately after saving</li>
          <li>• Ensure your Khanza API server is running and accessible</li>
        </ul>
      </div>
    </div>
  )
}
