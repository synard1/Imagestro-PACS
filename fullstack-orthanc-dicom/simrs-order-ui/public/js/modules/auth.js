/**
 * Authentication Module
 *
 * This module handles all authentication-related functionality including
 * login, logout, token management, authentication state, and user session
 * management. It provides a clean interface for authentication operations
 * and integrates with the API service and storage utilities.
 *
 * @version 1.0.0
 * @author SIMRS Order UI Team
 */

import { AuthApi } from "../services/api.js";
import { AuthStorage } from "../utils/storage.js";
import {
  showToast,
  setValue,
  getValue,
  toggleVisibility,
  toggleEnabled,
} from "../utils/dom.js";
import { APP_CONFIG } from "../config/constants.js";

/**
 * Authentication Manager class
 */
class AuthManager {
  constructor() {
    this.isAuthenticated = false;
    this.currentUser = null;
    this.loginAttempts = 0;
    this.maxLoginAttempts = APP_CONFIG.AUTH.MAX_LOGIN_ATTEMPTS;
    this.lockoutTime = APP_CONFIG.AUTH.LOCKOUT_TIME;
    this.lockoutEndTime = null;
    this.authStateListeners = [];

    this.init();
  }

  /**
   * Initialize authentication manager
   */
  init() {
    this.checkAuthState();
    this.setupEventListeners();
    this.checkLockoutStatus();
  }

  /**
   * Check current authentication state
   */
  checkAuthState() {
    const token = AuthStorage.getToken();
    this.isAuthenticated = !!token;

    if (this.isAuthenticated) {
      // Restore user data if available
      const userData = AuthStorage.getUser();
      if (userData) {
        this.currentUser = userData;
      }
      this.showAuthenticatedState();
    } else {
      this.showUnauthenticatedState();
    }

    this.notifyAuthStateChange();
  }

