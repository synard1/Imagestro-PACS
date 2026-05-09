/**
 * Notification Backend Service
 * Secure backend API integration for Telegram & WhatsApp notifications
 * 
 * This service communicates with the backend API to:
 * - Manage notification configuration securely
 * - Send notifications via Telegram and WhatsApp
 * - Track notification audit logs
 * - Test notification channels
 * 
 * NOTE: Uses direct fetch instead of fetchJson to avoid apiBaseUrl issues
 */

import { addCSRFHeader } from '../utils/csrf';
import { getAuthHeader } from './auth-storage';
import { logger } from '../utils/logger';

// Direct API base - NOT using fetchJson to avoid config issues
const API_BASE = '/api/v1/settings/notification';
const API_TIMEOUT = 10000; // 10 seconds

/**
 * Direct fetch wrapper for notification API
 * Bypasses fetchJson to avoid apiBaseUrl config issues
 */
async function notificationFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
  
  try {
    // Get auth token and tenant context
    const authHeaders = getAuthHeader();
    
    // Global Tenant context for Superadmins
    const selectedTenantId = localStorage.getItem('superadmin_selected_tenant');
    const tenantHeader = selectedTenantId ? { 'X-Tenant-ID': selectedTenantId } : {};
    
    // Prepare base headers
    let headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...authHeaders,
      ...tenantHeader,
      ...(options.headers || {})
    };
    
    // Add CSRF token for state-changing methods
    const method = (options.method || 'GET').toUpperCase();
    const requiresCSRF = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    
    if (requiresCSRF) {
      headers = await addCSRFHeader(headers);
    }
    
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    
    throw error;
  }
}

/**
 * Get all notification configurations
 */
export const getNotificationConfig = async (includeDisabled = false) => {
  try {
    const response = await notificationFetch(`/config?include_disabled=${includeDisabled}`);
    return response;
  } catch (error) {
    console.error('Failed to get notification config:', error);
    throw error;
  }
};

/**
 * Get specific notification configuration
 */
export const getNotificationConfigByKey = async (key) => {
  try {
    const response = await notificationFetch(`/config/${key}`);
    return response;
  } catch (error) {
    console.error(`Failed to get notification config for key ${key}:`, error);
    throw error;
  }
};

/**
 * Create notification configuration
 */
export const createNotificationConfig = async (config) => {
  try {
    const response = await notificationFetch(`/config`, {
      method: 'POST',
      body: JSON.stringify(config)
    });
    return response;
  } catch (error) {
    console.error('Failed to create notification config:', error);
    throw error;
  }
};

/**
 * Update notification configuration
 */
