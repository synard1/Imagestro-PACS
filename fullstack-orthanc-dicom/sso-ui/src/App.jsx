import React, { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useTheme } from './contexts/ThemeContext'
import LoadingSpinner from './components/LoadingSpinner'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

// Lazy load components for better performance
const LoginPage = React.lazy(() => import('./pages/Login'))
const DashboardPage = React.lazy(() => import('./pages/Dashboard'))
const ProfilePage = React.lazy(() => import('./pages/Profile'))
const UsersPage = React.lazy(() => import('./pages/Users'))
const SettingsPage = React.lazy(() => import('./pages/Settings'))

// Service integration pages
const MWLPage = React.lazy(() => import('./pages/services/MWL'))
const OrthancPage = React.lazy(() => import('./pages/services/Orthanc'))
const OrdersPage = React.lazy(() => import('./pages/services/Orders'))

// Error pages
const UnauthorizedPage = React.lazy(() => import('./pages/Unauthorized'))
const NotFoundPage = React.lazy(() => import('./pages/NotFound'))

function App() {
  const { isAuthenticated, isLoading } = useAuth()
  const { theme } = useTheme()

  // Apply theme to document
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-primary">
        <div className="text-center">
          <LoadingSpinner size="lg" className="text-white" />
          <p className="mt-4 text-white text-lg font-medium">
            Initializing SSO...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary-50">
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center">
            <LoadingSpinner size="lg" />
          </div>
        }
      >
        <Routes>
          {/* Public routes */}
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <LoginPage />
              )
            }
          />
          
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Default redirect to dashboard */}
            <Route index element={<Navigate to="/dashboard" replace />} />
            
            {/* Main application routes */}
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            
            {/* Admin routes */}
            <Route
              path="users"
              element={
                <ProtectedRoute requiredPermissions={['*']}>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
            
            {/* Service integration routes */}
            <Route
              path="services/mwl"
              element={
                <ProtectedRoute requiredPermissions={['worklist:read', '*']}>
                  <MWLPage />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="services/orthanc"
              element={
                <ProtectedRoute requiredPermissions={['orthanc:read', '*']}>
                  <OrthancPage />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="services/orders"
              element={
                <ProtectedRoute requiredPermissions={['order:read', '*']}>
                  <OrdersPage />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Catch all route */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default App