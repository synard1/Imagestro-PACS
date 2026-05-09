/**
 * Stagnant Order Service
 * Checks for stagnant orders when Orders page is accessed
 * Sends notifications and shows toast alerts
 */

import { logger } from '../utils/logger';
import { notify } from './notifications';
import { sendBatchOrderNotifications } from './notificationBackendService';
import orderService from './orderService';

// Track last check time to avoid duplicate notifications (3-hour cooldown)
let lastStagnantCheckTime = 0;
const STAGNANT_CHECK_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours

// Stagnant threshold in hours
const STAGNANT_THRESHOLD_HOURS = 6;

// Track orders already notified to prevent duplicates
const notifiedOrderIds = new Set();

// Track if check is in progress to prevent concurrent calls
let isCheckInProgress = false;

/**
 * Check for stagnant orders and send notifications
 * Called when Orders page is accessed
 */
export const checkStagnantOrders = async () => {
  try {
    // Prevent concurrent calls
    if (isCheckInProgress) {
      logger.debug('[stagnantOrderService] Check already in progress, skipping');
      return;
    }
    
    const now = Date.now();
    
    // Check cooldown to avoid duplicate notifications
    if (now - lastStagnantCheckTime < STAGNANT_CHECK_COOLDOWN_MS) {
      logger.debug('[stagnantOrderService] Cooldown active, skipping check');
      return;
    }
    
    isCheckInProgress = true;
    logger.info('[stagnantOrderService] Checking for stagnant orders...');
    
    // Get all orders
    const orders = await orderService.listOrders();
    
    if (!orders || orders.length === 0) {
      logger.debug('[stagnantOrderService] No orders found');
      return;
    }
    
    // Find stagnant orders
    const stagnantOrders = findStagnantOrders(orders);
    
    if (stagnantOrders.length === 0) {
      logger.debug('[stagnantOrderService] No stagnant orders found');
      return;
    }
    
    logger.warn(`[stagnantOrderService] Found ${stagnantOrders.length} stagnant order(s)`);
    
    // Update last check time
    lastStagnantCheckTime = now;
    
    // OPTIMIZED: Send batch notifications instead of individual ones
    await sendBatchStagnantOrderNotifications(stagnantOrders);
    
    // Show summary toast
    if (stagnantOrders.length === 1) {
      notify({
        type: 'warning',
        message: `⚠️ 1 stagnant order detected: ${stagnantOrders[0].order_number || stagnantOrders[0].id}`,
        duration: 8000
      });
    } else {
      notify({
        type: 'warning',
        message: `⚠️ ${stagnantOrders.length} stagnant orders detected. Check details for more info.`,
        duration: 8000
      });
    }
    
  } catch (error) {
    // logger.error('[stagnantOrderService] Error checking stagnant orders:', error);
    // Don't show error to user - this is a background check
  } finally {
    isCheckInProgress = false;
  }
};

/**
 * Find stagnant orders from list
 * Stagnant = not completed/cancelled/delivered/created/draft AND last update > 6 hours ago
 * For RESCHEDULED orders: only flag as stagnant if scheduled_at has passed
 */
function findStagnantOrders(orders) {
  const now = new Date();
  const stagnantThresholdMs = STAGNANT_THRESHOLD_HOURS * 60 * 60 * 1000;
  
  return orders.filter(order => {
    // Skip completed or cancelled orders
    const status = (order.status || order.order_status || '').toLowerCase();
    if (['completed', 'cancelled', 'delivered', 'created', 'draft'].includes(status)) {
      return false;
    }
    
    // Special handling for RESCHEDULED orders
    if (status === 'rescheduled') {
      // Only flag as stagnant if scheduled_at has passed
      if (order.scheduled_at) {
        const scheduledDate = new Date(order.scheduled_at);
        if (scheduledDate > now) {
          // Future appointment - not stagnant
          return false;
        }
      }
    }
    
    // Check if last update is older than threshold
    const lastUpdate = new Date(order.updated_at || order.created_at);
    const timeSinceUpdate = now - lastUpdate;
    
    return timeSinceUpdate > stagnantThresholdMs;
  });
}

/**
 * Send batch notifications for stagnant orders (OPTIMIZED)
 * Uses minimal payload - backend fetches full order details for security
 */
async function sendBatchStagnantOrderNotifications(orders) {
  try {
    if (!orders || orders.length === 0) {
      return;
    }
    
    // Filter out already-notified orders
    const ordersToNotify = orders.filter(order => !notifiedOrderIds.has(order.id));
    
    if (ordersToNotify.length === 0) {
      logger.debug('[stagnantOrderService] All orders already notified, skipping');
      return;
    }
    
    logger.info(`[stagnantOrderService] Sending batch notification for ${ordersToNotify.length} stagnant order(s)`);
    
    const now = new Date();
    
    // Build minimal payloads (OPTIMIZED - backend fetches full details)
    const notificationPayloads = ordersToNotify.map(order => {
      const lastUpdate = new Date(order.updated_at || order.created_at);
      const stagnantHours = (now - lastUpdate) / (60 * 60 * 1000);
      
      return {
        order_id: order.id,
        notification_type: 'STAGNANT_ORDER',
        // Optional: Include for better logging/tracking (not required by backend)
        stagnant_hours: stagnantHours.toFixed(1),
        last_updated_at: lastUpdate.toISOString()
      };
    });
    
    // Send batch notification
    const result = await sendBatchOrderNotifications(notificationPayloads);
    
    if (result && result.success) {
      const sentCount = result.sent || ordersToNotify.length;
      logger.info(`[stagnantOrderService] Batch notification sent successfully (${sentCount}/${ordersToNotify.length})`);
      
      // Mark all as notified to prevent duplicates
      ordersToNotify.forEach(order => notifiedOrderIds.add(order.id));
      
      // Log details if available
      if (result.results) {
        const failed = result.results.filter(r => !r.success);
        if (failed.length > 0) {
          logger.warn(`[stagnantOrderService] ${failed.length} notification(s) failed`);
        }
      }
    } else {
      logger.warn(`[stagnantOrderService] Batch notification failed: ${result?.error || 'Unknown error'}`);
    }
  } catch (error) {
    logger.error('[stagnantOrderService] Error sending batch notifications:', error);
  }
}

/**
 * Reset cooldown (for testing)
 */
export const resetCooldown = () => {
  lastStagnantCheckTime = 0;
  logger.info('[stagnantOrderService] Cooldown reset');
};

/**
 * Get last check time
 */
export const getLastCheckTime = () => {
  return lastStagnantCheckTime;
};

/**
 * Get cooldown remaining time in minutes
 */
export const getCooldownRemaining = () => {
  const now = Date.now();
  const remaining = STAGNANT_CHECK_COOLDOWN_MS - (now - lastStagnantCheckTime);
  return Math.max(0, Math.ceil(remaining / 60000)); // Convert to minutes
};

export default {
  checkStagnantOrders,
  resetCooldown,
  getLastCheckTime,
  getCooldownRemaining
};
