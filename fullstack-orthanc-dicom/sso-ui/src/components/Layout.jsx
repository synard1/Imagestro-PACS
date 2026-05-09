import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useNotification } from '../contexts/NotificationContext'
import { PermissionGate } from './PermissionGate'
import NotificationContainer from './NotificationContainer'

function Layout({ children }) {
  const { user, logout, hasPermission } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { notifications } = useNotification()
  const location = useLocation()
  const navigate = useNavigate()
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuOpen && !event.target.closest('.user-menu')) {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  // Navigation items
  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: '🏠',
      current: location.pathname === '/dashboard' || location.pathname === '/',
      // Dashboard should always be visible for authenticated users
      alwaysVisible: true,
    },
    {
      name: 'Services',
      icon: '🔧',
      children: [
        {
          name: 'Modality Worklist',
          href: '/services/mwl',
          icon: '📋',
          permission: ['mwl.read', 'worklist:read', '*'],
          current: location.pathname.startsWith('/services/mwl'),
        },
        {
          name: 'Orthanc DICOM',
          href: '/services/orthanc',
          icon: '🏥',
          permission: ['orthanc.read', 'orthanc:read', '*'],
          current: location.pathname.startsWith('/services/orthanc'),
        },
        {
          name: 'Order Management',
          href: '/services/orders',
          icon: '📝',
          permission: ['orders.read', 'order:read', '*'],
          current: location.pathname.startsWith('/services/orders'),
        },
      ],
    },
    {
      name: 'User Management',
      href: '/users',
      icon: '👥',
      permission: ['users.read', 'user:read', '*'],
      current: location.pathname.startsWith('/users'),
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: '⚙️',
      permission: ['settings.read', 'setting:read', '*'],
      current: location.pathname.startsWith('/settings'),
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold">
                S
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                SSO Portal
              </span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ✕
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
            {navigationItems.map((item) => (
              <NavigationItem
                key={item.name}
                item={item}
                hasPermission={hasPermission}
              />
            ))}
          </nav>

          {/* User info */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                {user?.full_name?.charAt(0) || user?.username?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user?.full_name || user?.username}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ☰
            </button>

            {/* Breadcrumb */}
            <div className="flex-1 lg:flex lg:items-center">
              <Breadcrumb />
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-4">
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>

              {/* Notifications */}
              <div className="relative">
                {notifications.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
                )}
                <button className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                  🔔
                </button>
              </div>

              {/* User menu */}
              <div className="relative user-menu">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                    {user?.full_name?.charAt(0) || user?.username?.charAt(0) || '?'}
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-gray-900 dark:text-white">
                    {user?.full_name || user?.username}
                  </span>
                  <span className="text-xs">▼</span>
                </button>

                {/* User dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <Link
                      to="/profile"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      👤 Profile
                    </Link>
                    <Link
                      to="/settings"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      ⚙️ Settings
                    </Link>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      🚪 Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>

      {/* Notification container */}
      <NotificationContainer />
    </div>
  )
}

// Navigation item component
function NavigationItem({ item, hasPermission }) {
  const [expanded, setExpanded] = useState(false)

  // Check if user has permission for this item
  if (!item.alwaysVisible && item.permission) {
    const permissions = Array.isArray(item.permission) ? item.permission : [item.permission]
    if (!hasPermission(permissions)) {
      return null
    }
  }

  // If item has children, render as expandable
  if (item.children) {
    const hasVisibleChildren = item.children.some(child => {
      if (child.alwaysVisible) return true
      if (!child.permission) return true
      const permissions = Array.isArray(child.permission) ? child.permission : [child.permission]
      return hasPermission(permissions)
    })

    if (!hasVisibleChildren) {
      return null
    }

    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            item.current || item.children.some(child => child.current)
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <div className="flex items-center space-x-3">
            <span>{item.icon}</span>
            <span>{item.name}</span>
          </div>
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        </button>
        
        {expanded && (
          <div className="ml-6 mt-1 space-y-1">
            {item.children.map((child) => {
              // Handle permission checking for children
              if (!child.alwaysVisible && child.permission) {
                const permissions = Array.isArray(child.permission) ? child.permission : [child.permission]
                if (!hasPermission(permissions)) {
                  return null
                }
              }
              
              return (
                <Link
                  key={child.name}
                  to={child.href}
                  className={`flex items-center space-x-3 px-3 py-2 text-sm rounded-md transition-colors ${
                    child.current
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span>{child.icon}</span>
                  <span>{child.name}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Regular navigation item
  return (
    <Link
      to={item.href}
      className={`flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
        item.current
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <span>{item.icon}</span>
      <span>{item.name}</span>
    </Link>
  )
}

// Breadcrumb component
function Breadcrumb() {
  const location = useLocation()
  
  const getBreadcrumbs = () => {
    const pathnames = location.pathname.split('/').filter(x => x)
    const breadcrumbs = [{ name: 'Home', href: '/' }]
    
    let currentPath = ''
    pathnames.forEach((pathname, index) => {
      currentPath += `/${pathname}`
      
      // Convert pathname to readable name
      let name = pathname.charAt(0).toUpperCase() + pathname.slice(1)
      name = name.replace(/-/g, ' ')
      
      // Special cases
      if (pathname === 'mwl') name = 'Modality Worklist'
      if (pathname === 'orthanc') name = 'Orthanc DICOM'
      if (pathname === 'sso') name = 'SSO'
      
      breadcrumbs.push({
        name,
        href: currentPath,
        current: index === pathnames.length - 1,
      })
    })
    
    return breadcrumbs
  }

  const breadcrumbs = getBreadcrumbs()

  if (breadcrumbs.length <= 1) {
    return null
  }

  return (
    <nav className="flex" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        {breadcrumbs.map((breadcrumb, index) => (
          <li key={breadcrumb.href} className="flex items-center">
            {index > 0 && (
              <span className="mx-2 text-gray-400 dark:text-gray-500">
                /
              </span>
            )}
            {breadcrumb.current ? (
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {breadcrumb.name}
              </span>
            ) : (
              <Link
                to={breadcrumb.href}
                className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                {breadcrumb.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export default Layout