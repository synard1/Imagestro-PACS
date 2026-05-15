/**
 * Real-time Health Monitoring Service
 * Uses WebSockets via Cloudflare Durable Objects with HTTP Polling fallback.
 */

class RealtimeHealthService {
  constructor() {
    this.ws = null;
    this.listeners = new Set();
    this.status = { status: 'unknown', services: {} };
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.pollingInterval = null;
    this.useWebSocket = true;
    
    // Determine the base URL for API and WS
    const isProd = !window.location.hostname.includes('localhost');
    this.apiBase = isProd ? '' : (import.meta.env.VITE_MAIN_API_BACKEND_URL || '');
    
    // If we have a full URL for API, convert it to WSS
    let wsHost;
    if (this.apiBase.startsWith('http')) {
      wsHost = this.apiBase.replace('http', 'ws');
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsHost = `${protocol}//${window.location.host}`;
    }
    this.wsUrl = `${wsHost}/ws/health`;
  }

  /**
   * Start the monitoring service
   */
  start() {
    if (this.useWebSocket) {
      this.connectWebSocket();
    } else {
      this.startPolling();
    }
  }

  /**
   * Connect to Cloudflare Durable Object via WebSocket
   */
  connectWebSocket() {
    if (this.ws) this.ws.close();

    console.log(`[HealthService] Connecting to ${this.wsUrl}...`);
    
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[HealthService] WebSocket Connected');
        this.reconnectAttempts = 0;
        this.stopPolling();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'INITIAL_STATE' || message.type === 'HEALTH_UPDATE') {
            this.updateStatus(message.data);
          }
        } catch (e) {
          console.error('[HealthService] Failed to parse message:', e);
        }
      };

      this.ws.onclose = () => {
        console.warn('[HealthService] WebSocket Closed');
        this.handleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[HealthService] WebSocket Error:', err);
        this.ws.close();
      };
    } catch (e) {
      console.error('[HealthService] WebSocket initialization failed:', e);
      this.handleReconnect();
    }
  }

  /**
   * Fallback to Polling if WebSocket fails
   */
  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`[HealthService] Reconnecting in ${delay}ms...`);
      setTimeout(() => this.connectWebSocket(), delay);
    } else {
      console.error('[HealthService] Max reconnect attempts reached. Falling back to polling.');
      this.useWebSocket = false;
      this.startPolling();
    }
  }

  /**
   * Standard HTTP Polling (Legacy/Fallback)
   */
  async startPolling() {
    if (this.pollingInterval) return;
    
    console.log('[HealthService] Starting HTTP Polling fallback...');
    const poll = async () => {
      try {
        const res = await fetch(`${this.apiBase}/api/health`, { cache: 'no-cache' });
        if (res.ok) {
          const data = await res.json();
          this.updateStatus(data);
        }
      } catch (e) {
        console.warn('[HealthService] Polling failed:', e.message);
      }
    };

    poll();
    this.pollingInterval = setInterval(poll, 20000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  updateStatus(newStatus) {
    this.status = newStatus;
    this.notifyListeners();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    // Send immediate current status
    callback(this.status);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    this.listeners.forEach(cb => cb(this.status));
  }

  getStatus() {
    return this.status;
  }

  /**
   * Get historical data
   */
  async getHistory() {
    try {
      const res = await fetch(`${this.apiBase}/api/health/history`);
      return await res.json();
    } catch (e) {
      return [];
    }
  }
}

const realtimeHealthService = new RealtimeHealthService();
export default realtimeHealthService;
