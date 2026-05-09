import React from 'react'
import { createRoot } from 'react-dom/client'

// Monitoring & Error Tracking Setup
window.addEventListener('error', (event) => {
  console.error('[Frontend Error]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Frontend Promise Rejection]', event.reason);
});

import './i18n'
import './styles/index.css'
import './bones/registry'

/**
 * Conditional App Loading Strategy
 *
 * This implements a security-focused routing strategy where:
 * - Login page loads MINIMAL LoginApp (no services, no api-registry)
 * - Authenticated pages load FULL App (with all services)
 *
 * This ensures login page bundle is minimal and doesn't expose sensitive data.
 */

const root = createRoot(document.getElementById('root'))

// Determine current path
const currentPath = window.location.pathname

// Check if user is on login page or root
const isLoginPage = currentPath === '/login' || currentPath === '/'

console.log('[AppInit] Current path:', currentPath)
console.log('[AppInit] Loading:', isLoginPage ? 'LoginApp (minimal)' : 'App (full)')

if (isLoginPage) {
  // ============================================================================
  // LOGIN MODE: Load MINIMAL application
  // ============================================================================
  import('./LoginApp.jsx').then(({ default: LoginApp }) => {
    root.render(
      <React.StrictMode>
        <LoginApp />
      </React.StrictMode>
    )
  }).catch((error) => {
    console.error('[AppInit] Failed to load LoginApp:', error)
    root.render(
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>Error Loading Application</h1>
        <p>Failed to load login page. Please refresh.</p>
      </div>
    )
  })

} else {
  // ============================================================================
  // AUTHENTICATED MODE: Load FULL application
  // ============================================================================
  Promise.all([
    import('./App.jsx'),
    import('./hooks/useServiceMode.jsx'),
    import('./components/ToastProvider'),
    import('./components/ConfirmDialog'),
    import('./contexts/TenantContext')
  ]).then(([
    { default: App },
    { ServiceModeProvider, ServiceModeIndicator },
    { default: ToastProvider },
    { ConfirmProvider },
    { TenantProvider }
  ]) => {
    // Import BrowserRouter
    import('react-router-dom').then(({ BrowserRouter }) => {
      root.render(
        <React.StrictMode>
          <ServiceModeProvider>
            <TenantProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <BrowserRouter
                    future={{
                      v7_startTransition: true,
                      v7_relativeSplatPath: true
                    }}
                  >
                    <App />
                    <ServiceModeIndicator />
                  </BrowserRouter>
                </ConfirmProvider>
              </ToastProvider>
            </TenantProvider>
          </ServiceModeProvider>
        </React.StrictMode>
      )

      // Defer non-critical initialization
      setTimeout(() => {
        // Initialize global fetch interceptor
        import('./services/fetch-interceptor').then(({ initializeFetchInterceptor }) => {
          initializeFetchInterceptor();
        }).catch(() => { });

        // Revalidate caches
        import('./services/storageManager').then(({ ensureCacheVersion }) => {
          ensureCacheVersion();
        }).catch(() => { });

        // Import config utilities
        import('./utils/forceConfigReset').catch(() => { });

        // Initialize CSRF protection
        import('./utils/csrf').then(({ initCSRFProtection }) => {
          initCSRFProtection();
        }).catch(() => { });

        // Initialize development cache management
        import('./utils/cacheManager').then(({ initDevelopmentCacheManagement }) => {
          initDevelopmentCacheManagement();
        }).catch((error) => {
          console.error('[AppInit] Failed to initialize cache management:', error);
        });

        // Server monitoring is handled by inline script in index.html
        console.log('[AppInit] Server monitoring handled by inline script');
      }, 1000);
    })
  }).catch((error) => {
    console.error('[AppInit] Failed to load App:', error)
    root.render(
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>Error Loading Application</h1>
        <p>Failed to load application. Please refresh or contact support.</p>
      </div>
    )
  })
}
