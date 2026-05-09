/**
 * PWA Manager utility for handling service worker registration and PWA functionality
 * This is a basic implementation that will be expanded in subsequent tasks
 */

class PWAManager {
  constructor() {
    this.registration = null;
    this.isOnline = navigator.onLine;
    this.installPromptEvent = null;
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('[PWA Manager] App is online');
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('[PWA Manager] App is offline');
    });
    
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPromptEvent = e;
      console.log('[PWA Manager] Install prompt available');
    });
  }

  /**
   * Register the service worker
   * @returns {Promise<ServiceWorkerRegistration>}
   */
  async register() {
    if ('serviceWorker' in navigator) {
      try {
        this.registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });
        
        console.log('[PWA Manager] Service worker registered successfully');
        
        // Listen for updates
        this.registration.addEventListener('updatefound', () => {
          console.log('[PWA Manager] Service worker update found');
        });
        
        return this.registration;
      } catch (error) {
        console.error('[PWA Manager] Service worker registration failed:', error);
        throw error;
      }
    } else {
      throw new Error('Service workers are not supported');
    }
  }

  /**
   * Check if there's an update available
   * @returns {Promise<boolean>}
   */
  async checkForUpdates() {
    if (this.registration) {
      await this.registration.update();
      return !!this.registration.waiting;
    }
    return false;
  }

  /**
   * Show the install prompt if available
   * @returns {Promise<void>}
   */
  async showInstallPrompt() {
    if (this.installPromptEvent) {
      const result = await this.installPromptEvent.prompt();
      console.log('[PWA Manager] Install prompt result:', result);
      this.installPromptEvent = null;
    } else {
      console.log('[PWA Manager] Install prompt not available');
    }
  }

  /**
   * Get the current network status
   * @returns {boolean}
   */
  getNetworkStatus() {
    return this.isOnline;
  }

  /**
   * Check if the app is installed as PWA
   * @returns {boolean}
   */
  isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }
}

// Export singleton instance
export const pwaManager = new PWAManager();
export default PWAManager;