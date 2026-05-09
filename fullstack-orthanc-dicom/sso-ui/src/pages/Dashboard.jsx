import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { systemAPI, serviceAPI } from '../services/api'
import LoadingSpinner, { LoadingCard } from '../components/LoadingSpinner'
import { PermissionGate } from '../components/PermissionGate'

function Dashboard() {
  const { user, hasPermission } = useAuth()
  const { showNotification } = useNotification()
  
  const [stats, setStats] = useState(null)
  const [services, setServices] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(true)

  // Load dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true)

        // Load system statistics
        const [statsResponse, servicesResponse] = await Promise.allSettled([
          systemAPI.getStatistics(),
          systemAPI.healthCheck(),
        ])

        if (statsResponse.status === 'fulfilled') {
          setStats(statsResponse.value.data || {})
        }

        if (servicesResponse.status === 'fulfilled') {
          setServices(servicesResponse.value.services || [])
        }

        // Load recent activity if user has permission
        if (hasPermission(['audit.read', 'admin'])) {
          try {
            const auditResponse = await systemAPI.getAuditLogs({ 
              limit: 10, 
              user_id: user.id 
            })
            setRecentActivity(auditResponse.data || [])
          } catch (error) {
            console.error('Failed to load recent activity:', error)
          }
        }

      } catch (error) {
        console.error('Failed to load dashboard data:', error)
        showNotification({
          type: 'error',
          title: 'Dashboard Error',
          message: 'Failed to load dashboard data. Please refresh the page.',
        })
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [hasPermission, user.id, showNotification])

  // Service cards data
  const serviceCards = [
    {
      id: 'mwl',
      name: 'Modality Worklist',
      description: 'Manage DICOM worklist items and scheduling',
      icon: '📋',
      path: '/services/mwl',
      permission: 'mwl.read',
      color: 'bg-blue-500',
    },
    {
      id: 'orthanc',
      name: 'Orthanc DICOM',
      description: 'View and manage DICOM studies and images',
      icon: '🏥',
      path: '/services/orthanc',
      permission: 'orthanc.read',
      color: 'bg-green-500',
    },
    {
      id: 'orders',
      name: 'Order Management',
      description: 'Create and track medical imaging orders',
      icon: '📝',
      path: '/services/orders',
      permission: 'orders.read',
      color: 'bg-purple-500',
    },
    {
      id: 'users',
      name: 'User Management',
      description: 'Manage users, roles, and permissions',
      icon: '👥',
      path: '/users',
      permission: 'users.read',
      color: 'bg-orange-500',
    },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2 animate-pulse" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {Array.from({ length: 4 }, (_, i) => (
              <LoadingCard key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Welcome back, {user?.full_name || user?.username}!
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Here's what's happening with your DICOM services today.
          </p>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Total Users"
              value={stats.total_users || 0}
              icon="👥"
              color="bg-blue-500"
              change={stats.users_change}
            />
            <StatCard
              title="Active Sessions"
              value={stats.active_sessions || 0}
              icon="🔐"
              color="bg-green-500"
              change={stats.sessions_change}
            />
            <StatCard
              title="DICOM Studies"
              value={stats.total_studies || 0}
              icon="🏥"
              color="bg-purple-500"
              change={stats.studies_change}
            />
            <StatCard
              title="Worklist Items"
              value={stats.worklist_items || 0}
              icon="📋"
              color="bg-orange-500"
              change={stats.worklist_change}
            />
          </div>
        )}

        {/* Service Cards */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            Available Services
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {serviceCards.map((service) => (
              <PermissionGate key={service.id} permissions={[service.permission]}>
                <ServiceCard service={service} />
              </PermissionGate>
            ))}
          </div>
        </div>

        {/* System Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Service Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Service Status
            </h3>
            <div className="space-y-3">
              {services.length > 0 ? (
                services.map((service, index) => (
                  <ServiceStatus key={index} service={service} />
                ))
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500 dark:text-gray-400">
                    No service status available
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <PermissionGate permissions={['audit.read']}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Recent Activity
              </h3>
              <div className="space-y-3">
                {recentActivity.length > 0 ? (
                  recentActivity.map((activity, index) => (
                    <ActivityItem key={index} activity={activity} />
                  ))
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-500 dark:text-gray-400">
                      No recent activity
                    </p>
                  </div>
                )}
              </div>
            </div>
          </PermissionGate>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <PermissionGate permissions={['mwl.create']}>
              <QuickActionButton
                title="Add Worklist Item"
                description="Create new DICOM worklist entry"
                icon="➕"
                to="/services/mwl/create"
              />
            </PermissionGate>
            
            <PermissionGate permissions={['orders.create']}>
              <QuickActionButton
                title="New Order"
                description="Create medical imaging order"
                icon="📝"
                to="/services/orders/create"
              />
            </PermissionGate>
            
            <PermissionGate permissions={['users.create']}>
              <QuickActionButton
                title="Add User"
                description="Create new user account"
                icon="👤"
                to="/users/create"
              />
            </PermissionGate>
            
            <QuickActionButton
              title="View Profile"
              description="Update your profile settings"
              icon="⚙️"
              to="/profile"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Statistics card component
function StatCard({ title, value, icon, color, change }) {
  const isPositive = change && change > 0
  const isNegative = change && change < 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center">
        <div className={`${color} rounded-lg p-3 text-white text-2xl mr-4`}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {value.toLocaleString()}
          </p>
          {change !== undefined && (
            <p className={`text-sm ${
              isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-500'
            }`}>
              {isPositive && '+'}
              {change}% from last month
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// Service card component
function ServiceCard({ service }) {
  return (
    <Link
      to={service.path}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow group"
    >
      <div className="flex items-center mb-4">
        <div className={`${service.color} rounded-lg p-3 text-white text-2xl mr-4 group-hover:scale-110 transition-transform`}>
          {service.icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            {service.name}
          </h3>
        </div>
      </div>
      <p className="text-gray-600 dark:text-gray-400 text-sm">
        {service.description}
      </p>
    </Link>
  )
}

// Service status component
function ServiceStatus({ service }) {
  const statusColor = service.status === 'healthy' ? 'bg-green-500' : 
                     service.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center">
        <div className={`w-3 h-3 rounded-full ${statusColor} mr-3`} />
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {service.name}
        </span>
      </div>
      <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">
        {service.status}
      </span>
    </div>
  )
}

// Activity item component
function ActivityItem({ activity }) {
  return (
    <div className="flex items-start space-x-3 py-2">
      <div className="flex-shrink-0 w-2 h-2 bg-primary-500 rounded-full mt-2" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-white">
          {activity.action}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(activity.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  )
}

// Quick action button component
function QuickActionButton({ title, description, icon, to }) {
  return (
    <Link
      to={to}
      className="block p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors group"
    >
      <div className="flex items-center mb-2">
        <span className="text-xl mr-2 group-hover:scale-110 transition-transform">
          {icon}
        </span>
        <h4 className="text-sm font-medium text-gray-900 dark:text-white">
          {title}
        </h4>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {description}
      </p>
    </Link>
  )
}

export default Dashboard