export const updateNotificationConfig = async (key, updates) => {
  try {
    const response = await notificationFetch(`/config/${key}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    return response;
  } catch (error) {
    console.error(`Failed to update notification config for key ${key}:`, error);
    throw error;
  }
};

/**
 * Delete notification configuration
 */
export const deleteNotificationConfig = async (key) => {
  try {
    const response = await notificationFetch(`/config/${key}`, {
      method: 'DELETE'
    });
    return response;
  } catch (error) {
    console.error(`Failed to delete notification config for key ${key}:`, error);
    throw error;
  }
};

/**
 * Get notification settings status
 */
export const getNotificationStatus = async () => {
  try {
    const response = await notificationFetch(`/status`);
    return response;
  } catch (error) {
    console.error('Failed to get notification status:', error);
    throw error;
  }
};

/**
 * Test notification channel
 */
export const testNotificationChannel = async (channel) => {
  try {
    const response = await notificationFetch(`/test`, {
      method: 'POST',
      body: JSON.stringify({ channel })
    });
    return response;
  } catch (error) {
    console.error(`Failed to test ${channel} notification:`, error);
    throw error;
  }
};

/**
 * Get audit logs
 */
export const getNotificationAuditLogs = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.notification_type) params.append('notification_type', filters.notification_type);
    if (filters.channel) params.append('channel', filters.channel);
    if (filters.status) params.append('status', filters.status);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    
    // Date range filters
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    
    // Search filter
    if (filters.search) params.append('search', filters.search);
    
    const path = `/audit-logs${params.toString() ? '?' + params.toString() : ''}`;
    const response = await notificationFetch(path);
    return response;
  } catch (error) {
    console.error('Failed to get audit logs:', error);
    throw error;
  }
};

/**
 * Get audit statistics
 */
export const getNotificationAuditStats = async (days = 7) => {
  try {
    const response = await notificationFetch(`/audit-logs/stats?days=${days}`);
    return response;
  } catch (error) {
    console.error('Failed to get audit stats:', error);
    throw error;
  }
};

/**
 * Setup Telegram configuration
 */
export const setupTelegram = async (botToken, chatId) => {
  try {
    // Create or update bot token
    await updateNotificationConfig('telegram_bot_token', {
      config_value: botToken,
      description: 'Telegram Bot Token for notifications',
      is_sensitive: true,
      enabled: true
    }).catch(() => 
      createNotificationConfig({
        config_key: 'telegram_bot_token',
        config_value: botToken,
        description: 'Telegram Bot Token for notifications',
        is_sensitive: true,
        enabled: true
      })
    );
    
    // Create or update chat ID
    await updateNotificationConfig('telegram_chat_id', {
      config_value: chatId,
      description: 'Telegram Chat ID for centralized notifications',
      is_sensitive: false,
      enabled: true
    }).catch(() =>
      createNotificationConfig({
        config_key: 'telegram_chat_id',
        config_value: chatId,
        description: 'Telegram Chat ID for centralized notifications',
        is_sensitive: false,
        enabled: true
      })
    );
    
    logger.info('Telegram configuration updated');
    return true;
  } catch (error) {
    logger.error('Failed to setup Telegram:', error);
    throw error;
  }
};

/**
 * Setup WhatsApp configuration
 */
export const setupWhatsApp = async (apiKey, instanceName, targetNumber, baseUrl) => {
  try {
    const configs = [
      {
        key: 'whatsapp_api_key',
        value: apiKey,
        description: 'WhatsApp Evolution API Key',
        is_sensitive: true
      },
      {
        key: 'whatsapp_instance_name',
        value: instanceName,
        description: 'WhatsApp Evolution Instance Name',
        is_sensitive: false
      },
      {
        key: 'whatsapp_target_number',
        value: targetNumber,
        description: 'WhatsApp Target Number for notifications',
        is_sensitive: false
      },
      {
        key: 'whatsapp_base_url',
        value: baseUrl,
        description: 'WhatsApp Evolution API Base URL',
        is_sensitive: false
      }
    ];
    
    for (const config of configs) {
      await updateNotificationConfig(config.key, {
        config_value: config.value,
        description: config.description,
        is_sensitive: config.is_sensitive,
        enabled: true
      }).catch(() =>
        createNotificationConfig({
          config_key: config.key,
          config_value: config.value,
          description: config.description,
          is_sensitive: config.is_sensitive,
          enabled: true
        })
      );
    }
    
    logger.info('WhatsApp configuration updated');
    return true;
  } catch (error) {
    logger.error('Failed to setup WhatsApp:', error);
    throw error;
  }
};

/**
 * Disable notification channel
 */
export const disableNotificationChannel = async (channel) => {
  try {
    const keys = {
      telegram: ['telegram_bot_token', 'telegram_chat_id'],
      whatsapp: ['whatsapp_api_key', 'whatsapp_instance_name', 'whatsapp_target_number', 'whatsapp_base_url']
    };
    
    const keysToDisable = keys[channel] || [];
    
    for (const key of keysToDisable) {
      await updateNotificationConfig(key, { enabled: false });
    }
    
    console.log(`${channel} notifications disabled`);
    return true;
  } catch (error) {
    console.error(`Failed to disable ${channel}:`, error);
    throw error;
  }
};

/**
 * Enable notification channel
 * Re-enables a previously disabled channel (config must already exist)
 */
export const enableNotificationChannel = async (channel) => {
  try {
    const keys = {
      telegram: ['telegram_bot_token', 'telegram_chat_id'],
      whatsapp: ['whatsapp_api_key', 'whatsapp_instance_name', 'whatsapp_target_number', 'whatsapp_base_url']
    };
    
    const keysToEnable = keys[channel] || [];
    
    for (const key of keysToEnable) {
      await updateNotificationConfig(key, { enabled: true });
    }
    
    console.log(`${channel} notifications enabled`);
    return true;
  } catch (error) {
    console.error(`Failed to enable ${channel}:`, error);
    throw error;
  }
};

/**
 * Toggle notification channel enabled/disabled
 */
export const toggleNotificationChannel = async (channel, enabled) => {
  if (enabled) {
    return enableNotificationChannel(channel);
  } else {
    return disableNotificationChannel(channel);
  }
};

/**
 * Send notification for order events
 * Sends notification to configured channels (Telegram/WhatsApp)
 * 
 * @param {Object} order - Order data including notification_type
 * @param {string} order.notification_type - Type: 'STAGNANT_ORDER' (required for frontend calls)
 */
export const sendOrderNotification = async (order) => {
  try {
    // Build payload - preserve all fields from caller
    const payload = {
      order_id: order.order_id || order.id,
      order_number: order.order_number,
      patient_name: order.patient_name,
      patient_id: order.patient_id,
      modality: order.modality,
      procedure_name: order.procedure_name,
      scheduled_at: order.scheduled_at || order.scheduled_start_at,
      status: order.status,
      // Use notification_type from caller - default to STAGNANT_ORDER for frontend
      notification_type: order.notification_type || 'STAGNANT_ORDER'
    };
    
    // Add stagnant-specific fields if present
    if (order.stagnant_hours) {
      payload.stagnant_hours = order.stagnant_hours;
    }
    if (order.last_updated_at) {
      payload.last_updated_at = order.last_updated_at;
    }
    
    const response = await notificationFetch(`/send-order-notification`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return response;
  } catch (error) {
    // console.error('Failed to send order notification:', error);
    // Don't throw - notification failure shouldn't block order creation
    return { success: false, error: error.message };
  }
};

/**
 * Send batch notifications for multiple orders (OPTIMIZED)
 * Sends multiple notifications in a single request for better performance and security
 * 
 * Supports 3 payload formats:
 * 1. Minimal (recommended): { order_id, notification_type }
 * 2. Full payload: { order_id, notification_type, patient_name, ... }
 * 3. Mixed: Array with both minimal and full payloads
 * 
 * @param {Array<Object>} orders - Array of order notification requests
 * @param {string} orders[].order_id - Order ID (required)
 * @param {string} orders[].notification_type - Notification type (required)
 * @returns {Promise<Object>} Batch response with success/failure details
 * 
 * @example
 * // Minimal payload (backend fetches order details)
 * await sendBatchOrderNotifications([
 *   { order_id: "123", notification_type: "STAGNANT_ORDER" },
 *   { order_id: "456", notification_type: "NEW_ORDER" }
 * ]);
 * 
 * @example
 * // Full payload (backward compatible)
 * await sendBatchOrderNotifications([
 *   {
 *     order_id: "123",
 *     notification_type: "STAGNANT_ORDER",
 *     patient_name: "John Doe",
 *     order_number: "ORD-001",
 *     ...
 *   }
 * ]);
 */
export const sendBatchOrderNotifications = async (orders) => {
  try {
    if (!Array.isArray(orders) || orders.length === 0) {
      return { 
        success: false, 
        error: 'Orders must be a non-empty array' 
      };
    }
    
    // Validate that all orders have required fields
    const invalidOrders = orders.filter(o => !o.order_id || !o.notification_type);
    if (invalidOrders.length > 0) {
      return {
        success: false,
        error: `${invalidOrders.length} order(s) missing required fields (order_id, notification_type)`
      };
    }
    
    // Build minimal payloads (backend will fetch full details if needed)
    const payloads = orders.map(order => {
      const payload = {
        order_id: order.order_id || order.id,
        notification_type: order.notification_type || 'STAGNANT_ORDER'
      };
      
      // Include optional fields if provided (backward compatibility)
      if (order.order_number) payload.order_number = order.order_number;
      if (order.patient_name) payload.patient_name = order.patient_name;
      if (order.patient_id) payload.patient_id = order.patient_id;
      if (order.modality) payload.modality = order.modality;
      if (order.procedure_name) payload.procedure_name = order.procedure_name;
      if (order.scheduled_at) payload.scheduled_at = order.scheduled_at;
      if (order.scheduled_start_at) payload.scheduled_at = order.scheduled_start_at;
      if (order.status) payload.status = order.status;
      if (order.stagnant_hours) payload.stagnant_hours = order.stagnant_hours;
      if (order.last_updated_at) payload.last_updated_at = order.last_updated_at;
      
      return payload;
    });
    
    console.info(`[notificationBackendService] Sending batch notification for ${payloads.length} order(s)`);
    
    const response = await notificationFetch(`/send-order-notification`, {
      method: 'POST',
      body: JSON.stringify(payloads)
    });
    
    return response;
  } catch (error) {
    console.error('[notificationBackendService] Failed to send batch notifications:', error);
    // Don't throw - notification failure shouldn't block operations
    return { 
      success: false, 
      error: error.message,
      sent: 0,
      failed: orders?.length || 0
    };
  }
};

export default {
  getNotificationConfig,
  getNotificationConfigByKey,
  createNotificationConfig,
  updateNotificationConfig,
  deleteNotificationConfig,
  getNotificationStatus,
  testNotificationChannel,
  getNotificationAuditLogs,
  getNotificationAuditStats,
  setupTelegram,
  setupWhatsApp,
  disableNotificationChannel,
  enableNotificationChannel,
  toggleNotificationChannel,
  sendOrderNotification,
  sendBatchOrderNotifications
};
