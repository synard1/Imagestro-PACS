/**
 * Dashboard Monitor Component
 * Provides real-time monitoring and debugging information for dashboard performance
 */

import React, { useState, useEffect } from 'react'
import rateLimiter from '../utils/rateLimiter'

const DashboardMonitor = ({ 
  requestCount = 0, 
  isAutoRefreshEnabled = false, 
  refreshInterval = 0,
  lastRefresh = null,
  loading = false,
  error = null 
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [performanceData, setPerformanceData] = useState({
    requestsPerMinute: 0,
    averageResponseTime: 0,
    errorRate: 0
  })

  // Monitor performance metrics
  useEffect(() => {
    const interval = setInterval(() => {
      const dashboardRequestCount = rateLimiter.getCurrentCount('dashboard-data', 60000)
      
      setPerformanceData(prev => ({
        ...prev,
        requestsPerMinute: dashboardRequestCount
      }))
    }, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [])

  // Warning thresholds
  const isHighRequestRate = performanceData.requestsPerMinute > 5
  const isVeryHighRequestRate = performanceData.requestsPerMinute > 10

  if (!isExpanded) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsExpanded(true)}
          className={`px-3 py-2 rounded-lg text-sm font-medium shadow-lg transition-colors ${
            isVeryHighRequestRate
              ? 'bg-red-500 text-white animate-pulse'
              : isHighRequestRate
              ? 'bg-yellow-500 text-white'
              : 'bg-green-500 text-white'
          }`}
        >
          📊 Monitor ({performanceData.requestsPerMinute}/min)
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 w-80">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          📊 Dashboard Monitor
        </h3>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ✕
        </button>
      </div>

      <div className="space-y-3">
        {/* Request Rate Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Request Rate:</span>
          <span className={`text-sm font-medium ${
            isVeryHighRequestRate
              ? 'text-red-600 dark:text-red-400'
              : isHighRequestRate
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-green-600 dark:text-green-400'
          }`}>
            {performanceData.requestsPerMinute}/min
          </span>
        </div>

        {/* Total Requests */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Total Requests:</span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {requestCount}
          </span>
        </div>

        {/* Auto Refresh Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Auto Refresh:</span>
          <span className={`text-sm font-medium ${
            isAutoRefreshEnabled 
              ? 'text-blue-600 dark:text-blue-400' 
              : 'text-gray-500 dark:text-gray-400'
          }`}>
            {isAutoRefreshEnabled ? `ON (${Math.round(refreshInterval / 1000)}s)` : 'OFF'}
          </span>
        </div>

        {/* Loading Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
          <span className={`text-sm font-medium ${
            loading 
              ? 'text-blue-600 dark:text-blue-400' 
              : error
              ? 'text-red-600 dark:text-red-400'
              : 'text-green-600 dark:text-green-400'
          }`}>
            {loading ? 'Loading...' : error ? 'Error' : 'Ready'}
          </span>
        </div>

        {/* Last Refresh */}
        {lastRefresh && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Last Refresh:</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {new Date(lastRefresh).toLocaleTimeString()}
            </span>
          </div>
        )}

        {/* Warnings */}
        {isVeryHighRequestRate && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2">
            <p className="text-xs text-red-700 dark:text-red-400 font-medium">
              ⚠️ Very high request rate detected! This may indicate an infinite loop.
            </p>
          </div>
        )}

        {isHighRequestRate && !isVeryHighRequestRate && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-2">
            <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">
              ⚠️ High request rate detected. Monitor for potential issues.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex space-x-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => rateLimiter.clear('dashboard-data')}
            className="flex-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Clear Rate Limit
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  )
}

export default DashboardMonitor