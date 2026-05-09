import { listOrders } from './orderService';
import { notify } from './notifications';
import { getLocalSettings, saveLocalSettings } from './settingsService';
import { getCurrentUser } from './rbac';

// Default configuration
const DEFAULT_CONFIG = {
  enabled: false,
  telegramBotToken: '', // Replaces webhook URL
  notifyOnNewOrder: true,
  notifyOnStagnantOrder: false,
  stagnantThresholdMinutes: 60,
  lastCheckTime: null
};

// In-memory state
let intervalId = null;
let config = { ...DEFAULT_CONFIG };
let lastOrderCount = 0;
let notifiedStagnantOrders = new Set(); // Track IDs of orders already notified as stagnant

/**
 * Load configuration from local settings
 */
export const loadNotificationConfig = () => {
  const settings = getLocalSettings();
  const notifConfig = settings.notifications || {};
  
  // Migration: if old webhook URL exists but no token, try to extract token (naive) or just reset
  if (notifConfig.telegramWebhookUrl && !notifConfig.telegramBotToken) {
    // Just keep it empty, user needs to re-enter token
    delete notifConfig.telegramWebhookUrl;
  }

  config = { ...DEFAULT_CONFIG, ...notifConfig };
  return config;
};

/**
 * Save configuration to local settings
 */
export const saveNotificationConfig = (newConfig) => {
  const settings = getLocalSettings();
  const updatedSettings = {
    ...settings,
    notifications: { ...DEFAULT_CONFIG, ...newConfig }
  };
  saveLocalSettings(updatedSettings);
  config = updatedSettings.notifications;
  
  // Restart service if enabled status changed
  if (config.enabled && !intervalId) {
    startNotificationService();
  } else if (!config.enabled && intervalId) {
    stopNotificationService();
  }
  
  return config;
};

/**
 * Send notification to Telegram
 */
const sendToTelegram = async (message) => {
  if (!config.telegramBotToken) return;

  const user = getCurrentUser();
  const chatId = user?.telegram;

  if (!chatId) {
    console.warn('[NotificationService] No Telegram ID found for current user. Skipping Telegram notification.');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  } catch (error) {
    console.error('[NotificationService] Failed to send Telegram message:', error);
  }
};

/**
 * Send notification (Local + Telegram)
 */
const sendNotification = (title, message, type = 'info') => {
  // Local notification (Toast)
  notify({
    type: type, // 'success', 'error', 'info', 'warning'
    message: `${title}: ${message}`,
    duration: 5000
  });

  // Remote notification (Telegram)
  const telegramMessage = `*${title}*\n${message}`;
  sendToTelegram(telegramMessage);
};

/**
 * Determine if the current user should be notified based on their role
 */
const shouldNotify = (notificationType, orderStatus) => {
  const user = getCurrentUser();
  if (!user) return false;

  const role = (user.role || '').toLowerCase();

  // Superadmin/Admin/Developer gets everything
  if (['superadmin', 'admin', 'developer'].includes(role)) {
    return true;
  }

  // Tiered Logic
  switch (notificationType) {
    case 'NEW_ORDER':
      // Clerks and Intake staff care about new orders
      return ['clerk', 'intake', 'frontdesk'].includes(role);
    
    case 'STAGNANT_ORDER':
      // Only admins usually care about stagnant orders, maybe managers
      return ['manager', 'head_technologist'].includes(role);

    case 'ORDER_STATUS_CHANGE':
      // Technologists care if order is SCHEDULED (ready for them)
      if (role === 'technologist' && orderStatus === 'scheduled') return true;
      // Radiologists care if order is COMPLETED (ready for reading)
      if (role === 'radiologist' && ['completed', 'verified'].includes(orderStatus)) return true;
      return false;

    default:
      return false;
  }
};

/**
 * Check for new orders
 */
