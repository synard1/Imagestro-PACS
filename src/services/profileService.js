/**
 * Profile Service
 * Handles user profile management operations
 */

import { apiClient } from './http';
import { loadRegistry } from './api-registry';
import { getCurrentUser, setCurrentUser } from './rbac';
import { logger } from '../utils/logger';

/**
 * Get current user's profile
 * @returns {Promise<Object>} User profile data
 */
export const getProfile = async () => {
  const currentUser = getCurrentUser();
  
  if (!currentUser || !currentUser.id) {
    throw new Error('No authenticated user found');
  }

  const registry = loadRegistry();
  const usersConfig = registry.users;

  if (!usersConfig || !usersConfig.enabled) {
    // Return current user data from localStorage if backend is not enabled
    return currentUser;
  }

  try {
    const client = apiClient('users');
    const response = await client.get(`/auth/users/${currentUser.id}`);
    return response.user || response;
  } catch (error) {
    logger.error('[profileService] Failed to fetch profile:', error);
    // Fallback to localStorage data
    return currentUser;
  }
};

/**
 * Update current user's profile
 * @param {Object} profileData - Updated profile data
 * @returns {Promise<Object>} Updated profile
 */
export const updateUser = async (profileData) => {
  const currentUser = getCurrentUser();
  
  if (!currentUser || !currentUser.id) {
    throw new Error('No authenticated user found');
  }

  const registry = loadRegistry();
  const usersConfig = registry.users;

  if (!usersConfig || !usersConfig.enabled) {
    // Update localStorage if backend is not enabled
    const updatedUser = {
      ...currentUser,
      ...profileData,
      // Map full_name to name for compatibility
      name: profileData.full_name || currentUser.name,
      phone: profileData.phone_number || currentUser.phone
    };
    setCurrentUser(updatedUser);
    return updatedUser;
  }

  try {
    const client = apiClient('users');
    const response = await client.put(`/auth/users/${currentUser.id}`, profileData);
    
    // Update current user in localStorage
    const updatedUser = response.user || response;
    // Ensure backward compatibility with old field names
    updatedUser.name = updatedUser.full_name || updatedUser.name;
    updatedUser.phone = updatedUser.phone_number || updatedUser.phone;
    
    setCurrentUser(updatedUser);
    
    return updatedUser;
  } catch (error) {
    logger.error('[profileService] Failed to update profile:', error);
    throw error;
  }
};

/**
 * Change current user's password
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} Success response
 */
export const changeUserPassword = async (currentPassword, newPassword) => {
  const currentUser = getCurrentUser();
  
  if (!currentUser || !currentUser.id) {
    throw new Error('No authenticated user found');
  }

  const registry = loadRegistry();
  const usersConfig = registry.users;

  if (!usersConfig || !usersConfig.enabled) {
    throw new Error('Password change requires backend authentication');
  }

  try {
    const client = apiClient('users');
    const response = await client.post(`/auth/users/${currentUser.id}/change-password`, {
      current_password: currentPassword,
      new_password: newPassword
    });
    
    return response;
  } catch (error) {
    logger.error('[profileService] Failed to change password:', error);
    throw error;
  }
};

/**
 * Upload profile picture
 * @param {File} file - Image file
 * @returns {Promise<Object>} Upload response with image URL
 */
export const uploadProfilePicture = async (file) => {
  const currentUser = getCurrentUser();
  
  if (!currentUser || !currentUser.id) {
    throw new Error('No authenticated user found');
  }

  const registry = loadRegistry();
  const usersConfig = registry.users;

  if (!usersConfig || !usersConfig.enabled) {
    throw new Error('Profile picture upload requires backend');
  }

  try {
    const formData = new FormData();
    formData.append('file', file);

    const client = apiClient('users');
    const response = await client.post(
      `/auth/users/${currentUser.id}/profile-picture`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    
    // Update current user with new profile picture URL
    const updatedUser = {
      ...currentUser,
      profilePicture: response.url || response.profile_picture
    };
    setCurrentUser(updatedUser);
    
    return response;
  } catch (error) {
    logger.error('[profileService] Failed to upload profile picture:', error);
    throw error;
  }
};

/**
 * Delete profile picture
 * @returns {Promise<Object>} Success response
 */
export const deleteProfilePicture = async () => {
  const currentUser = getCurrentUser();
  
  if (!currentUser || !currentUser.id) {
    throw new Error('No authenticated user found');
  }

  const registry = loadRegistry();
  const usersConfig = registry.users;

  if (!usersConfig || !usersConfig.enabled) {
    throw new Error('Profile picture deletion requires backend');
  }

  try {
    const client = apiClient('users');
    const response = await client.delete(`/auth/users/${currentUser.id}/profile-picture`);
    
    // Update current user to remove profile picture
    const updatedUser = {
      ...currentUser,
      profilePicture: null
    };
    setCurrentUser(updatedUser);
    
    return response;
  } catch (error) {
    logger.error('[profileService] Failed to delete profile picture:', error);
    throw error;
  }
};

/**
 * Get user activity log
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Activity log
 */
export const getUserActivity = async (params = {}) => {
  const currentUser = getCurrentUser();
  
  if (!currentUser || !currentUser.id) {
    throw new Error('No authenticated user found');
  }

  const registry = loadRegistry();
  const auditConfig = registry.audit;

  if (!auditConfig || !auditConfig.enabled) {
    return { activities: [], total: 0 };
  }

  try {
    const queryParams = new URLSearchParams({
      user_id: currentUser.id,
      page: params.page || 1,
      limit: params.limit || 20,
      ...(params.action && { action: params.action }),
      ...(params.from_date && { from_date: params.from_date }),
      ...(params.to_date && { to_date: params.to_date })
    });

    const client = apiClient('audit');
    const response = await client.get(`/audit/logs?${queryParams}`);
    
    return response;
  } catch (error) {
    logger.error('[profileService] Failed to fetch user activity:', error);
    return { activities: [], total: 0 };
  }
};

export default {
  getProfile,
  updateUser,
  changeUserPassword,
  uploadProfilePicture,
  deleteProfilePicture,
  getUserActivity
};
