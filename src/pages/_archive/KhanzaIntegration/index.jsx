/**
 * Khanza Integration Main Page
 * 
 * Main page with tabs for browsing SIMRS Khanza orders, import history, and settings.
 * 
 * Requirements: 1.1
 */

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  ClipboardList, 
  History, 
  Settings, 
  RefreshCw,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { isKhanzaEnabled, checkHealth } from '../../services/khanzaService'
import OrderBrowser from './OrderBrowser'

// Tab configuration
const TABS = [
  { id: 'orders', label: 'Order Browser', icon: ClipboardList },
  { id: 'history', label: 'Import History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
]

// Connection status indicator
function ConnectionStatus({ status, onRefresh }) {
  const statusConfig = {
    connected: {
      icon: CheckCircle2,
      text: 'Connected to Khanza API',
      className: 'bg-green-100 text-green-700 border-green-200',
    },
    disconnected: {
      icon: AlertCircle,
      text: 'Disconnected from Khanza API',
      className: 'bg-red-100 text-red-700 border-red-200',
    },
    checking: {
      icon: RefreshCw,
      text: 'Checking connection...',
      className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    },
  }

  const config = statusConfig[status] || statusConfig.disconnected
  const Icon = config.icon

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${config.className}`}>
      <Icon size={16} className={status === 'checking' ? 'animate-spin' : ''} />
      <span>{config.text}</span>
      {status !== 'checking' && (
        <button
          onClick={onRefresh}
          className="ml-1 p-0.5 hover:bg-black/10 rounded"
          title="Refresh connection status"
        >
          <RefreshCw size={14} />
        </button>
      )}
    </div>
  )
}

export default function KhanzaIntegration() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'orders')
  const [connectionStatus, setConnectionStatus] = useState('checking')
  const [khanzaEnabled, setKhanzaEnabled] = useState(false)

  // Check if Khanza integration is enabled
  useEffect(() => {
    const enabled = isKhanzaEnabled()
    setKhanzaEnabled(enabled)
    
    if (enabled) {
      checkConnectionStatus()
    } else {
      setConnectionStatus('disconnected')
    }
  }, [])

  // Check connection status
  const checkConnectionStatus = async () => {
    setConnectionStatus('checking')
    try {
      const result = await checkHealth()
      setConnectionStatus(result.status === 'connected' ? 'connected' : 'disconnected')
    } catch (error) {
      console.error('Health check failed:', error)
      setConnectionStatus('disconnected')
    }
  }

  // Handle tab change
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    setSearchParams({ tab: tabId })
  }

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'orders':
        return <OrderBrowser connectionStatus={connectionStatus} />
      case 'history':
        return (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <History size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">Import History</p>
            <p className="text-sm">Coming soon - Task 10</p>
          </div>
        )
      case 'settings':
        return (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Settings size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">Settings</p>
            <p className="text-sm">Coming soon - Task 11</p>
          </div>
        )
      default:
        return null
    }
  }

  // Show warning if Khanza is not enabled
  if (!khanzaEnabled) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">SIMRS Khanza Integration</h1>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={24} />
            <div>
              <h3 className="font-semibold text-yellow-800">Khanza Integration Not Enabled</h3>
              <p className="text-yellow-700 mt-1">
                SIMRS Khanza integration is not enabled in the system configuration.
                Please enable it in Settings → SIMRS Integration to use this feature.
              </p>
              <button
                onClick={() => window.location.href = '/settings'}
                className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Go to Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SIMRS Khanza Integration</h1>
          <p className="text-sm text-gray-600 mt-1">
            Import radiology orders from SIMRS Khanza to PACS worklist
          </p>
        </div>
        <ConnectionStatus 
          status={connectionStatus} 
          onRefresh={checkConnectionStatus} 
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4" aria-label="Tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                  ${isActive 
                    ? 'border-blue-600 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {renderTabContent()}
      </div>
    </div>
  )
}
