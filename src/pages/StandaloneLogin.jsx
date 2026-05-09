/**
 * Standalone Login Page - ULTRA MINIMAL
 * 
 * This is a completely self-contained login page with:
 * - NO external service dependencies
 * - NO theme system
 * - NO storage manager
 * - NO logger
 * - Inline styles only
 * - Direct fetch API calls
 * 
 * Everything needed for login is contained in this single file.
 */

import { useState } from 'react'
import { User, Lock, Loader2, ArrowRight, ShieldCheck } from 'lucide-react'

// Inline minimal auth functions (no external dependencies)
async function performMinimalLogin(username, password) {
    const response = await fetch('/backend-api/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP ${response.status}`)
    }

    return await response.json()
}

async function saveAuthAndInitialize(loginResponse) {
    const expiresAt = Date.now() + ((+loginResponse.expires_in || 0) * 1000)

    // Save auth to localStorage
    const authData = {
        access_token: loginResponse.access_token,
        refresh_token: loginResponse.refresh_token,
        token_type: loginResponse.token_type || 'Bearer',
        expires_in: +loginResponse.expires_in || 0,
        expires_at: expiresAt,
        username: loginResponse.user?.username || '',
        email: loginResponse.user?.email || '',
        role: loginResponse.user?.role || '',
        full_name: loginResponse.user?.full_name || '',
        user_id: loginResponse.user?.id || ''
    }

    localStorage.setItem('auth.session.v1', JSON.stringify(authData))

    // Save user to localStorage
    const userData = loginResponse.user || {}
    const normalizedUser = {
        ...userData,
        id: userData.id || userData.user_id || null,
        name: userData.name || userData.username || userData.full_name || "User",
        username: userData.username || userData.name || null,
        email: userData.email || null,
        role: userData.role || "user",
        permissions: Array.isArray(userData.permissions) ? userData.permissions : [],
    }

    localStorage.setItem('app.currentUser', JSON.stringify(normalizedUser))
}

