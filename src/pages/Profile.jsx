import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { updateUser, changeUserPassword } from '../services/profileService';
import { useToast } from '../components/ToastProvider';
import { useTranslation } from 'react-i18next';

export default function Profile() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { t, i18n } = useTranslation();

  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Profile form state
  const [profileData, setProfileData] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    whatsapp: '',
    telegram: '',
    details: {}
  });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [passwordErrors, setPasswordErrors] = useState({});

  // Load user data
  useEffect(() => {
    if (currentUser) {
      setProfileData({
        full_name: currentUser.full_name || currentUser.name || '',
        email: currentUser.email || '',
        phone_number: currentUser.phone_number || currentUser.phone || '',
        whatsapp: currentUser.whatsapp || '',
        telegram: currentUser.telegram || '',
        details: currentUser.details || {}
      });
    }
  }, [currentUser]);

  // Handle profile field changes
  const handleProfileChange = (field, value) => {
    // Special handling for telegram field
    if (field === 'telegram') {
      // Remove spaces and trim
      value = value.trim();
      
      // If it starts with @, ensure it's a valid username format
      if (value.startsWith('@')) {
        // Remove any non-alphanumeric characters except underscore after @
        value = '@' + value.slice(1).replace(/[^a-zA-Z0-9_]/g, '');
      } else if (value) {
        // If it's a number (ID), ensure it's only digits
        if (/^\d+$/.test(value)) {
          // Keep as is - it's a valid ID
        } else if (!/^@/.test(value) && /^[a-zA-Z0-9_]+$/.test(value)) {
          // If it's alphanumeric without @, add @ prefix
          value = '@' + value;
        }
      }
    }
    
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle password field changes
  const handlePasswordChange = (field, value) => {
    setPasswordData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear errors when user types
    if (passwordErrors[field]) {
      setPasswordErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  // Validate password form
  const validatePasswordForm = () => {
    const errors = {};

    if (!passwordData.currentPassword) {
      errors.currentPassword = 'Current password is required';
    }

    if (!passwordData.newPassword) {
      errors.newPassword = 'New password is required';
    } else if (passwordData.newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters';
    }

    if (!passwordData.confirmPassword) {
      errors.confirmPassword = 'Please confirm your new password';
    } else if (passwordData.newPassword !== passwordData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (passwordData.currentPassword && passwordData.newPassword && 
        passwordData.currentPassword === passwordData.newPassword) {
      errors.newPassword = 'New password must be different from current password';
    }

    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Validate Telegram format
  const validateTelegram = (telegram) => {
    if (!telegram) return true; // Optional field
    
    // Valid username format: @username (at least 5 chars after @)
    const usernamePattern = /^@[a-zA-Z0-9_]{5,}$/;
    // Valid ID format: numeric only (at least 5 digits)
    const idPattern = /^\d{5,}$/;
    
    return usernamePattern.test(telegram) || idPattern.test(telegram);
  };

  // Validate WhatsApp format
  const validateWhatsapp = (whatsapp) => {
    if (!whatsapp) return true; // Optional field
    // Must start with '+' and have at least 7 digits after it
    return /^\+\d{7,}$/.test(whatsapp);
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!currentUser?.id) {
      notify({ type: 'error', message: 'User ID not found' });
      return;
    }

    // Validate required fields
    if (!profileData.full_name || !profileData.email) {
      notify({ type: 'error', message: 'Full name and email are required' });
      return;
    }

    // Validate email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(profileData.email)) {
      notify({ type: 'error', message: 'Please enter a valid email address' });
      return;
    }

    // Validate WhatsApp format if provided
    if (profileData.whatsapp && !validateWhatsapp(profileData.whatsapp)) {
      notify({ type: 'error', message: 'Invalid WhatsApp number. It must start with a country code (e.g., +62).' });
      return;
    }

    // Validate Telegram format if provided
    if (profileData.telegram && !validateTelegram(profileData.telegram)) {
      notify({ type: 'error', message: 'Invalid Telegram format. Use @username (min 5 chars) or numeric ID (min 5 digits)' });
      return;
    }

    setSaving(true);
    try {
      await updateUser(profileData);
      notify({ type: 'success', message: 'Profile updated successfully' });
    } catch (error) {
      console.error('Failed to update profile:', error);
      notify({ type: 'error', message: 'Failed to update profile: ' + (error.message || 'Unknown error') });
    } finally {
      setSaving(false);
    }
  };

  // Change password
  const handleChangePassword = async () => {
    if (!validatePasswordForm()) {
      return;
    }

    if (!currentUser?.id) {
      notify({ type: 'error', message: 'User ID not found' });
      return;
    }

    setSaving(true);
    try {
      // changeUserPassword from profileService handles current password verification
      await changeUserPassword(passwordData.currentPassword, passwordData.newPassword);
      
      // Clear form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      notify({ type: 'success', message: 'Password changed successfully' });
    } catch (error) {
      console.error('Failed to change password:', error);
      
      const errorMessage = error.response?.data?.message || error.message || '';
      if (errorMessage.toLowerCase().includes('incorrect') && errorMessage.toLowerCase().includes('password')) {
        setPasswordErrors(prev => ({ ...prev, currentPassword: 'Current password is incorrect' }));
        notify({ type: 'error', message: 'Current password is incorrect' });
      } else {
        notify({ type: 'error', message: 'Failed to change password: ' + (error.message || 'Unknown error') });
      }
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: t('Profile Information'), icon: '👤' },
    { id: 'security', label: t('Security'), icon: '🔒' },
    { id: 'preferences', label: t('Settings'), icon: '⚙️' }
  ];

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('My Profile')}</h1>
          <p className="text-sm text-gray-600 mt-1">{t('Manage your account settings and preferences')}</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          ← {t('Back')}
        </button>
      </div>

      {/* User Info Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-blue-600">
              {(currentUser.full_name || currentUser.name)?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{currentUser.full_name || currentUser.name}</h2>
            <p className="text-sm text-gray-600">@{currentUser.username}</p>
            <p className="text-sm text-gray-600">{currentUser.email}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {currentUser.role?.toUpperCase()}
              </span>
              {currentUser.is_active && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  ACTIVE
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                pb-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'preferences' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('Language')}</h3>
            <p className="text-sm text-gray-600 mb-6">{t('Select your preferred language for the application interface.')}</p>
          </div>

          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('Language')}
            </label>
            <select
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="en">{t('English')}</option>
              <option value="id">{t('Indonesian')}</option>
            </select>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              {t('Note: Some technical terms are kept in their original English form to maintain accuracy in the clinical context.')}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
            <p className="text-sm text-gray-600 mb-6">Update your personal information and contact details.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Username (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={currentUser?.username || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                placeholder="Username"
              />
              <p className="mt-1 text-xs text-gray-500">Username cannot be changed</p>
            </div>

            {/* Role (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <input
                type="text"
                value={currentUser?.role || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                placeholder="Role"
              />
              <p className="mt-1 text-xs text-gray-500">Role is managed by administrator</p>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={profileData.full_name}
                onChange={(e) => handleProfileChange('full_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your full name"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={profileData.email}
                onChange={(e) => handleProfileChange('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your.email@example.com"
                required
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={profileData.phone_number || ''}
                onChange={(e) => handleProfileChange('phone_number', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+62 xxx xxxx xxxx"
              />
            </div>

            {/* WhatsApp */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                WhatsApp Number
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={profileData.whatsapp || ''}
                  onChange={(e) => handleProfileChange('whatsapp', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+62 xxx xxxx xxxx"
                />
                {profileData.whatsapp && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {/^\+\d{7,}$/.test(profileData.whatsapp) ? (
                      <span className="text-green-500 text-sm" title="Valid format">✓</span>
                    ) : (
                      <span className="text-amber-500 text-sm" title="Invalid format. Must start with '+'">⚠</span>
                    )}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">Must start with country code, e.g., +62</p>
            </div>

            {/* Telegram */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Telegram Username or ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={profileData.telegram || ''}
                  onChange={(e) => handleProfileChange('telegram', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="@username or 123456789"
                />
                {profileData.telegram && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {/^@[a-zA-Z0-9_]{5,}$/.test(profileData.telegram) || /^\d{5,}$/.test(profileData.telegram) ? (
                      <span className="text-green-500 text-sm" title="Valid format">✓</span>
                    ) : (
                      <span className="text-amber-500 text-sm" title="Check format">⚠</span>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-900 font-medium mb-1">Accepted formats:</p>
                <div className="text-xs text-blue-800 space-y-1">
                  <div className="flex items-start">
                    <span className="mr-2">•</span>
                    <span><strong>Username:</strong> @johndoe (must start with @ and be at least 5 characters)</span>
                  </div>
                  <div className="flex items-start">
                    <span className="mr-2">•</span>
                    <span><strong>User ID:</strong> 123456789 (numeric only, at least 5 digits)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
            <p className="text-sm text-gray-600 mb-6">Ensure your account is using a strong password to stay secure.</p>
          </div>

          <div className="space-y-4 max-w-md">
            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  passwordErrors.currentPassword ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter current password"
              />
              {passwordErrors.currentPassword && (
                <p className="mt-1 text-sm text-red-600">{passwordErrors.currentPassword}</p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  passwordErrors.newPassword ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter new password (min. 8 characters)"
              />
              {passwordErrors.newPassword && (
                <p className="mt-1 text-sm text-red-600">{passwordErrors.newPassword}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  passwordErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Confirm new password"
              />
              {passwordErrors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{passwordErrors.confirmPassword}</p>
              )}
            </div>

            {/* Password Requirements */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-medium text-blue-900 mb-2">Password Requirements:</p>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Minimum 8 characters</li>
                <li>• Different from current password</li>
                <li>• Recommended: Mix of letters, numbers, and symbols</li>
              </ul>
            </div>
          </div>

          {/* Change Password Button */}
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={handleChangePassword}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Changing Password...' : 'Change Password'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
