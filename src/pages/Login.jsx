import { useState } from 'react'
import { clearOnLogin } from '../services/storageManager'
import { useNavigate, useLocation } from 'react-router-dom'
import { safeRedirect } from '../utils/safeRedirect'
import { performLogin, initializeAuthAfterLogin, clearAuthBeforeLogin } from '../services/loginService'
import { logger } from '../utils/logger'
import { useTheme } from '../hooks/useTheme'
import { getDefaultTheme } from '../config/themes'
import { User, Lock, Loader2, ArrowRight, ShieldCheck } from 'lucide-react'
import { Turnstile } from '@marsidev/react-turnstile'

// Application name from environment variables
const APP_NAME = import.meta.env.VITE_APP_NAME || 'MWL / mini-PACS'
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA' // Dummy default

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focusedInput, setFocusedInput] = useState(null)

  const nav = useNavigate()
  const location = useLocation()

  let currentTheme
  let LoginIcon

  try {
    const themeContext = useTheme()
    currentTheme = themeContext.currentTheme
  } catch {
    currentTheme = getDefaultTheme()
  }

  LoginIcon = currentTheme?.loginIcon || ShieldCheck

  const submit = async (e) => {
    e.preventDefault()
    
    if (!turnstileToken) {
      setError('Please complete the security check')
      return
    }

    setLoading(true)
    setError('')

    const from = location.state?.from || '/dashboard'

    try {
      await clearAuthBeforeLogin()

      if (!username.trim() || !password.trim()) {
        throw new Error('Username and password are required')
      }

      logger.info('[Login] Attempting login with Turnstile protection...')
      
      // We pass the token via header in the loginService/httpClient
      // but for simplicity here we might need to modify the service to accept extra headers
      const loginResponse = await performLogin(username, password, {
        headers: { 'X-Turnstile-Token': turnstileToken }
      })
      
      logger.info('[Login] Login successful')
      await initializeAuthAfterLogin(loginResponse)
      try { clearOnLogin() } catch { }
      safeRedirect(from, '/dashboard')
    } catch (err) {
      logger.error('Login failed:', err)
      setError(err.response?.data?.error?.message || err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const colors = currentTheme?.colors || getDefaultTheme().colors
  const loginColors = colors.login
  const buttonColors = colors.button

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 overflow-hidden relative" style={{ background: loginColors.bgGradientFrom }}>
      <div className="absolute inset-0 bg-white/10 pointer-events-none" />

      <div className="w-full max-w-[420px] bg-white rounded-xl border p-8 md:p-10 relative z-10" style={{ backgroundColor: loginColors.cardBg, borderColor: `${colors.primary}22` }}>
        <div className="flex flex-col items-center space-y-6 mb-8">
          <div className="p-4 rounded-lg" style={{ backgroundColor: `${colors.primary}08`, border: `1px solid ${colors.primary}22` }}>
            <LoginIcon size={48} style={{ color: colors.primary }} />
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#111827' }}>Imagestro</h1>
            <p className="text-slate-500 font-medium flex items-center justify-center gap-1.5 flex-wrap">
              <span className="text-sm">By</span>
              <span className="text-sm font-bold whitespace-nowrap" style={{ color: colors.primary }}>PT. Satu Pintu Digital</span>
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
              ⚠️ {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="group space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1" htmlFor="username">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User size={18} className={focusedInput === 'username' ? 'text-blue-600' : 'text-slate-400'} style={focusedInput === 'username' ? { color: colors.primary } : {}} />
                </div>
                <input
                  id="username"
                  className="block w-full pl-11 pr-4 py-3 bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200 sm:text-sm"
                  style={{ borderColor: focusedInput === 'username' ? colors.primary : '#e2e8f0' }}
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); if (error) setError(''); }}
                  onFocus={() => setFocusedInput('username')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Enter your username"
                  disabled={loading}
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="group space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1" htmlFor="password">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={18} className={focusedInput === 'password' ? 'text-blue-600' : 'text-slate-400'} style={focusedInput === 'password' ? { color: colors.primary } : {}} />
                </div>
                <input
                  id="password"
                  type="password"
                  className="block w-full pl-11 pr-4 py-3 bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200 sm:text-sm"
                  style={{ borderColor: focusedInput === 'password' ? colors.primary : '#e2e8f0' }}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                  onFocus={() => setFocusedInput('password')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Enter your password"
                  disabled={loading}
                  required
                />
              </div>
            </div>
          </div>

          {/* Turnstile Widget */}
          <div className="flex justify-center py-2">
            <Turnstile
              siteKey={TURNSTILE_SITE_KEY}
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setError('Security check failed to load')}
              onExpire={() => setTurnstileToken('')}
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="group relative w-full flex justify-center py-3 px-4 border rounded-lg text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200"
              style={{ backgroundColor: buttonColors.primary }}
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <span className="flex items-center">Sign In <ArrowRight className="ml-2 h-4 w-4" /></span>}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </div>
      </div>
    </div>
  )
}