  /**
   * Setup event listeners for authentication forms
   */
  setupEventListeners() {
    // Login form submission
    const loginForm = document.querySelector("#loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Login button click
    const loginButton = document.querySelector("#loginButton");
    if (loginButton) {
      loginButton.addEventListener("click", (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Logout button click
    const logoutButton = document.querySelector("#logoutButton");
    if (logoutButton) {
      logoutButton.addEventListener("click", (e) => {
        e.preventDefault();
        this.handleLogout();
      });
    }

    // Enter key on password field
    const passwordField = document.querySelector("#password");
    if (passwordField) {
      passwordField.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.handleLogin();
        }
      });
    }

    // Clear error messages on input
    const usernameField = document.querySelector("#username");
    if (usernameField) {
      usernameField.addEventListener("input", () => {
        this.clearLoginErrors();
      });
    }

    if (passwordField) {
      passwordField.addEventListener("input", () => {
        this.clearLoginErrors();
      });
    }
  }

  /**
   * Login with username and password
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} - Login result
   */
  async login(username, password) {
    try {
      // Check if account is locked
      if (this.isAccountLocked()) {
        const remainingTime = Math.ceil(
          (this.lockoutEndTime - Date.now()) / 1000 / 60
        );
        return {
          success: false,
          error: `Akun terkunci. Coba lagi dalam ${remainingTime} menit.`
        };
      }

      // Validate input
      if (!this.validateLoginInput(username, password)) {
        return {
          success: false,
          error: "Username dan password harus diisi"
        };
      }

      // Attempt login
      const result = await AuthApi.login(username, password);

      if (result.success) {
        this.handleLoginSuccess(result.data);
        return { success: true, data: result.data };
      } else {
        this.handleLoginError(result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error("Login error:", error);
      this.handleLoginError("Login gagal. Silakan coba lagi.");
      return { success: false, error: "Login gagal. Silakan coba lagi." };
    }
  }

  /**
   * Handle login process
   */
  async handleLogin() {
    try {
      // Check if account is locked
      if (this.isAccountLocked()) {
        const remainingTime = Math.ceil(
          (this.lockoutEndTime - Date.now()) / 1000 / 60
        );
        showToast(
          `Akun terkunci. Coba lagi dalam ${remainingTime} menit.`,
          APP_CONFIG.TOAST_TYPES.ERROR
        );
        return;
      }

      // Get form values
      const username = getValue("#username");
      const password = getValue("#password");

      // Validate input
      if (!this.validateLoginInput(username, password)) {
        return;
      }

      // Show loading state
      this.setLoginLoadingState(true);

      // Attempt login
      const result = await AuthApi.login(username, password);

      if (result.success) {
        this.handleLoginSuccess(result.data);
      } else {
        this.handleLoginError(result.error);
      }
    } catch (error) {
      console.error("Login error:", error);
      this.handleLoginError(APP_CONFIG.ERROR_MESSAGES.LOGIN_FAILED);
    } finally {
      this.setLoginLoadingState(false);
    }
  }

  /**
   * Validate login input
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {boolean} - Validation result
   */
  validateLoginInput(username, password) {
    this.clearLoginErrors();

    if (!username || !username.trim()) {
      this.showLoginError("Username wajib diisi");
      document.querySelector("#username")?.focus();
      return false;
    }

    if (!password) {
      this.showLoginError("Password wajib diisi");
      document.querySelector("#password")?.focus();
      return false;
    }

    if (username.trim().length < 3) {
      this.showLoginError("Username minimal 3 karakter");
      document.querySelector("#username")?.focus();
      return false;
    }

    if (password.length < 4) {
      this.showLoginError("Password minimal 4 karakter");
      document.querySelector("#password")?.focus();
      return false;
    }

    return true;
  }

  /**
   * Handle successful login
   * @param {Object} userData - User data from login response
   */
  handleLoginSuccess(userData) {
    this.isAuthenticated = true;
    this.currentUser = userData;
    this.loginAttempts = 0;
    this.lockoutEndTime = null;

    // Store user data in localStorage for persistence
    if (userData) {
      AuthStorage.setUser(userData);
      AuthStorage.setLoginTime(new Date().toISOString());
    }

    // Clear login form
    this.clearLoginForm();

    // Show success message
    showToast(
      APP_CONFIG.SUCCESS_MESSAGES.LOGIN_SUCCESS,
      APP_CONFIG.TOAST_TYPES.SUCCESS
    );

    // Update UI state
    this.showAuthenticatedState();
    this.notifyAuthStateChange();

    console.log("Login successful:", userData);
  }

  /**
   * Handle login error
   * @param {string} errorMessage - Error message
   */
  handleLoginError(errorMessage) {
    this.loginAttempts++;

    // Check if should lock account
    if (this.loginAttempts >= this.maxLoginAttempts) {
      this.lockoutEndTime = Date.now() + this.lockoutTime;
      this.showLoginError(
        `Terlalu banyak percobaan login. Akun dikunci selama ${
          this.lockoutTime / 1000 / 60
        } menit.`
      );
    } else {
      const remainingAttempts = this.maxLoginAttempts - this.loginAttempts;
      this.showLoginError(
        `${errorMessage}. Sisa percobaan: ${remainingAttempts}`
      );
    }

    // Clear password field
    setValue("#password", "");
    document.querySelector("#username")?.focus();
  }

  /**
   * Logout method for programmatic use (no confirmation dialog)
   */
  async logout() {
    try {
      // Perform logout
      const success = await AuthApi.logout();

      if (success) {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.loginAttempts = 0;
        this.lockoutEndTime = null;

        // Clear all stored authentication data
        AuthStorage.clearAll();

        // Update UI state
        this.showUnauthenticatedState();
        this.notifyAuthStateChange();

        console.log("Logout successful");
      } else {
        console.warn("Logout API call failed, but clearing local session");
        // Clear local session even if API call fails
        this.isAuthenticated = false;
        this.currentUser = null;
        AuthStorage.clearAll();
        this.showUnauthenticatedState();
        this.notifyAuthStateChange();
      }
    } catch (error) {
      console.error("Logout error:", error);
      // Clear local session even if there's an error
      this.isAuthenticated = false;
      this.currentUser = null;
      AuthStorage.clearAll();
      this.showUnauthenticatedState();
      this.notifyAuthStateChange();
    }
  }

  /**
   * Handle logout process (with confirmation dialog)
   */
  async handleLogout() {
    try {
      // Show confirmation dialog
      if (!confirm("Apakah Anda yakin ingin keluar?")) {
        return;
      }

      // Call the logout method
      await this.logout();

      // Show success message
      showToast(
        APP_CONFIG.SUCCESS_MESSAGES.LOGOUT_SUCCESS,
        APP_CONFIG.TOAST_TYPES.SUCCESS
      );
    } catch (error) {
      console.error("Logout error:", error);
      showToast("Terjadi kesalahan saat logout", APP_CONFIG.TOAST_TYPES.ERROR);
    }
  }

  /**
   * Check if account is locked
   * @returns {boolean} - Lock status
   */
  isAccountLocked() {
    if (!this.lockoutEndTime) {
      return false;
    }

    if (Date.now() >= this.lockoutEndTime) {
      this.lockoutEndTime = null;
      this.loginAttempts = 0;
      return false;
    }

    return true;
  }

  /**
   * Check lockout status on initialization
   */
  checkLockoutStatus() {
    // This could be enhanced to persist lockout state in localStorage
    // For now, lockout is only maintained during the session
  }

  /**
   * Set login loading state
   * @param {boolean} isLoading - Loading state
   */
  setLoginLoadingState(isLoading) {
    const loginButton = document.querySelector("#loginButton");
    const usernameField = document.querySelector("#username");
    const passwordField = document.querySelector("#password");

    if (loginButton) {
      toggleEnabled(loginButton, !isLoading);
      loginButton.textContent = isLoading ? "Masuk..." : "Masuk";
    }

    if (usernameField) {
      toggleEnabled(usernameField, !isLoading);
    }

    if (passwordField) {
      toggleEnabled(passwordField, !isLoading);
    }
  }

  /**
   * Show login error message
   * @param {string} message - Error message
   */
  showLoginError(message) {
    const errorElement = document.querySelector("#loginError");
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = "block";
    } else {
      showToast(message, APP_CONFIG.TOAST_TYPES.ERROR);
    }
  }

  /**
   * Clear login error messages
   */
  clearLoginErrors() {
    const errorElement = document.querySelector("#loginError");
    if (errorElement) {
      errorElement.textContent = "";
      errorElement.style.display = "none";
    }
  }

  /**
   * Clear login form
   */
  clearLoginForm() {
    setValue("#username", "");
    setValue("#password", "");
    this.clearLoginErrors();
  }

  /**
   * Show authenticated state UI
   */
  showAuthenticatedState() {
    // Hide login section
    toggleVisibility("#loginSection", false);

    // Show main application
    toggleVisibility("#mainApp", true);

    // Show logout button
    toggleVisibility("#logoutButton", true);

    // Update user info if available
    if (this.currentUser) {
      const userInfoElement = document.querySelector("#userInfo");
      if (userInfoElement) {
        userInfoElement.textContent = this.currentUser.username || "User";
      }
    }
  }

  /**
   * Show unauthenticated state UI
   */
  showUnauthenticatedState() {
    // Show login section
    toggleVisibility("#loginSection", true);

    // Hide main application
    toggleVisibility("#mainApp", false);

    // Hide logout button
    toggleVisibility("#logoutButton", false);

    // Clear user info
    const userInfoElement = document.querySelector("#userInfo");
    if (userInfoElement) {
      userInfoElement.textContent = "";
    }

    // Focus on username field
    setTimeout(() => {
      document.querySelector("#username")?.focus();
    }, 100);
  }

  /**
   * Add authentication state change listener
   * @param {Function} callback - Callback function
   */
  addAuthStateListener(callback) {
    if (typeof callback === "function") {
      this.authStateListeners.push(callback);
    }
  }

  /**
   * Remove authentication state change listener
   * @param {Function} callback - Callback function
   */
  removeAuthStateListener(callback) {
    const index = this.authStateListeners.indexOf(callback);
    if (index > -1) {
      this.authStateListeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of authentication state change
   */
  notifyAuthStateChange() {
    const authState = {
      isAuthenticated: this.isAuthenticated,
      user: this.currentUser,
    };

    this.authStateListeners.forEach((callback) => {
      try {
        callback(authState);
      } catch (error) {
        console.error("Auth state listener error:", error);
      }
    });
  }

  /**
   * Get current authentication state
   * @returns {Object} - Authentication state
   */
  getAuthState() {
    return {
      isAuthenticated: this.isAuthenticated,
      user: this.currentUser,
      token: AuthStorage.getToken(),
    };
  }

  /**
   * Check if user has specific permission
   * @param {string} permission - Permission to check
   * @returns {boolean} - Permission status
   */
  hasPermission(permission) {
    if (!this.isAuthenticated || !this.currentUser) {
      return false;
    }

    // This can be enhanced based on actual permission system
    const userPermissions = this.currentUser.permissions || [];
    return userPermissions.includes(permission);
  }

  /**
   * Validate authentication token
   * @param {string} token - Token to validate
   * @returns {Promise<boolean>} - Token validity status
   */
  async validateToken(token) {
    try {
      if (!token) {
        return false;
      }

      // Call the auth service to verify the token
      const response = await AuthApi.verifyToken(token);
      
      if (response && response.valid) {
        // Token is valid, update current user if payload is available
        if (response.payload) {
          this.currentUser = {
            id: response.payload.user_id,
            username: response.payload.username,
            role: response.payload.role,
            permissions: response.payload.permissions || []
          };
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Token validation error:", error);
      return false;
    }
  }

  /**
   * Refresh authentication token
   * @returns {Promise<boolean>} - Refresh success status
   */
  async refreshToken() {
    try {
      // This would typically call a refresh token endpoint
      // For now, just check if current token is still valid
      const token = AuthStorage.getToken();
      if (!token) {
        this.handleLogout();
        return false;
      }

      return true;
    } catch (error) {
      console.error("Token refresh error:", error);
      this.handleLogout();
      return false;
    }
  }
}

// Create and export singleton instance
const authManager = new AuthManager();

// Export authentication utilities
export const Auth = {
  /**
   * Check if user is authenticated
   * @returns {boolean} - Authentication status
   */
  isAuthenticated() {
    return authManager.isAuthenticated;
  },

  /**
   * Get current user
   * @returns {Object|null} - Current user data
   */
  getCurrentUser() {
    return authManager.currentUser;
  },

  /**
   * Get authentication state
   * @returns {Object} - Authentication state
   */
  getAuthState() {
    return authManager.getAuthState();
  },

  /**
   * Login user
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} - Login result
   */
  async login(username, password) {
    return await authManager.login(username, password);
  },

  /**
   * Logout user
   * @returns {Promise<boolean>} - Logout success status
   */
  async logout() {
    await authManager.handleLogout();
    return !authManager.isAuthenticated;
  },

  /**
   * Add authentication state listener
   * @param {Function} callback - Callback function
   */
  onAuthStateChange(callback) {
    authManager.addAuthStateListener(callback);
  },

  /**
   * Remove authentication state listener
   * @param {Function} callback - Callback function
   */
  offAuthStateChange(callback) {
    authManager.removeAuthStateListener(callback);
  },

  /**
   * Check user permission
   * @param {string} permission - Permission to check
   * @returns {boolean} - Permission status
   */
  hasPermission(permission) {
    return authManager.hasPermission(permission);
  },

  /**
   * Refresh authentication token
   * @returns {Promise<boolean>} - Refresh success status
   */
  async refreshToken() {
    return authManager.refreshToken();
  },
};

export { authManager };
export { AuthManager }; // Export class for app.js compatibility
export default Auth;
