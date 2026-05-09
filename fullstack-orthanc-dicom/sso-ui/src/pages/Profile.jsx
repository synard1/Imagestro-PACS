import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { useTheme } from '../contexts/ThemeContext'
import { userAPI } from '../services/api'
import LoadingSpinner, { ButtonSpinner } from '../components/LoadingSpinner'

function Profile() {
  const { user, updateUser } = useAuth()
  const { showNotification } = useNotification()
  const { theme, toggleTheme, fontSize, setFontSize, reducedMotion, toggleReducedMotion } = useTheme()
  
  const [activeTab, setActiveTab] = useState('profile')
  const [loading, setLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // Profile form
  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
    reset: resetProfile,
  } = useForm({
    defaultValues: {
      full_name: user?.full_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      department: user?.department || '',
      position: user?.position || '',
    },
  })

  // Password form
  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors },
    reset: resetPassword,
    watch,
  } = useForm()

  const newPassword = watch('new_password')

  // Load user sessions
  useEffect(() => {
    const loadSessions = async () => {
      try {
        setSessionsLoading(true)
        const response = await userAPI.getUserSessions(user.id)
        setSessions(response.data || [])
      } catch (error) {
        console.error('Failed to load sessions:', error)
      } finally {
        setSessionsLoading(false)
      }
    }

    if (activeTab === 'security') {
      loadSessions()
    }
  }, [activeTab, user.id])

  // Update profile
  const onProfileSubmit = async (data) => {
    try {
      setLoading(true)
      const response = await userAPI.updateProfile(user.id, data)
      
      // Update user context
      updateUser(response.data)
      
      showNotification({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your profile has been updated successfully.',
      })
    } catch (error) {
      console.error('Failed to update profile:', error)
      showNotification({
        type: 'error',
        title: 'Update Failed',
        message: error.response?.data?.message || 'Failed to update profile. Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  // Change password
  const onPasswordSubmit = async (data) => {
    try {
      setPasswordLoading(true)
      await userAPI.changePassword(user.id, {
        current_password: data.current_password,
        new_password: data.new_password,
      })
      
      resetPassword()
      showNotification({
        type: 'success',
        title: 'Password Changed',
        message: 'Your password has been changed successfully.',
      })
    } catch (error) {
      console.error('Failed to change password:', error)
      showNotification({
        type: 'error',
        title: 'Password Change Failed',
        message: error.response?.data?.message || 'Failed to change password. Please try again.',
      })
    } finally {
      setPasswordLoading(false)
    }
  }

  // Terminate session
  const terminateSession = async (sessionId) => {
    try {
      await userAPI.terminateSession(sessionId)
      setSessions(sessions.filter(s => s.id !== sessionId))
      showNotification({
        type: 'success',
        title: 'Session Terminated',
        message: 'Session has been terminated successfully.',
      })
    } catch (error) {
      console.error('Failed to terminate session:', error)
      showNotification({
        type: 'error',
        title: 'Termination Failed',
        message: 'Failed to terminate session. Please try again.',
      })
    }
  }

  // Terminate all sessions
  const terminateAllSessions = async () => {
    try {
      await userAPI.terminateAllSessions(user.id)
      setSessions([])
      showNotification({
        type: 'success',
        title: 'All Sessions Terminated',
        message: 'All sessions have been terminated successfully.',
      })
    } catch (error) {
      console.error('Failed to terminate all sessions:', error)
      showNotification({
        type: 'error',
        title: 'Termination Failed',
        message: 'Failed to terminate all sessions. Please try again.',
      })
    }
  }

  const tabs = [
    { id: 'profile', name: 'Profile', icon: '👤' },
    { id: 'security', name: 'Security', icon: '🔒' },
    { id: 'preferences', name: 'Preferences', icon: '⚙️' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Profile Settings
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage your account settings and preferences.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
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
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                Profile Information
              </h2>
              
              <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      {...registerProfile('full_name', {
                        required: 'Full name is required',
                        minLength: { value: 2, message: 'Name must be at least 2 characters' },
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                    {profileErrors.full_name && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {profileErrors.full_name.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      {...registerProfile('email', {
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address',
                        },
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                    {profileErrors.email && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {profileErrors.email.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      {...registerProfile('phone')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Department
                    </label>
                    <input
                      type="text"
                      {...registerProfile('department')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Position
                    </label>
                    <input
                      type="text"
                      {...registerProfile('position')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {loading && <ButtonSpinner />}
                    <span>Update Profile</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="p-6">
              <div className="space-y-8">
                {/* Change Password */}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                    Change Password
                  </h2>
                  
                  <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Current Password
                      </label>
                      <input
                        type="password"
                        {...registerPassword('current_password', {
                          required: 'Current password is required',
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                      {passwordErrors.current_password && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {passwordErrors.current_password.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        New Password
                      </label>
                      <input
                        type="password"
                        {...registerPassword('new_password', {
                          required: 'New password is required',
                          minLength: { value: 8, message: 'Password must be at least 8 characters' },
                          pattern: {
                            value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
                            message: 'Password must contain uppercase, lowercase, number, and special character',
                          },
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                      {passwordErrors.new_password && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {passwordErrors.new_password.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        {...registerPassword('confirm_password', {
                          required: 'Please confirm your new password',
                          validate: (value) => value === newPassword || 'Passwords do not match',
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      />
                      {passwordErrors.confirm_password && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {passwordErrors.confirm_password.message}
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={passwordLoading}
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                      >
                        {passwordLoading && <ButtonSpinner />}
                        <span>Change Password</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Active Sessions */}
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Active Sessions
                    </h2>
                    <button
                      onClick={terminateAllSessions}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    >
                      Terminate All
                    </button>
                  </div>

                  {sessionsLoading ? (
                    <LoadingSpinner size="sm" message="Loading sessions..." />
                  ) : (
                    <div className="space-y-4">
                      {sessions.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          onTerminate={() => terminateSession(session.id)}
                          isCurrent={session.is_current}
                        />
                      ))}
                      {sessions.length === 0 && (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                          No active sessions found.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                Application Preferences
              </h2>
              
              <div className="space-y-6">
                {/* Theme */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      Theme
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Choose your preferred color scheme
                    </p>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  >
                    {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
                  </button>
                </div>

                {/* Font Size */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      Font Size
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Adjust text size for better readability
                    </p>
                  </div>
                  <select
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                {/* Reduced Motion */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      Reduce Motion
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Minimize animations and transitions
                    </p>
                  </div>
                  <button
                    onClick={toggleReducedMotion}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                      reducedMotion ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        reducedMotion ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Session card component
function SessionCard({ session, onTerminate, isCurrent }) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">
            {session.device || 'Unknown Device'}
          </h4>
          {isCurrent && (
            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full">
              Current
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {session.ip_address} • {session.location || 'Unknown Location'}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Last active: {new Date(session.last_activity).toLocaleString()}
        </p>
      </div>
      {!isCurrent && (
        <button
          onClick={onTerminate}
          className="px-3 py-1 text-sm bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-md hover:bg-red-200 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Terminate
        </button>
      )}
    </div>
  )
}

export default Profile