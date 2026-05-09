import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { NotificationProvider } from './contexts/NotificationContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

// Performance monitoring
if (import.meta.env.DEV) {
  // Development-only performance monitoring
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'navigation') {
        if (process.env.NODE_ENV === 'development') {
          // console.log('Navigation timing:', {
          //   domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
          //   loadComplete: entry.loadEventEnd - entry.loadEventStart,
          //   firstContentfulPaint: entry.firstContentfulPaint,
          // })
        }
      }
    }
  })
  
  observer.observe({ entryTypes: ['navigation', 'paint'] })
}

// Error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  if (process.env.NODE_ENV === 'development') {
    console.error('Unhandled promise rejection:', event.reason)
  }
  // Prevent the default browser behavior
  event.preventDefault()
})

// Error handler for uncaught errors
window.addEventListener('error', (event) => {
  if (process.env.NODE_ENV === 'development') {
    console.error('Uncaught error:', event.error)
  }
})

const BASENAME =
  import.meta.env.BASE_URL ||
  (typeof window !== 'undefined' && window.__APP_BASE__) ||
  '/'
  
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={BASENAME}>
          <ThemeProvider>
            <NotificationProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </NotificationProvider>
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)