export default function StandaloneLogin() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [focusedInput, setFocusedInput] = useState(null)

    const submit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            // Basic validation
            if (!username.trim()) {
                throw new Error('Username is required')
            }
            if (!password.trim()) {
                throw new Error('Password is required')
            }
            if (username.length < 3) {
                throw new Error('Username must be at least 3 characters')
            }

            // Perform login
            const loginResponse = await performMinimalLogin(username, password)

            // Save auth and user data
            await saveAuthAndInitialize(loginResponse)

            // Redirect to dashboard with full reload
            window.location.href = '/dashboard'

        } catch (err) {
            console.error('Login failed:', err)
            let errorMessage = err.message || 'Login failed'

            // Parse error response
            try {
                const parsed = JSON.parse(errorMessage)
                errorMessage = parsed.message || parsed.detail || errorMessage
            } catch {
                // Keep original message
            }

            setError(errorMessage)
        } finally {
            setLoading(false)
        }
    }

    const handleUsernameChange = (e) => {
        setUsername(e.target.value)
        if (error) setError('')
    }

    const handlePasswordChange = (e) => {
        setPassword(e.target.value)
        if (error) setError('')
    }

    // Inline theme colors (no external theme system)
    const colors = {
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        bgGradientFrom: '#1e3a8a',
        bgGradientTo: '#3b82f6',
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                overflow: 'hidden',
                position: 'relative',
                background: `linear-gradient(135deg, ${colors.bgGradientFrom} 0%, ${colors.bgGradientTo} 100%)`,
                backgroundSize: '400% 400%',
                animation: 'gradient 15s ease infinite',
            }}
        >
            <style>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

            {/* Background overlay */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.2,
                    backgroundImage: `radial-gradient(circle at 25% 25%, white 0%, transparent 50%), radial-gradient(circle at 75% 75%, white 0%, transparent 50%)`,
                    animation: 'gradient 15s ease infinite',
                }}
            />

            {/* Main Card */}
            <div
                style={{
                    width: '100%',
                    maxWidth: '420px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(40px)',
                    borderRadius: '1rem',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    padding: '2.5rem',
                    position: 'relative',
                    zIndex: 10,
                    animation: 'fadeInUp 0.6s ease-out',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                    {/* Logo */}
                    <div
                        style={{
                            padding: '1.25rem',
                            borderRadius: '1rem',
                            boxShadow: `0 10px 25px -5px ${colors.primary}40`,
                            backgroundColor: 'white',
                        }}
                    >
                        <ShieldCheck size={48} color={colors.primary} />
                    </div>

                    <div style={{ textAlign: 'center' }}>
                        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.25rem' }}>
                            Imagestro
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                            <span>By</span>
                            <span style={{ fontWeight: 'bold', color: colors.primary }}>PT. Satu Pintu Digital</span>
                        </p>
                        <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                            Sign in to your account
                        </p>
                    </div>
                </div>

                <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {error && (
                        <div style={{
                            padding: '1rem',
                            background: '#fef2f2',
                            borderLeft: '4px solid #ef4444',
                            borderRadius: '0 0.5rem 0.5rem 0',
                            display: 'flex',
                            alignItems: 'start',
                            gap: '0.75rem',
                            fontSize: '0.875rem',
                            animation: 'fadeInUp 0.3s ease-out',
                        }}>
                            <div style={{ color: '#ef4444', marginTop: '0.125rem' }}>⚠️</div>
                            <div style={{ color: '#991b1b', fontWeight: 500 }}>{error}</div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Username */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                            <label
                                htmlFor="username"
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: '#64748b',
                                    marginLeft: '0.25rem',
                                }}
                            >
                                Username
                            </label>
                            <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', inset: '0 auto 0 0', paddingLeft: '1rem', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                                    <User size={18} color={focusedInput === 'username' ? colors.primary : '#94a3b8'} />
                                </div>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={handleUsernameChange}
                                    onFocus={() => setFocusedInput('username')}
                                    onBlur={() => setFocusedInput(null)}
                                    disabled={loading}
                                    autoFocus
                                    required
                                    placeholder="Enter your username"
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        paddingLeft: '2.75rem',
                                        paddingRight: '1rem',
                                        paddingTop: '0.875rem',
                                        paddingBottom: '0.875rem',
                                        background: '#f8fafc',
                                        border: `1px solid ${focusedInput === 'username' ? colors.primary : '#e2e8f0'}`,
                                        borderRadius: '0.75rem',
                                        color: '#0f172a',
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        outline: 'none',
                                        transition: 'all 0.2s',
                                    }}
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                            <label
                                htmlFor="password"
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: '#64748b',
                                    marginLeft: '0.25rem',
                                }}
                            >
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', inset: '0 auto 0 0', paddingLeft: '1rem', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                                    <Lock size={18} color={focusedInput === 'password' ? colors.primary : '#94a3b8'} />
                                </div>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={handlePasswordChange}
                                    onFocus={() => setFocusedInput('password')}
                                    onBlur={() => setFocusedInput(null)}
                                    disabled={loading}
                                    required
                                    placeholder="Enter your password"
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        paddingLeft: '2.75rem',
                                        paddingRight: '1rem',
                                        paddingTop: '0.875rem',
                                        paddingBottom: '0.875rem',
                                        background: '#f8fafc',
                                        border: `1px solid ${focusedInput === 'password' ? colors.primary : '#e2e8f0'}`,
                                        borderRadius: '0.75rem',
                                        color: '#0f172a',
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        outline: 'none',
                                        transition: 'all 0.2s',
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ paddingTop: '0.5rem' }}>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                position: 'relative',
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                padding: '0.875rem 1rem',
                                border: 'none',
                                borderRadius: '0.75rem',
                                fontSize: '0.875rem',
                                fontWeight: 'bold',
                                color: 'white',
                                backgroundColor: loading ? '#94a3b8' : colors.primary,
                                boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.4)',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.3s',
                                transform: 'scale(1)',
                            }}
                            onMouseEnter={(e) => {
                                if (!loading) e.currentTarget.style.backgroundColor = colors.primaryHover
                            }}
                            onMouseLeave={(e) => {
                                if (!loading) e.currentTarget.style.backgroundColor = colors.primary
                            }}
                            onMouseDown={(e) => {
                                if (!loading) e.currentTarget.style.transform = 'scale(0.98)'
                            }}
                            onMouseUp={(e) => {
                                if (!loading) e.currentTarget.style.transform = 'scale(1)'
                            }}
                        >
                            {loading ? (
                                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            ) : (
                                <span style={{ display: 'flex', alignItems: 'center' }}>
                                    Sign In
                                    <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
                                </span>
                            )}
                        </button>
                    </div>
                </form>

                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        © {new Date().getFullYear()} MWL / mini-PACS. All rights reserved.
                    </p>
                </div>
            </div>

            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    )
}
