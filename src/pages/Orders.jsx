import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getConfig } from '../services/config'
import { getDataStorageConfig } from '../services/dataSync'
import LoadingScreen from '../components/LoadingScreen'
import { useAuth } from '../hooks/useAuth'
import { canAny } from '../services/rbac'
import { checkStagnantOrders } from '../services/stagnantOrderService'

// Import tab view components
import AllOrdersView from './orders/AllOrdersView'
import IntakeQueueView from './orders/IntakeQueueView'
import CompletedOrdersView from './orders/CompletedOrdersView'

// Storage indicator component
import StorageIndicator from '../components/StorageIndicator'
import Icon from '../components/common/Icon'

// Khanza integration
import { useKhanzaStatus } from '../hooks/useKhanzaStatus'
import KhanzaOrdersModal from '../components/orders/KhanzaOrdersModal'
import PermissionGate from '../components/common/PermissionGate'

export default function Orders() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') || 'all'
  const [activeTab, setActiveTab] = useState(tabFromUrl)
  const [appConfig, setAppConfig] = useState(null)
  const storageConfig = getDataStorageConfig()
  const { currentUser } = useAuth()

  // Khanza integration state
  const { connected: khanzaConnected } = useKhanzaStatus()
  const [isKhanzaModalOpen, setIsKhanzaModalOpen] = useState(false)

  // Load config
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getConfig()
      setAppConfig(config)
    }
    loadConfig()
  }, [])

  // Check for stagnant orders when page is accessed
  // This will send notifications and show toast alerts (with 3-hour cooldown)
  useEffect(() => {
    let isMounted = true

    const check = async () => {
      if (isMounted) {
        await checkStagnantOrders()
      }
    }

    check()

    return () => {
      isMounted = false
    }
  }, [])

  // Tab configuration with permissions
  const tabs = useMemo(() => {
    const allTabs = [
      {
        key: 'all',
        label: t('All Orders'),
        icon: '📋',
        description: t('View all orders regardless of status'),
        permissions: ['order.view', 'order.*']
      },
      {
        key: 'intake',
        label: t('Intake Queue'),
        icon: '🏥',
        description: t('Orders pending scheduling or check-in'),
        permissions: ['intake.view', 'intake.*']
      },
      {
        key: 'completed',
        label: t('Completed'),
        icon: '✅',
        description: t('Completed, reported, and delivered orders'),
        permissions: ['order.view', 'order.*']
      }
    ]

    return allTabs.filter(tab => canAny(tab.permissions, currentUser))
  }, [currentUser, t])

  // Keep active tab in sync with URL and permissions
  useEffect(() => {
    // If current active tab is not in allowed tabs, switch to first allowed tab
    const isAllowed = tabs.find(t => t.key === activeTab)

    if (!isAllowed && tabs.length > 0) {
      const firstAllowed = tabs[0].key
      setActiveTab(firstAllowed)
      setSearchParams({ tab: firstAllowed })
      return
    }

    if (tabFromUrl !== activeTab && isAllowed) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl, activeTab, tabs, setSearchParams])

  const handleTabChange = (tabKey) => {
    if (tabKey === activeTab) return
    setActiveTab(tabKey)
    setSearchParams({ tab: tabKey })
  }

  if (!appConfig) return <LoadingScreen message={t("Loading configuration...")} />

  const backendEnabled = appConfig.backendEnabled
  const storageType = backendEnabled ? 'external' : (storageConfig.mode === 'server' ? 'server' : 'browser')

  return (
    <div className="p-6">
      {/* Header with Storage Indicator */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{t('Orders Management')}</h1>
          <StorageIndicator storageType={storageType} />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {khanzaConnected && (
            <PermissionGate perm="order.create">
              <button
                onClick={() => setIsKhanzaModalOpen(true)}
                className="btn-themed-primary flex items-center gap-2"
                title="Order from SIMRS"
              >
                <Icon name="plus" className="w-5 h-5" />
                {t('Order SIMRS')}
              </button>
            </PermissionGate>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => {
            // Map tab key to icon name
            const iconName = tab.key === 'all' ? 'clipboardList' : tab.key === 'intake' ? 'building' : 'checkCircle';
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center
                  ${activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
                title={tab.description}
              >
                <Icon name={iconName} className="w-5 h-5 mr-2" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'all' && (
          <AllOrdersView />
        )}

        {activeTab === 'intake' && (
          <IntakeQueueView />
        )}

        {activeTab === 'completed' && (
          <CompletedOrdersView />
        )}
      </div>

      {/* Khanza Orders Modal */}
      <KhanzaOrdersModal
        isOpen={isKhanzaModalOpen}
        onClose={() => setIsKhanzaModalOpen(false)}
      />
    </div>
  )
}
