/**
 * Safe Dashboard Data Hook
 * Provides rate-limited, memoized dashboard data loading
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import rateLimiter from '../utils/rateLimiter'
import { dashboardConfig } from '../utils/dashboardConfig'

const useDashboardData = (options = {}) => {
  const {
    enableAutoRefresh = dashboardConfig.enableAutoRefresh,
    refreshInterval = dashboardConfig.statsRefreshInterval,
    maxRequestsPerMinute = 10,
    debounceDelay = 500
  } = options

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  
  const refreshIntervalRef = useRef(null)
  const mountedRef = useRef(true)
  const requestCountRef = useRef(0)
  const loadingRef = useRef(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [])

  // Rate-limited data fetcher
  const fetchData = useCallback(async (force = false) => {
    // Check if component is still mounted
    if (!mountedRef.current) {
      return
    }

    // Rate limiting check
    if (!force && !rateLimiter.isAllowed('dashboard-data', maxRequestsPerMinute, 60000)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Dashboard data fetch rate limited')
      }
      return
    }

    // Prevent concurrent requests using ref instead of state
    if (loadingRef.current && !force) {
      return
    }

    try {
      loadingRef.current = true
      setLoading(true)
      setError(null)
      requestCountRef.current += 1

      // Simulate API call - replace with actual API call
      const response = await new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            stats: {
              totalUsers: Math.floor(Math.random() * 1000),
              activeUsers: Math.floor(Math.random() * 100),
              totalStudies: Math.floor(Math.random() * 5000),
              totalSeries: Math.floor(Math.random() * 10000)
            },
            timestamp: new Date().toISOString()
          })
        }, 100)
      })

      if (mountedRef.current) {
        setData(response)
        setLastRefresh(new Date())
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err)
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ Dashboard data fetch failed:', err)
        }
      }
    } finally {
      if (mountedRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [maxRequestsPerMinute]) // Removed loading dependency to prevent loop

  // Debounced refresh function
  const debouncedRefresh = useMemo(() => {
    return rateLimiter.debounce('dashboard-refresh', fetchData, debounceDelay)
  }, [fetchData, debounceDelay])

  // Manual refresh function
  const refresh = useCallback(() => {
    debouncedRefresh()
  }, [debouncedRefresh])

  // Force refresh function (bypasses rate limiting)
  const forceRefresh = useCallback(() => {
    fetchData(true)
  }, [fetchData])

  // Auto-refresh effect
  useEffect(() => {
    // Initial load
    fetchData()

    // Setup auto-refresh if enabled
    if (enableAutoRefresh && refreshInterval > 0) {
      refreshIntervalRef.current = setInterval(() => {
        if (mountedRef.current) {
          fetchData()
        }
      }, refreshInterval)

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current)
          refreshIntervalRef.current = null
        }
      }
    }
  }, [enableAutoRefresh, refreshInterval]) // Removed fetchData to prevent infinite loop

  // Memoized return object to prevent unnecessary re-renders
  return useMemo(() => ({
    data,
    loading,
    error,
    lastRefresh,
    refresh,
    forceRefresh,
    requestCount: requestCountRef.current,
    isAutoRefreshEnabled: enableAutoRefresh,
    refreshInterval
  }), [
    data,
    loading,
    error,
    lastRefresh,
    refresh,
    forceRefresh,
    enableAutoRefresh,
    refreshInterval
  ])
}

export default useDashboardData