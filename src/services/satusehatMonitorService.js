import { apiClient } from './http'
import { loadRegistry } from './api-registry'

// Returns array of orders with satusehat sync status
export async function listMonitorRows({ forceRefresh = false } = {}) {
  const registry = loadRegistry()
  const cfg = registry.satusehatMonitor || { enabled: false }

  // If dedicated monitor backend enabled, fetch from it
  if (cfg.enabled) {
    try {
      console.debug('[satusehatMonitorService] Fetching from satusehatMonitor backend...')
      const client = apiClient('satusehatMonitor')
      const resp = await client.get('/api/monitor/satusehat/orders')

      console.debug('[satusehatMonitorService] Response from monitor backend:', resp)

      // Handle different response formats
      if (Array.isArray(resp)) {
        console.debug('[satusehatMonitorService] Got array directly, length:', resp.length)
        return resp
      }
      if (resp?.data && Array.isArray(resp.data)) {
        console.debug('[satusehatMonitorService] Got data array, length:', resp.data.length)
        return resp.data
      }
      if (resp?.orders && Array.isArray(resp.orders)) {
        console.debug('[satusehatMonitorService] Got orders array, length:', resp.orders.length)
        return resp.orders
      }

      console.warn('[satusehatMonitorService] Unexpected response format:', resp)
      // Don't return empty, let it fallback
    } catch (e) {
      // Log detailed error
      console.error('[satusehatMonitorService] Monitor backend fetch failed:', {
        message: e.message,
        status: e.status,
        error: e
      })
      console.warn('[satusehatMonitorService] Falling back to orders API...')
    }
  }

  // Fetch from the new orders satusehat-status endpoint
  try {
    console.debug('[satusehatMonitorService] Fetching from orders API fallback...')
    const client = apiClient('orders')
    const response = await client.get('/orders/satusehat-status')

    console.debug('[satusehatMonitorService] Response from orders API:', response)

    if (Array.isArray(response)) {
      console.debug('[satusehatMonitorService] Got array from orders API, length:', response.length)
      return response
    }
    if (response?.orders && Array.isArray(response.orders)) {
      console.debug('[satusehatMonitorService] Got orders from orders API, length:', response.orders.length)
      return response.orders
    }

    console.warn('[satusehatMonitorService] Unexpected orders API response format:', response)
    return []
  } catch (e) {
    console.error('[satusehatMonitorService] Failed to fetch from orders API:', {
      message: e.message,
      status: e.status,
      error: e
    })

    // Return empty array as last resort
    return []
  }
}

