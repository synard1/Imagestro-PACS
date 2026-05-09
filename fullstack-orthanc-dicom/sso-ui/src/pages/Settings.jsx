import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { systemAPI } from '../services/api'
import LoadingSpinner, { ButtonSpinner } from '../components/LoadingSpinner'
import { PermissionGate } from '../components/PermissionGate'

function Settings() {
  const { hasPermission } = useAuth()
  const { showNotification } = useNotification()
  
  const [activeTab, setActiveTab] = useState('general')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({})
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)

  // Settings form
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm()

  // Load settings
  useEffect(() => {
    loadSettings()
  }, [])

  // Load audit logs when security tab is active
  useEffect(() => {
    if (activeTab === 'security' && hasPermission(['audit.read'])) {
      loadAuditLogs()
    }
  }, [activeTab, hasPermission])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await systemAPI.getSettings()
      const settingsData = response.data || {}
      setSettings(settingsData)
      reset(settingsData)
    } catch (error) {
      console.error('Failed to load settings:', error)
      showNotification({
        type: 'error',
        title: 'Loading Failed',
        message: 'Failed to load system settings. Please refresh the page.',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadAuditLogs = async () => {
    try {
      setAuditLoading(true)
      const response = await systemAPI.getAuditLogs({ limit: 50 })
      setAuditLogs(response.data || [])
    } catch (error) {
      console.error('Failed to load audit logs:', error)
    } finally {
      setAuditLoading(false)
    }
  }

  // Save settings
  const onSubmit = async (data) => {
    try {
      setSaving(true)
      await systemAPI.updateSettings(data)
      setSettings(data)
      
      showNotification({
        type: 'success',
        title: 'Settings Saved',
        message: 'System settings have been updated successfully.',
      })
    } catch (error) {
      console.error('Failed to save settings:', error)
      showNotification({
        type: 'error',
        title: 'Save Failed',
        message: error.response?.data?.message || 'Failed to save settings. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  // Test email configuration
  const testEmailConfig = async () => {
    try {
      await systemAPI.testEmailConfig()
      showNotification({
        type: 'success',
        title: 'Email Test Successful',
        message: 'Test email sent successfully. Check your inbox.',
      })
    } catch (error) {
      console.error('Email test failed:', error)
      showNotification({
        type: 'error',
        title: 'Email Test Failed',
        message: error.response?.data?.message || 'Failed to send test email.',
      })
    }
  }

  // Clear audit logs
  const clearAuditLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all audit logs? This action cannot be undone.')) {
      return
    }

    try {
      await systemAPI.clearAuditLogs()
      setAuditLogs([])
      showNotification({
        type: 'success',
        title: 'Audit Logs Cleared',
        message: 'All audit logs have been cleared successfully.',
      })
    } catch (error) {
      console.error('Failed to clear audit logs:', error)
      showNotification({
        type: 'error',
        title: 'Clear Failed',
        message: 'Failed to clear audit logs. Please try again.',
      })
    }
  }

  const tabs = [
    { id: 'general', name: 'General', icon: '⚙️', permission: 'settings.read' },
    { id: 'authentication', name: 'Authentication', icon: '🔐', permission: 'settings.auth' },
    { id: 'email', name: 'Email', icon: '📧', permission: 'settings.email' },
    { id: 'security', name: 'Security', icon: '🛡️', permission: 'settings.security' },
    { id: 'integrations', name: 'Integrations', icon: '🔗', permission: 'settings.integrations' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSpinner message="Loading settings..." />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            System Settings
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Configure system-wide settings and preferences.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <PermissionGate key={tab.id} permissions={[tab.permission]}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.name}</span>
                </button>
              </PermissionGate>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                  General Settings
                </h2>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Application Name
                      </label>
                      <input
                        type="text"
                        {...register('app_name', { required: 'Application name is required' })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                      {errors.app_name && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {errors.app_name.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Application URL
                      </label>
                      <input
                        type="url"
                        {...register('app_url', { required: 'Application URL is required' })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                      {errors.app_url && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {errors.app_url.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Default Language
                      </label>
                      <select
                        {...register('default_language')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="en">English</option>
                        <option value="id">Indonesian</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Default Timezone
                      </label>
                      <select
                        {...register('default_timezone')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="UTC">UTC</option>
                        <option value="Asia/Jakarta">Asia/Jakarta</option>
                        <option value="America/New_York">America/New_York</option>
                        <option value="Europe/London">Europe/London</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Application Description
                    </label>
                    <textarea
                      {...register('app_description')}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Authentication Settings */}
            {activeTab === 'authentication' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                  Authentication Settings
                </h2>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Session Timeout (minutes)
                      </label>
                      <input
                        type="number"
                        {...register('session_timeout', { 
                          required: 'Session timeout is required',
                          min: { value: 5, message: 'Minimum 5 minutes' },
                          max: { value: 1440, message: 'Maximum 24 hours' }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                      {errors.session_timeout && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {errors.session_timeout.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Max Login Attempts
                      </label>
                      <input
                        type="number"
                        {...register('max_login_attempts', { 
                          required: 'Max login attempts is required',
                          min: { value: 3, message: 'Minimum 3 attempts' },
                          max: { value: 10, message: 'Maximum 10 attempts' }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                      {errors.max_login_attempts && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {errors.max_login_attempts.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Account Lockout Duration (minutes)
                      </label>
                      <input
                        type="number"
                        {...register('lockout_duration', { 
                          required: 'Lockout duration is required',
                          min: { value: 5, message: 'Minimum 5 minutes' }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                      {errors.lockout_duration && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {errors.lockout_duration.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Password Expiry (days)
                      </label>
                      <input
                        type="number"
                        {...register('password_expiry_days', { 
                          min: { value: 30, message: 'Minimum 30 days' },
                          max: { value: 365, message: 'Maximum 365 days' }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                      {errors.password_expiry_days && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {errors.password_expiry_days.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        {...register('require_2fa')}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                        Require Two-Factor Authentication
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        {...register('allow_remember_me')}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                        Allow "Remember Me" option
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        {...register('force_password_change')}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                        Force password change on first login
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Email Settings */}
            {activeTab === 'email' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Email Settings
                  </h2>
                  <button
                    type="button"
                    onClick={testEmailConfig}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Test Configuration
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        SMTP Host
                      </label>
                      <input
                        type="text"
                        {...register('smtp_host')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        SMTP Port
                      </label>
                      <input
                        type="number"
                        {...register('smtp_port')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        SMTP Username
                      </label>
                      <input
                        type="text"
                        {...register('smtp_username')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        SMTP Password
                      </label>
                      <input
                        type="password"
                        {...register('smtp_password')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        From Email
                      </label>
                      <input
                        type="email"
                        {...register('from_email')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        From Name
                      </label>
                      <input
                        type="text"
                        {...register('from_name')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        {...register('smtp_use_tls')}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                        Use TLS/SSL
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        {...register('email_notifications_enabled')}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                        Enable email notifications
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Security Settings */}
            {activeTab === 'security' && (
              <div className="p-6">
                <div className="space-y-8">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                      Security Settings
                    </h2>
                    
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            {...register('audit_logging_enabled')}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          />
                          <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                            Enable audit logging
                          </label>
                        </div>

                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            {...register('csrf_protection_enabled')}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          />
                          <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                            Enable CSRF protection
                          </label>
                        </div>

                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            {...register('rate_limiting_enabled')}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          />
                          <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                            Enable rate limiting
                          </label>
                        </div>

                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            {...register('ip_whitelist_enabled')}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          />
                          <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                            Enable IP whitelist
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Allowed IP Addresses (one per line)
                        </label>
                        <textarea
                          {...register('allowed_ips')}
                          rows={4}
                          placeholder="192.168.1.0/24&#10;10.0.0.0/8"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Audit Logs */}
                  <PermissionGate permissions={['audit.read']}>
                    <div>
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Recent Audit Logs
                        </h3>
                        <button
                          type="button"
                          onClick={clearAuditLogs}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                        >
                          Clear All Logs
                        </button>
                      </div>

                      {auditLoading ? (
                        <LoadingSpinner size="sm" message="Loading audit logs..." />
                      ) : (
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-96 overflow-y-auto">
                          {auditLogs.length > 0 ? (
                            <div className="space-y-2">
                              {auditLogs.map((log, index) => (
                                <div key={index} className="text-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-gray-900 dark:text-white">
                                      {log.action}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400">
                                      {new Date(log.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="text-gray-600 dark:text-gray-300">
                                    User: {log.user_email} | IP: {log.ip_address}
                                  </div>
                                  {log.details && (
                                    <div className="text-gray-500 dark:text-gray-400">
                                      {log.details}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 dark:text-gray-400 text-center">
                              No audit logs available.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </PermissionGate>
                </div>
              </div>
            )}

            {/* Integrations Settings */}
            {activeTab === 'integrations' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                  Service Integrations
                </h2>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Orthanc Server URL
                      </label>
                      <input
                        type="url"
                        {...register('orthanc_url')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        MWL Service URL
                      </label>
                      <input
                        type="url"
                        {...register('mwl_url')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Orders Service URL
                      </label>
                      <input
                        type="url"
                        {...register('orders_url')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        API Gateway URL
                      </label>
                      <input
                        type="url"
                        {...register('api_gateway_url')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        {...register('orthanc_integration_enabled')}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                        Enable Orthanc integration
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        {...register('mwl_integration_enabled')}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                        Enable MWL integration
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        {...register('orders_integration_enabled')}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label className="ml-2 block text-sm text-gray-900 dark:text-white">
                        Enable Orders integration
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 rounded-b-lg">
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {saving && <ButtonSpinner />}
                  <span>Save Settings</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Settings