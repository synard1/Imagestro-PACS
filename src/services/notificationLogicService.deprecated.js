/**
 * DEPRECATED: Old Notification Logic Service
 * 
 * This file is kept for backward compatibility only.
 * All new code should use notificationBackendService.js instead.
 * 
 * This service has been replaced with a backend-based implementation
 * that stores credentials securely on the server.
 * 
 * Migration Guide:
 * - Old: loadNotificationConfig() -> New: getNotificationConfig()
 * - Old: saveNotificationConfig() -> New: updateNotificationConfig()
 * - Old: testTelegramNotification() -> New: testNotificationChannel('telegram')
 * - Old: testWhatsappNotification() -> New: testNotificationChannel('whatsapp')
 * 
 * See: NOTIFICATION_REFACTOR_GUIDE.md for details
 */

import { logger } from '../utils/logger';
import { notify } from './notifications';

// Fallback to new backend service
import {
  getNotificationConfig,
  updateNotificationConfig,
  testNotificationChannel,
  setupTelegram,
  setupWhatsApp
} from './notificationBackendService';

/**
 * DEPRECATED: Load notification config
 * @deprecated Use getNotificationConfig() from notificationBackendService instead
 */
export const loadNotificationConfig = async () => {
  logger.warn('[DEPRECATED] loadNotificationConfig() is deprecated. Use getNotificationConfig() instead.');
  
  try {
    const configs = await getNotificationConfig();
    
    // Convert backend format to old format for backward compatibility
    const configMap = {};
    configs.forEach(config => {
      configMap[config.config_key] = config.config_value;
    });
    
    return {
      enabled: configMap.telegram_bot_token ? true : false,
      telegramBotToken: configMap.telegram_bot_token || '',
      telegramChatId: configMap.telegram_chat_id || '',
      whatsappEnabled: configMap.whatsapp_api_key ? true : false,
      whatsappApiKey: configMap.whatsapp_api_key || '',
      whatsappInstanceName: configMap.whatsapp_instance_name || '',
      whatsappTargetNumber: configMap.whatsapp_target_number || '',
      whatsappBaseUrl: configMap.whatsapp_base_url || '',
      notifyOnNewOrder: true,
      notifyOnStagnantOrder: false,
      stagnantThresholdMinutes: 60
    };
  } catch (error) {
    logger.error('[DEPRECATED] Failed to load notification config:', error);
    // Return default config on error
    return {
      enabled: false,
      telegramBotToken: '',
      telegramChatId: '',
      whatsappEnabled: false,
      whatsappApiKey: '',
      whatsappInstanceName: '',
      whatsappTargetNumber: '',
      whatsappBaseUrl: '',
      notifyOnNewOrder: true,
      notifyOnStagnantOrder: false,
      stagnantThresholdMinutes: 60
    };
  }
};

/**
 * DEPRECATED: Save notification config
 * @deprecated Use updateNotificationConfig() from notificationBackendService instead
 */
export const saveNotificationConfig = async (config) => {
  logger.warn('[DEPRECATED] saveNotificationConfig() is deprecated. Use updateNotificationConfig() instead.');
  
  try {
    // Setup Telegram if token is provided
    if (config.telegramBotToken && config.telegramChatId) {
      await setupTelegram(config.telegramBotToken, config.telegramChatId);
    }
    
    // Setup WhatsApp if enabled
    if (config.whatsappEnabled && config.whatsappApiKey) {
      await setupWhatsApp(
        config.whatsappApiKey,
        config.whatsappInstanceName,
        config.whatsappTargetNumber,
        config.whatsappBaseUrl
      );
    }
    
    return config;
  } catch (error) {
    logger.error('[DEPRECATED] Failed to save notification config:', error);
    throw error;
  }
};

/**
 * DEPRECATED: Test Telegram notification
 * @deprecated Use testNotificationChannel('telegram') from notificationBackendService instead
 */
export const testTelegramNotification = async () => {
  logger.warn('[DEPRECATED] testTelegramNotification() is deprecated. Use testNotificationChannel("telegram") instead.');
  
  try {
    const result = await testNotificationChannel('telegram');
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to send test notification');
    }
    
    return result;
  } catch (error) {
    logger.error('[DEPRECATED] Failed to test Telegram notification:', error);
    throw error;
  }
};

/**
 * DEPRECATED: Test WhatsApp notification
 * @deprecated Use testNotificationChannel('whatsapp') from notificationBackendService instead
 */
export const testWhatsappNotification = async () => {
  logger.warn('[DEPRECATED] testWhatsappNotification() is deprecated. Use testNotificationChannel("whatsapp") instead.');
  
  try {
    const result = await testNotificationChannel('whatsapp');
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to send test notification');
    }
    
    return result;
  } catch (error) {
    logger.error('[DEPRECATED] Failed to test WhatsApp notification:', error);
    throw error;
  }
};

/**
 * DEPRECATED: Simulate notification
 * @deprecated This method is no longer supported. Use NotificationSettings component instead.
 */
export const simulateNotification = async (scenario) => {
  logger.warn('[DEPRECATED] simulateNotification() is deprecated. Use NotificationSettings component instead.');
  
  notify({
    type: 'info',
    message: `Simulation: ${scenario} - This feature has been moved to the Notification Settings page.`,
    duration: 5000
  });
};

/**
 * DEPRECATED: Start notification service
 * @deprecated This method is no longer supported. Notifications are now handled by the backend.
 */
export const startNotificationService = async () => {
  logger.warn('[DEPRECATED] startNotificationService() is deprecated. Notifications are now handled by the backend.');
};

/**
 * DEPRECATED: Stop notification service
 * @deprecated This method is no longer supported. Notifications are now handled by the backend.
 */
export const stopNotificationService = () => {
  logger.warn('[DEPRECATED] stopNotificationService() is deprecated. Notifications are now handled by the backend.');
};

/**
 * DEPRECATED: Set orders page status
 * @deprecated This method is no longer supported. Notifications are now handled by the backend.
 */
export const setOrdersPageStatus = (isOnPage) => {
  logger.warn('[DEPRECATED] setOrdersPageStatus() is deprecated. Notifications are now handled by the backend.');
};

export default {
  loadNotificationConfig,
  saveNotificationConfig,
  testTelegramNotification,
  testWhatsappNotification,
  simulateNotification,
  startNotificationService,
  stopNotificationService,
  setOrdersPageStatus
};
