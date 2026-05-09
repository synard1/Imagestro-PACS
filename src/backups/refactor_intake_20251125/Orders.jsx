import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getConfig } from '../services/config'
import { getDataStorageConfig } from '../services/dataSync'
import { getAuthHeader } from '../services/auth-storage'
import orderService from '../services/orderService'
import LoadingScreen from '../components/LoadingScreen'
import { useToast } from '../components/ToastProvider'

// Import tab view components
import AllOrdersView from './orders/AllOrdersView'
import IntakeQueueView from './orders/IntakeQueueView'
import CompletedOrdersView from './orders/CompletedOrdersView'

const getOrdersAuthHeaders = () => {
  const stored = getAuthHeader() || {}
  if (stored.Authorization) {
    return stored
  }

  const fallbackToken = import.meta.env?.VITE_ORDERS_API_TOKEN
  if (fallbackToken) {
    return { Authorization: `Bearer ${fallbackToken}` }
  }

  return {}
}

// Storage indicator component
const StorageIndicator = ({ storageType, className = "" }) => {
  const storageInfo = {
    browser: {
      text: 'Browser Storage',
      icon: '💾',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      description: 'Data stored locally in browser localStorage'
    },
    server: {
      text: 'Server Storage',
      icon: '📡',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      description: 'Data stored on remote server with synchronization'
    },
    external: {
      text: 'External API',
      icon: '☁️',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      description: 'Data retrieved from external backend API'
    }
  };

  const info = storageInfo[storageType] || storageInfo.browser;

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${info.bgColor} ${info.color} ${className}`} title={info.description}>
      <span className="mr-1">{info.icon}</span>
      {info.text}
    </div>
  );
};

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') || 'all'
  const [activeTab, setActiveTab] = useState(tabFromUrl)
  const [syncingOrders, setSyncingOrders] = useState([])
  const [appConfig, setAppConfig] = useState(null)
  const toast = useToast()
  const OFFLINE_KEY = 'orders_offline'
  const storageConfig = getDataStorageConfig()

  // Load config
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getConfig()
      setAppConfig(config)
    }
    loadConfig()
  }, [])

  // Keep active tab in sync with URL (e.g., when navigating via sidebar)
  useEffect(() => {
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl, activeTab])

  const handleTabChange = (tabKey) => {
    if (tabKey === activeTab) return
    setActiveTab(tabKey)
    setSearchParams({ tab: tabKey })
  }

  // Tab configuration
  const tabs = [
    {
      key: 'all',
      label: 'All Orders',
      icon: '📋',
      description: 'View all orders regardless of status'
    },
    {
      key: 'intake',
      label: 'Intake Queue',
      icon: '🏥',
      description: 'Orders pending scheduling or check-in'
    },
    {
      key: 'completed',
      label: 'Completed',
      icon: '✅',
      description: 'Completed, reported, and delivered orders'
    }
  ]

  // Order action handlers (passed to child views)
  const handleDelete = useCallback(async (order) => {
    if (!confirm(`Are you sure you want to delete order for ${order.patient_name}?`)) return

    try {
      if (order._offline) {
        // Delete from offline storage
        const raw = localStorage.getItem(OFFLINE_KEY)
        const orders = raw ? JSON.parse(raw) : []
        const updated = orders.filter(o => o.id !== order.id)
        localStorage.setItem(OFFLINE_KEY, JSON.stringify(updated))
      } else {
        // Delete from backend
        await orderService.deleteOrder(order.id)
      }

      toast.notify({ type: 'success', message: 'Order deleted successfully' })
      window.location.reload() // Refresh to show updated list
    } catch (error) {
      toast.notify({ type: 'error', message: `Failed to delete order: ${error.message}` })
    }
  }, [toast, OFFLINE_KEY])

  const handleChangeStatus = useCallback(async (order, newStatus, notes = '') => {
    try {
      await orderService.updateOrderStatus(order.id, newStatus, notes)
      toast.notify({ type: 'success', message: `Order status updated to ${newStatus}` })
      window.location.reload()
    } catch (error) {
      toast.notify({ type: 'error', message: `Failed to update status: ${error.message}` })
    }
  }, [toast])

  const handlePublish = useCallback(async (order) => {
    try {
      // Implement publish logic here
      toast.notify({ type: 'success', message: 'Order published to worklist' })
      window.location.reload()
    } catch (error) {
      toast.notify({ type: 'error', message: `Failed to publish: ${error.message}` })
    }
  }, [toast])

  const handleSync = useCallback(async (order) => {
    if (!order._offline) {
      toast.notify({ type: 'warning', message: 'Order is already synced' })
      return
    }

    try {
      setSyncingOrders(prev => [...prev, order.id])

      // Sync to backend
      const synced = await orderService.createOrder(order)

      // Remove from offline storage
      const raw = localStorage.getItem(OFFLINE_KEY)
      const orders = raw ? JSON.parse(raw) : []
      const updated = orders.filter(o => o.id !== order.id)
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(updated))

      toast.notify({ type: 'success', message: 'Order synced successfully' })
      window.location.reload()
    } catch (error) {
      toast.notify({ type: 'error', message: `Failed to sync order: ${error.message}` })
    } finally {
      setSyncingOrders(prev => prev.filter(id => id !== order.id))
    }
  }, [toast, OFFLINE_KEY])

  if (!appConfig) return <LoadingScreen message="Loading configuration..." />

  const backendEnabled = appConfig.backendEnabled
  const storageType = backendEnabled ? 'external' : (storageConfig.mode === 'server' ? 'server' : 'browser')

  return (
    <div className="p-6">
      {/* Header with Storage Indicator */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Orders Management</h1>
          <StorageIndicator storageType={storageType} />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                ${activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
              title={tab.description}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'all' && (
          <AllOrdersView
            onDelete={handleDelete}
            onChangeStatus={handleChangeStatus}
            onPublish={handlePublish}
            onSync={handleSync}
            syncingOrders={syncingOrders}
          />
        )}

        {activeTab === 'intake' && (
          <IntakeQueueView />
        )}

        {activeTab === 'completed' && (
          <CompletedOrdersView />
        )}
      </div>
    </div>
  )
}
