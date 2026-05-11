import { useState } from 'react'
import { clearOnLogin } from '../services/storageManager'
import { useNavigate, useLocation } from 'react-router-dom'
import { safeRedirect } from '../utils/safeRedirect'
import { performLogin, initializeAuthAfterLogin, clearAuthBeforeLogin } from '../services/loginService'
import { logger } from '../utils/logger'
import { useTheme } from '../hooks/useTheme'
import { getDefaultTheme } from '../config/themes'
import { User, Lock, Loader2, ArrowRight, ShieldCheck } from 'lucide-react'

// Application name from environment variables
const APP_NAME = import.meta.env.VITE_APP_NAME || 'MWL / mini-PACS'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focusedInput, setFocusedInput] = useState(null)

  const nav = useNavigate()
  const location = useLocation()

  // Get theme from context, fallback to default theme if context not available
  let currentTheme
  let LoginIcon

  try {
    const themeContext = useTheme()
    currentTheme = themeContext.currentTheme
  } catch {
    // If ThemeProvider is not available, use default theme (Requirement 4.4)
    currentTheme = getDefaultTheme()
  }

  // Get the login icon from current theme
  LoginIcon = currentTheme?.loginIcon || ShieldCheck

  // Auth configuration is now handled by minimalAuthConfig
  // No need to load full api-registry on login page

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const from = location.state?.from || '/dashboard'

    try {
      // Clear any existing auth state before login
      await clearAuthBeforeLogin()

      // Validate inputs
      if (!username.trim()) {
        throw new Error('Username is required')
      }

      if (!password.trim()) {
        throw new Error('Password is required')
      }

      // Validate username format (basic check)
      if (username.length < 3) {
        throw new Error('Username must be at least 3 characters')
      }

      // Perform login (minimal service, no sensitive logic exposed)
      logger.info('[Login] Attempting login...')
      const loginResponse = await performLogin(username, password)
      logger.info('[Login] Login successful, initializing auth services...')

      // Initialize full auth services after successful login
      await initializeAuthAfterLogin(loginResponse)
      logger.info('[Login] Auth services initialized')

      // Clear storage and navigate
      try { clearOnLogin() } catch { }

      // Force full page reload to load authenticated App.
      // Validate redirect target is same-origin to prevent open redirect.
      safeRedirect(from, '/dashboard')
    } catch (err) {
      logger.error('Login failed:', err)
      let errorMessage = err.message || 'Login failed'
      // Parse detailed error if available
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Clear error when user starts typing
  const handleUsernameChange = (e) => {
    setUsername(e.target.value)
    if (error) setError('')
  }

  const handlePasswordChange = (e) => {
    setPassword(e.target.value)
    if (error) setError('')
  }

  // Get theme colors
  const colors = currentTheme?.colors || getDefaultTheme().colors
  const loginColors = colors.login
  const buttonColors = colors.button

  // Dynamic styles based on theme
  const backgroundStyle = {
    background: loginColors.bgGradientFrom
  }
  const surfaceStyle = {
    backgroundColor: loginColors.cardBg,
    borderColor: `${colors.primary}22`
  }
  const focusRingStyle = {
    '--tw-ring-color': colors.accentLight
  }
  const subtleBorderStyle = {
    borderColor: `${colors.primary}33`
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 overflow-hidden relative"
      style={backgroundStyle}
      data-testid="login-container"
    >
      <div className="absolute inset-0 bg-white/10 pointer-events-none" />

      {/* Main Card */}
      <div
        className="w-full max-w-[420px] bg-white rounded-xl border p-8 md:p-10 relative z-10"
        style={surfaceStyle}
        data-testid="login-form-card"
      >
        <div className="flex flex-col items-center space-y-6 mb-8">
          {/* Logo / Icon Area */}
          <div
            className="p-4 rounded-lg"
            style={{
              backgroundColor: `${colors.primary}08`,
              border: `1px solid ${colors.primary}22`
            }}
            data-testid="login-icon"
          >
            <LoginIcon
              size={48}
              style={{ color: colors.primary }}
              data-testid="theme-login-icon"
            />
          </div>

          <div className="text-center space-y-1">
            <h1
              className="text-3xl font-bold tracking-tight"
              style={{ color: '#111827' }}
            >
              Imagestro
            </h1>
            <p className="text-slate-500 font-medium flex items-center justify-center gap-1.5 flex-wrap">
              <span className="text-sm">By</span>
              <span className="text-sm font-bold whitespace-nowrap" style={{ color: colors.primary }}>
                PT. Satu Pintu Digital
              </span>
            </p>
            <p className="text-slate-400 text-xs mt-2 pt-2">
              Sign in to your account
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-6" data-testid="login-form">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3 text-sm">
              <div className="text-red-500 mt-0.5">⚠️</div>
              <div className="text-red-700 font-medium">{error}</div>
            </div>
          )}

          <div className="space-y-4">
            <div className="group space-y-1.5">
              <label
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1"
                htmlFor="username"
              >
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User
                    size={18}
                    className={`transition-colors duration-300 ${focusedInput === 'username' ? 'text-blue-600' : 'text-slate-400'}`}
                    style={focusedInput === 'username' ? { color: colors.primary } : {}}
                  />
                </div>
                <input
                  id="username"
                  className="block w-full pl-11 pr-4 py-3 bg-white border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200 font-medium sm:text-sm"
                  style={{
                    ...focusRingStyle,
                    borderColor: focusedInput === 'username' ? colors.primary : '#e2e8f0',
                  }}
                  value={username}
                  onChange={handleUsernameChange}
                  onFocus={() => setFocusedInput('username')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Enter your username"
                  disabled={loading}
                  autoFocus
                  required
                  data-testid="username-input"
                />
              </div>
            </div>

            <div className="group space-y-1.5">
              <label
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock
                    size={18}
                    className={`transition-colors duration-300 ${focusedInput === 'password' ? 'text-blue-600' : 'text-slate-400'}`}
                    style={focusedInput === 'password' ? { color: colors.primary } : {}}
                  />
                </div>
                <input
                  id="password"
                  type="password"
                  className="block w-full pl-11 pr-4 py-3 bg-white border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200 font-medium sm:text-sm"
                  style={{
                    ...focusRingStyle,
                    borderColor: focusedInput === 'password' ? colors.primary : '#e2e8f0',
                  }}
                  value={password}
                  onChange={handlePasswordChange}
                  onFocus={() => setFocusedInput('password')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Enter your password"
                  disabled={loading}
                  required
                  data-testid="password-input"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="group relative w-full flex justify-center py-3 px-4 border rounded-lg text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
              style={{
                ...subtleBorderStyle,
                ...focusRingStyle,
                backgroundColor: buttonColors.primary
              }}
              disabled={loading}
              data-testid="login-button"
            >
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                <span className="flex items-center">
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </span>
              )}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
