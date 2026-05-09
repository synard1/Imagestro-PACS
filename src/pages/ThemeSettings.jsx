/**
 * Theme Settings Page
 * 
 * Allows superadmin users to select and apply layout themes.
 * Displays all available themes with preview cards showing colors and icons.
 * 
 * Requirements: 1.1, 1.2, 1.3, 2.1
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Palette } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

/**
 * Check if user has superadmin role
 * @param {Object} user - Current user object
 * @returns {boolean} True if user is superadmin
 */
const isSuperAdmin = (user) => {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  const permissions = new Set(user.permissions || []);
  return role === 'superadmin' || role === 'developer' || permissions.has('*');
};

/**
 * Theme Preview Card Component
 * Displays a single theme option with color preview and selection state
 */
const ThemePreviewCard = ({ theme, isSelected, onSelect }) => {
  const ThemeIcon = theme.icon;
  const { colors } = theme;

  return (
    <button
      onClick={() => onSelect(theme.id)}
      className={`
        relative w-full p-6 rounded-xl border-2 transition-all duration-200
        ${isSelected
          ? 'border-blue-500 shadow-lg ring-2 ring-blue-200'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
        }
      `}
      style={{
        backgroundColor: isSelected ? colors.sidebar.activeItem : '#ffffff'
      }}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Theme icon and name */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: colors.primary }}
        >
          <ThemeIcon className="w-6 h-6 text-white" />
        </div>
        <div className="text-left">
          <h3 className="font-semibold text-gray-900">{theme.name}</h3>
          <p className="text-sm text-gray-500">{theme.description}</p>
        </div>
      </div>

      {/* Color palette preview */}
      <div className="space-y-3">
        {/* Primary colors */}
        <div className="flex gap-2">
          <div
            className="flex-1 h-8 rounded-md"
            style={{ backgroundColor: colors.primary }}
            title="Primary"
          />
          <div
            className="flex-1 h-8 rounded-md"
            style={{ backgroundColor: colors.primaryDark }}
            title="Primary Dark"
          />
          <div
            className="flex-1 h-8 rounded-md"
            style={{ backgroundColor: colors.accent }}
            title="Accent"
          />
          <div
            className="flex-1 h-8 rounded-md"
            style={{ backgroundColor: colors.accentLight }}
            title="Accent Light"
          />
        </div>

        {/* Sidebar preview */}
        <div className="flex gap-2">
          <div
            className="flex-1 h-6 rounded-md border border-gray-200"
            style={{ backgroundColor: colors.sidebar.bg }}
            title="Sidebar Background"
          />
          <div
            className="flex-1 h-6 rounded-md"
            style={{ backgroundColor: colors.sidebar.activeItem }}
            title="Active Item"
          />
          <div
            className="flex-1 h-6 rounded-md"
            style={{ backgroundColor: colors.button.primary }}
            title="Button Primary"
          />
        </div>

        {/* Login gradient preview */}
        <div
          className="h-6 rounded-md"
          style={{
            background: `linear-gradient(to right, ${colors.login.bgGradientFrom}, ${colors.login.bgGradientTo})`
          }}
          title="Login Gradient"
        />
      </div>

      {/* Color codes */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Primary: {colors.primary}</span>
          <span>Accent: {colors.accent}</span>
        </div>
      </div>
    </button>
  );
};

/**
 * Theme Settings Page Component
 * Main page for theme selection - restricted to superadmin users
 */
export default function ThemeSettings() {
  const { currentUser } = useAuth() || {};
  const { currentTheme, setTheme, themes, isLoading, currentThemeId } = useTheme();

  // Access control: redirect non-superadmin users to dashboard
  // Requirements: 1.2
  if (!isSuperAdmin(currentUser)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Handle theme selection
  // Requirements: 2.2
  const handleThemeSelect = (themeId) => {
    setTheme(themeId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Palette className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Theme Settings</h1>
            <p className="text-sm text-slate-600 mt-1">
              Customize the application's visual appearance by selecting a theme
            </p>
          </div>
        </div>
      </div>

      {/* Current Theme Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 font-medium">Current Theme:</span>
          <span className="text-blue-800 font-semibold">{currentTheme?.name || 'Professional'}</span>
        </div>
        <p className="text-sm text-blue-600 mt-1">
          Theme changes are applied immediately and saved for future sessions.
        </p>
      </div>

      {/* Theme Selector Grid */}
      {/* Requirements: 1.1, 2.1 - Display all 5 theme options */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {themes.map((theme) => (
          <ThemePreviewCard
            key={theme.id}
            theme={theme}
            isSelected={currentThemeId === theme.id}
            onSelect={handleThemeSelect}
          />
        ))}
      </div>

      {/* Theme Information */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h2 className="font-semibold text-gray-800 mb-3">About Themes</h2>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="text-blue-500">•</span>
            <span><strong>Professional (Blue)</strong> - Clean corporate theme with blue color scheme, ideal for business environments.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-500">•</span>
            <span><strong>Medical (Teal)</strong> - Calming healthcare theme with teal colors, designed for medical settings.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-500">•</span>
            <span><strong>Modern (Purple)</strong> - Vibrant contemporary theme with purple accents for modern applications.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-500">•</span>
            <span><strong>Dark (Slate)</strong> - Sleek dark theme for low-light environments, reduces eye strain.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-600">•</span>
            <span><strong>Clinical (Cyan)</strong> - Professional blue-gray theme for clinical and radiology environments, designed specifically for PACS systems.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
