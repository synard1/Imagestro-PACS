import DOMPurify from 'dompurify'

/**
 * PWA Update Manager
 * Enhanced utilities for handling PWA updates with better debugging
 */

class PWAUpdateManager {
  constructor() {
    this.registration = null;
    this.updateAvailable = false;
    this.isUpdating = false;
  }

  /**
   * Initialize the update manager
   */
  async init() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWAUpdateManager] Service workers not supported');
      return false;
    }

    try {
      this.registration = await navigator.serviceWorker.getRegistration();
      
      if (!this.registration) {
        console.warn('[PWAUpdateManager] No service worker registration found');
        return false;
      }

      console.log('[PWAUpdateManager] Initialized with registration:', this.registration);
      this.setupEventListeners();
      return true;
    } catch (error) {
      console.error('[PWAUpdateManager] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Set up event listeners for service worker updates
   */
  setupEventListeners() {
    if (!this.registration) return;

    // Listen for new service worker installing
    this.registration.addEventListener('updatefound', () => {
      console.log('[PWAUpdateManager] Update found - new service worker installing');
      
      const newWorker = this.registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          console.log('[PWAUpdateManager] New service worker state:', newWorker.state);
          
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller && !this.updateAvailable) {
            console.log('[PWAUpdateManager] New service worker installed - update available');
            this.updateAvailable = true;
            
            // Small delay to ensure everything is ready
            setTimeout(() => {
              this.showUpdateNotification();
            }, 1000);
          }
        });
      }
    });

    // Listen for controller changes
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWAUpdateManager] Service worker controller changed');
      if (this.isUpdating) {
        console.log('[PWAUpdateManager] Update completed - reloading page');
        
        // Clear update state
        this.updateAvailable = false;
        this.isUpdating = false;
        
        // Remove any existing notifications
        const notification = document.querySelector('#pwa-update-notification');
        if (notification) {
          notification.remove();
        }
        
        // Reload page
        window.location.reload();
      }
    });
  }

  /**
   * Check for updates manually
   */
  async checkForUpdates() {
    if (!this.registration) {
      console.warn('[PWAUpdateManager] No registration available for update check');
      return false;
    }

    // Don't check if update already available or in progress
    if (this.updateAvailable || this.isUpdating) {
      console.log('[PWAUpdateManager] Update already available or in progress');
      return this.updateAvailable;
    }

    try {
      console.log('[PWAUpdateManager] Checking for updates...');
      await this.registration.update();
      
      if (this.registration.waiting) {
        console.log('[PWAUpdateManager] Update available (waiting service worker found)');
        this.updateAvailable = true;
        
        // Only show notification if not already shown
        if (!document.querySelector('#pwa-update-notification')) {
          this.showUpdateNotification();
        }
        return true;
      }

      console.log('[PWAUpdateManager] No updates available');
      return false;
    } catch (error) {
      console.error('[PWAUpdateManager] Update check failed:', error);
      return false;
    }
  }

  /**
   * Apply the pending update
   */
  async applyUpdate() {
    if (!this.registration || !this.registration.waiting) {
      throw new Error('No pending update available');
    }

    if (this.isUpdating) {
      throw new Error('Update already in progress');
    }

    try {
      console.log('[PWAUpdateManager] Starting update process...');
      this.isUpdating = true;

      // Send skip waiting message to the waiting service worker
      console.log('[PWAUpdateManager] Sending SKIP_WAITING message');
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

      // The controllerchange event will handle the reload
      console.log('[PWAUpdateManager] Waiting for new service worker to take control...');
      
    } catch (error) {
      this.isUpdating = false;
      console.error('[PWAUpdateManager] Failed to apply update:', error);
      throw error;
    }
  }

  /**
   * Show update notification
   */
  showUpdateNotification() {
    // Prevent showing multiple notifications
    if (document.querySelector('#pwa-update-notification')) {
      console.log('[PWAUpdateManager] Update notification already visible');
      return;
    }

    // Don't show on login page
    const currentPath = window.location.pathname;
    const isLoginPage = currentPath === '/login' || currentPath === '/';
    
    if (isLoginPage) {
      console.log('[PWAUpdateManager] Deferring update notification on login page');
      localStorage.setItem('pwa-update-pending', 'true');
      return;
    }

    const notification = document.createElement('div');
    notification.id = 'pwa-update-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3);
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      max-width: 320px;
      animation: slideIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    `;

    notification.innerHTML = DOMPurify.sanitize(`
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L3 9h4v7h6V9h4l-7-7z"/>
          </svg>
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px;">Update Available</div>
          <div style="opacity: 0.9; font-size: 13px;">A new version is ready to install</div>
        </div>
      </div>
      
      <div style="display: flex; gap: 8px; margin-top: 16px;">
        <button id="pwa-update-btn" style="
          flex: 1;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        ">
          Update Now
        </button>
        <button id="pwa-dismiss-btn" style="
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          opacity: 0.8;
        ">
          Later
        </button>
      </div>
    `);

    // Add animation styles
    if (!document.querySelector('#pwa-update-animations')) {
      const style = document.createElement('style');
      style.id = 'pwa-update-animations';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%) scale(0.8); opacity: 0; }
          to { transform: translateX(0) scale(1); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Handle update button click
    notification.querySelector('#pwa-update-btn').addEventListener('click', async () => {
      const updateBtn = notification.querySelector('#pwa-update-btn');
      const originalText = updateBtn.textContent;
      
      // Prevent multiple clicks
      if (updateBtn.disabled || this.isUpdating) {
        console.log('[PWAUpdateManager] Update already in progress');
        return;
      }
      
      try {
        updateBtn.textContent = 'Updating...';
        updateBtn.disabled = true;
        updateBtn.style.opacity = '0.6';
        
        // Hide notification immediately to prevent confusion
        notification.style.display = 'none';
        
        await this.applyUpdate();
        
        // Don't show success message since page will reload
        console.log('[PWAUpdateManager] Update applied, page will reload');
        
      } catch (error) {
        console.error('[PWAUpdateManager] Update failed:', error);
        
        // Show notification again with error state
        notification.style.display = 'flex';
        updateBtn.textContent = 'Update Failed - Try Again';
        updateBtn.style.background = 'rgba(239, 68, 68, 0.8)';
        
        setTimeout(() => {
          updateBtn.textContent = originalText;
          updateBtn.disabled = false;
          updateBtn.style.opacity = '1';
          updateBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        }, 3000);
      }
    });

    // Handle dismiss button click
    notification.querySelector('#pwa-dismiss-btn').addEventListener('click', () => {
      notification.remove();
    });

    // Auto-dismiss after 30 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 30000);
  }

  /**
   * Force check for updates (for debugging)
   */
  async forceUpdate() {
    console.log('[PWAUpdateManager] Force checking for updates...');
    
    if (!this.registration) {
      await this.init();
    }

    // Force update check
    await this.checkForUpdates();
    
    // If no waiting worker, try to trigger one by updating registration
    if (!this.registration.waiting) {
      console.log('[PWAUpdateManager] No waiting worker, forcing registration update...');
      try {
        await this.registration.unregister();
        window.location.reload();
      } catch (error) {
        console.error('[PWAUpdateManager] Failed to force update:', error);
      }
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      hasRegistration: !!this.registration,
      updateAvailable: this.updateAvailable,
      isUpdating: this.isUpdating,
      hasWaitingWorker: !!(this.registration && this.registration.waiting),
      hasActiveWorker: !!(this.registration && this.registration.active),
      hasInstallingWorker: !!(this.registration && this.registration.installing)
    };
  }
}

// Create singleton instance
const pwaUpdateManager = new PWAUpdateManager();

// Auto-initialize
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    pwaUpdateManager.init();
  });
  
  // Make it globally accessible for debugging
  window.pwaUpdateManager = pwaUpdateManager;
}

export default pwaUpdateManager;