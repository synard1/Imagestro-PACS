/**
 * REFACTORED: Notification Logic Service
 * 
 * This service has been completely refactored to use the backend API.
 * All credentials are now stored securely on the backend.
 * 
 * MIGRATION NOTICE:
 * ================
 * Old methods are deprecated but still available for backward compatibility.
 * They will redirect to the new backend-based implementation.
 * 
 * For new code, use:
 * - notificationBackendService.js for configuration management
 * - NotificationSettings.jsx component for UI
 * 
 * See: NOTIFICATION_REFACTOR_GUIDE.md for migration details
 */

import { logger } from '../utils/logger';
import { notify } from './notifications';

// Import new backend service
import {
  getNotificationConfig,
  updateNotificationConfig,
  testNotificationChannel,
  setupTelegram,
  setupWhatsApp,
  getNotificationStatus,
  getNotificationAuditLogs
} from './notificationBackendService';

// Re-export new methods with deprecation warnings for old names
export const loadNotificationConfig = async () => {
  logger.warn('[DEPRECATED] loadNotificationConfig() - Use getNotificationConfig() from notificationBackendService instead');
  return getNotificationConfig();
};

export const saveNotificationConfig = async (config) => {
  logger.warn('[DEPRECATED] saveNotificationConfig() - Use updateNotificationConfig() from notificationBackendService instead');
  
  if (config.telegramBotToken && config.telegramChatId) {
    await setupTelegram(config.telegramBotToken, config.telegramChatId);
  }
  
  if (config.whatsappEnabled && config.whatsappApiKey) {
    await setupWhatsApp(
      config.whatsappApiKey,
      config.whatsappInstanceName,
      config.whatsappTargetNumber,
      config.whatsappBaseUrl
    );
  }
  
  return config;
};

export const testTelegramNotification = async () => {
  logger.warn('[DEPRECATED] testTelegramNotification() - Use testNotificationChannel("telegram") instead');
  const result = await testNotificationChannel('telegram');
  if (!result.success) {
    throw new Error(result.message || 'Failed to send test notification');
  }
  return result;
};

export const testWhatsappNotification = async () => {
  logger.warn('[DEPRECATED] testWhatsappNotification() - Use testNotificationChannel("whatsapp") instead');
  const result = await testNotificationChannel('whatsapp');
  if (!result.success) {
    throw new Error(result.message || 'Failed to send test notification');
  }
  return result;
};

export const simulateNotification = async (scenario) => {
  logger.warn('[DEPRECATED] simulateNotification() - Use NotificationSettings component instead');
  notify({
    type: 'info',
    message: `Simulation: ${scenario} - This feature has been moved to the Notification Settings page.`,
    duration: 5000
  });
};

// These methods are no longer supported - kept as stubs for backward compatibility
export const startNotificationService = async () => {
  logger.warn('[DEPRECATED] startNotificationService() - Notifications are now handled by the backend');
};

export const stopNotificationService = () => {
  logger.warn('[DEPRECATED] stopNotificationService() - Notifications are now handled by the backend');
};

export const setOrdersPageStatus = (isOnPage) => {
  logger.warn('[DEPRECATED] setOrdersPageStatus() - Notifications are now handled by the backend');
};

// Export new methods for direct use
export {
  getNotificationConfig,
  updateNotificationConfig,
  testNotificationChannel,
  setupTelegram,
  setupWhatsApp,
  getNotificationStatus,
  getNotificationAuditLogs
};

export default {
  loadNotificationConfig,
  saveNotificationConfig,
  testTelegramNotification,
  testWhatsappNotification,
  simulateNotification,
  startNotificationService,
  stopNotificationService,
  setOrdersPageStatus,
  // New methods
  getNotificationConfig,
  updateNotificationConfig,
  testNotificationChannel,
  setupTelegram,
  setupWhatsApp,
  getNotificationStatus,
  getNotificationAuditLogs
};