const checkNewOrders = async () => {
  if (!config.notifyOnNewOrder) return;

  // Check if current user role should receive new order alerts
  if (!shouldNotify('NEW_ORDER')) return;

  try {
    // Fetch recent orders (e.g., last 100 to be safe)
    const orders = await listOrders({ limit: 100 });
    
    // If this is the first run, just update the count and return
    if (lastOrderCount === 0) {
      lastOrderCount = orders.length;
      return;
    }

    if (orders.length > lastOrderCount) {
      const newOrdersCount = orders.length - lastOrderCount;
      const sortedOrders = [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const newOrders = sortedOrders.slice(0, newOrdersCount);

      newOrders.forEach(order => {
        sendNotification(
          'New Order Received',
          `Order #${order.order_number}\nPatient: ${order.patient_name}\nModality: ${order.modality}\nProcedure: ${order.procedure_name || 'N/A'}`,
          'success'
        );
      });

      lastOrderCount = orders.length;
    } else if (orders.length < lastOrderCount) {
      lastOrderCount = orders.length;
    }
  } catch (error) {
    console.error('[NotificationService] Error checking new orders:', error);
  }
};

/**
 * Check for stagnant orders
 */
const checkStagnantOrders = async () => {
  if (!config.notifyOnStagnantOrder) return;

  // Check if current user role should receive stagnant order alerts
  if (!shouldNotify('STAGNANT_ORDER')) return;

  try {
    const orders = await listOrders({ limit: 100 });
    const now = new Date();
    const thresholdMs = config.stagnantThresholdMinutes * 60 * 1000;

    orders.forEach(order => {
      if (notifiedStagnantOrders.has(order.id)) return;

      const isCompleted = ['completed', 'verified', 'cancelled', 'rejected'].includes(order.status?.toLowerCase());
      if (isCompleted) return;

      const updatedAt = new Date(order.updated_at || order.created_at);
      const diffMs = now - updatedAt;

      if (diffMs > thresholdMs) {
        sendNotification(
          'Stagnant Order Alert',
          `Order #${order.order_number} has been in status '${order.status}' for over ${config.stagnantThresholdMinutes} minutes.\nPatient: ${order.patient_name}\nProcedure: ${order.procedure_name || 'N/A'}`,
          'warning'
        );
        notifiedStagnantOrders.add(order.id);
      }
    });
  } catch (error) {
    console.error('[NotificationService] Error checking stagnant orders:', error);
  }
};

/**
 * Main polling loop
 */
const runChecks = async () => {
  await checkNewOrders();
  await checkStagnantOrders();
};

/**
 * Start the service
 */
export const startNotificationService = () => {
  loadNotificationConfig();
  
  if (!config.enabled) {
    console.log('[NotificationService] Service disabled in settings');
    return;
  }

  if (intervalId) return; // Already running

  console.log('[NotificationService] Starting service...');
  
  // Initial run
  runChecks();

  // Poll every 1 minute
  intervalId = setInterval(runChecks, 60 * 1000);
};

/**
 * Stop the service
 */
export const stopNotificationService = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[NotificationService] Service stopped');
  }
};

/**
 * Test Telegram Notification
 * Sends a test message to the current user
 */
export const testTelegramNotification = async () => {
  if (!config.telegramBotToken) {
    throw new Error('Telegram Bot Token is not configured');
  }

  const user = getCurrentUser();
  const chatId = user?.telegram;

  if (!chatId) {
    throw new Error('Current user does not have a Telegram Chat ID configured');
  }

  try {
    const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🔔 *Test Notification*\n\nSystem is working correctly! You will receive notifications here based on your role.',
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();
    
    if (!data.ok) {
      if (data.error_code === 400 && data.description.includes('chat not found')) {
        throw new Error('Telegram Chat ID not found. Please ensure you have started a conversation with the bot by sending /start');
      }
      throw new Error(data.description || 'Failed to send test message');
    }

    return true;
  } catch (error) {
    console.error('[NotificationService] Test failed:', error);
    throw error;
  }
};

/**
 * Simulate a notification scenario
 * @param {string} scenario - 'NEW_ORDER', 'STAGNANT_ORDER', 'ORDER_SCHEDULED', 'ORDER_COMPLETED'
 */
export const simulateNotification = async (scenario) => {
  const user = getCurrentUser();
  const role = user?.role || 'unknown';
  
  // Mock data generators
  const mockOrder = {
    order_number: 'ORD-' + Math.floor(Math.random() * 10000),
    patient_name: 'John Doe (Simulated)',
    modality: 'CT',
    procedure_name: 'CT Head w/o Contrast',
    status: 'scheduled'
  };

  let title = '';
  let message = '';
  let type = 'info';

  switch (scenario) {
    case 'NEW_ORDER':
      title = 'New Order Received (Sim)';
      message = `Order #${mockOrder.order_number}\nPatient: ${mockOrder.patient_name}\nModality: ${mockOrder.modality}\nProcedure: ${mockOrder.procedure_name}`;
      type = 'success';
      break;
    
    case 'STAGNANT_ORDER':
      title = 'Stagnant Order Alert (Sim)';
      message = `Order #${mockOrder.order_number} has been in status 'created' for over 60 minutes.\nPatient: ${mockOrder.patient_name}\nProcedure: ${mockOrder.procedure_name}`;
      type = 'warning';
      break;

    case 'ORDER_SCHEDULED':
      title = 'Order Scheduled (Sim)';
      message = `Order #${mockOrder.order_number} is now scheduled.\nPatient: ${mockOrder.patient_name}\nProcedure: ${mockOrder.procedure_name}`;
      type = 'info';
      break;

    case 'ORDER_COMPLETED':
      title = 'Order Completed (Sim)';
      message = `Order #${mockOrder.order_number} has been completed.\nPatient: ${mockOrder.patient_name}\nProcedure: ${mockOrder.procedure_name}`;
      type = 'success';
      break;

    default:
      throw new Error('Unknown scenario');
  }

  // Check if current user WOULD receive this in real life
  const wouldReceive = shouldNotify(scenario === 'ORDER_SCHEDULED' || scenario === 'ORDER_COMPLETED' ? 'ORDER_STATUS_CHANGE' : scenario, scenario === 'ORDER_SCHEDULED' ? 'scheduled' : (scenario === 'ORDER_COMPLETED' ? 'completed' : 'created'));
  
  if (!wouldReceive) {
    message += `\n\n⚠️ Note: Your current role (${role}) would NOT normally receive this notification.`;
  }

  sendNotification(title, message, type);
  return true;
};

export default {
  loadNotificationConfig,
  saveNotificationConfig,
  startNotificationService,
  stopNotificationService,
  testTelegramNotification,
  simulateNotification
};
