/**
 * Core singleton event bus for order-related events.
 * Provides a backend-agnostic mechanism for real-time communication.
 */
class OrderEventBus {
  constructor() {
    this.listeners = new Map();
  }

  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.unsubscribe(event, callback);
  }

  unsubscribe(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  publish(event, payload) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`Error in subscriber for event ${event}:`, error);
        }
      });
    }
  }
}

const instance = new OrderEventBus();
export default instance;
