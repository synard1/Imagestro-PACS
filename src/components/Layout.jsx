import { useTranslation } from 'react-i18next'
import PermissionGate from './common/PermissionGate'
import { useEffect, useState, lazy, Suspense } from 'react'
import { useToast } from './ToastProvider'
import { clearCurrentUser } from '../services/rbac'
import { getConfigSync } from '../services/config'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { logoutBackend } from '../services/authService'
import { loadRegistry, isKhanzaActive } from '../services/api-registry'
import { getCurrentUser, can, canAny } from '../services/rbac'
import { useTheme } from '../hooks/useTheme'
import { getNavIcon, NAV_ICON_KEYS } from '../config/themes'
import { useOrderLiveUpdates } from '../hooks/useOrderLiveUpdates'
import orderEventBus from '../services/orderEventBus'

// Lazy load heavy components that are not needed immediately
const QuickSearch = lazy(() => import('./pacs/QuickSearch'))
const WorklistWidget = lazy(() => import('./pacs/WorklistWidget'))
const PacsHealthIndicator = lazy(() => import('./pacs/PacsHealthIndicator'))
const NotificationManager = lazy(() => import('./NotificationManager'))
const SessionInfo = lazy(() => import('./SessionInfo'))
const ImpersonateSessionBanner = lazy(() => import('./admin/ImpersonateSessionBanner'))
const AIChatBot = lazy(() => import('./AIChatBot'))
const GuidedTour = lazy(() => import('./GuidedTour'))
const QuickStartWizard = lazy(() => import('./QuickStartWizard'))
const ChangelogModal = lazy(() => import('./ChangelogModal'))

import Sidebar from './navigation/Sidebar'
import { GlobalTenantSelector } from './GlobalTenantSelector'

// Application name from environment variables
const APP_NAME = import.meta.env.VITE_APP_NAME || 'MWL / mini-PACS'
const APP_SHORT_NAME = import.meta.env.VITE_APP_SHORT_NAME || APP_NAME

import {
  LayoutDashboard,
  ClipboardList,
  ListTodo,
  FileText,
  Files,
  Users as UsersIcon,
  Settings as SettingsIcon,
  Activity,
  Database,
  HardDrive,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  Stethoscope,
  User,
  FileJson,
  Network,
  Monitor,
  Shield,
  Upload,
  Search,
  Bell,
  History,
  Plus,
  CreditCard as CreditCardIcon,
  Building2 as BuildingOfficeIcon,
  BarChart3 as BarChartIcon,
  Sparkles as SparklesIcon
} from 'lucide-react'

// Define storage indicators
import StorageIndicator, { STORAGE_INDICATORS } from './StorageIndicator'

// Map routes to storage types and their corresponding module names
const ROUTE_STORAGE_MAP = {
  '/satusehat-monitor': { type: 'hybrid', module: 'satusehatMonitor' },
  '/dashboard': { type: 'hybrid', module: 'dashboard' },
  '/worklist': { type: 'hybrid', module: 'worklist' },
  '/orders': { type: 'hybrid', module: 'orders' },
  '/orders/workflow': { type: 'browser', module: null },
  '/reports': { type: 'hybrid', module: 'orders' },
  '/studies': { type: 'hybrid', module: 'studies' },
  '/upload': { type: 'hybrid', module: 'studies' },
  '/patients': { type: 'hybrid', module: 'patients' },
  '/doctors': { type: 'hybrid', module: 'doctors' },
  '/procedures': { type: 'hybrid', module: 'procedures' },
  '/mappings': { type: 'hybrid', module: 'mappings' },
  '/modalities': { type: 'hybrid', module: 'modalities' },
  '/dicom-nodes': { type: 'hybrid', module: 'nodes' },
  '/users': { type: 'hybrid', module: 'users' },
  '/roles': { type: 'hybrid', module: 'users' }, // Uses users module API
  '/permissions': { type: 'hybrid', module: 'users' }, // Uses users module API
  '/audit-logs': { type: 'hybrid', module: 'audit' },
  '/auth-audit-logs': { type: 'hybrid', module: 'audit' },
  '/storage-management': { type: 'hybrid', module: 'storage' },
  '/settings': { type: 'mixed', module: null },
  '/settings/reports': { type: 'browser', module: null },
  '/dicom-viewer': { type: 'browser', module: null },
  '/dicom-viewer-demo': { type: 'browser', module: null },
  '/dicom-uid-generator': { type: 'browser', module: null },
  '/debug-storage': { type: 'hybrid', module: 'studies' },
  '/external-systems-docs': { type: 'hybrid', module: 'externalSystems' }
};

const REPORTS_ALLOWED_ROLES = ['superadmin', 'developer'];

// Get storage indicator for a route
function getStorageIndicatorForRoute(route, dataStorageMode) {
  const routeConfig = ROUTE_STORAGE_MAP[route];

  // If no config for this route, default to browser storage
  if (!routeConfig) {
    return 'browser';
  }

  const { type, module } = routeConfig;

  // Check if the specific module is enabled in registry
  let moduleEnabled = false;
  if (module) {
    const registry = loadRegistry();
    moduleEnabled = registry[module]?.enabled === true;
  }

  switch (type) {
    case 'hybrid':
      if (moduleEnabled) {
        return 'external';
      } else if (dataStorageMode === 'server') {
        return 'server';
      } else {
        return 'browser';
      }
    case 'mixed':
      // Settings page uses multiple storage types
      return null;
    default:
      return type || 'browser';
  }
}

function hasPrivilegedReportRole(user = getCurrentUser()) {
  const role = (user?.role || "").toLowerCase();
  return REPORTS_ALLOWED_ROLES.includes(role);
}

// Helper function to check if user is superadmin
function isSuperAdmin(user = getCurrentUser()) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  const permissions = new Set(user.permissions || []);
  return role === 'superadmin' || role === 'developer' || permissions.has('*');
}

// Helper function to check if user has superadmin or developer role
export function canAccessTools() {
  return hasPrivilegedReportRole();
}

// Helper function to check if user can access worklist
export function canAccessWorklist() {
  return hasPrivilegedReportRole();
}

export function canAccessReports() {
  return hasPrivilegedReportRole();
}

// Helper function to check if Khanza integration is enabled
function isKhanzaIntegrationEnabled() {
  return isKhanzaActive();
}

// Determine which menu system to use (fallback mechanism)
const USE_LEGACY_MENU = import.meta.env.VITE_USE_LEGACY_MENU === 'true'

// ==================== TASK-ORIENTED CLINICAL WORKFLOW MENU ====================
// Designed following medical UX best practices: Patient → Order → Study → Report
const navClinicalWorkflow = [
  // SECTION 1: MANAGEMENT
  {
    label: 'Management',
    icon: LayoutDashboard,
    children: [
      { to: '/dashboard', label: 'Dashboard', perm: 'dashboard.view', icon: LayoutDashboard },
      { to: '/patients', label: 'Patients', perm: 'patient.view', icon: User },
      { to: '/orders', label: 'Orders', perm: 'order.view', icon: ClipboardList },
      { to: '/worklist', label: 'Worklist', perm: 'worklist.view', icon: ListTodo },
      { to: '/studies', label: 'Studies', perm: 'study.view', icon: Files },
       { to: '/reports', label: 'Reports', perm: 'report.view', icon: FileText },
     ]
   },

   // SECTION 1.5: TOOLS (for testing features like DICOM Viewer Demo)
   {
     label: 'Tools',
     icon: Monitor,
     children: [
       { to: '/dicom-viewer-demo', label: 'DICOM Viewer Demo', any: ['*'] },
     ]
   },

   // SECTION 2: ADMINISTRATION
  {
    label: 'Administration',
    icon: Shield,
    children: [
      { to: '/subscriptions', label: 'Subscriptions', any: ['*:superadmin'], icon: CreditCardIcon, superadminOnly: true },
      { to: '/products', label: 'Products', any: ['*:superadmin'], icon: BuildingOfficeIcon, superadminOnly: true },
      { to: '/tenants', label: 'Tenants', any: ['*:superadmin'], icon: BuildingOfficeIcon, superadminOnly: true },
      { to: '/usage-dashboard', label: 'Usage Dashboard', any: ['*:superadmin'], icon: BarChartIcon, superadminOnly: true },
      { to: '/billing', label: 'Billing & Invoices', any: ['TENANT_ADMIN', '*'], icon: CreditCardIcon },
      { to: '/billing', label: 'Billing & Invoices', any: ['TENANT_ADMIN', '*'], icon: CreditCardIcon },
      { to: '/users', label: 'Users', any: ['user:manage', 'user:read', '*'], icon: UsersIcon },
      { to: '/roles', label: 'Roles', any: ['user:manage', 'user:read', '*'], icon: Shield },
      { to: '/permissions', label: 'Permissions', any: ['user:manage', 'user:read', '*'], icon: Shield },
    ]
  },

  // SECTION 3: SYSTEM & MASTER DATA
  {
    label: 'System',
    icon: Database,
    children: [
      { to: '/doctors', label: 'Doctors', perm: 'doctor.view', icon: Stethoscope },
      { to: '/procedures', label: 'Procedures', any: ['procedure.view', 'procedure.*'], icon: Activity },
      { to: '/modalities', label: 'Modalities', any: ['modality.manage', 'modality.view'], icon: Monitor },
      { to: '/dicom-nodes', label: 'DICOM Nodes', any: ['node.manage', 'node.view'], icon: Network },
      { to: '/mappings', label: 'Procedure Mappings', any: ['mapping.view', 'mapping.*'], icon: FileJson },
      { to: '/integrations-hub', label: 'Integrations Hub', any: ['integration.view', '*'], icon: LayoutGrid },
      { to: '/external-systems', label: 'External Systems', any: ['external_system:read', '*'], icon: Network },
      { to: '/audit-logs', label: 'Audit Logs', any: ['audit.view', '*'], icon: Shield },
      { to: '/auth-audit-logs', label: 'Auth Audit Logs', any: ['audit.view', '*'], icon: Shield },
      { to: '/storage-monitor', label: 'Storage Monitor', any: ['storage.view', 'storage.manage', '*'], icon: Monitor },
      { to: '/settings', label: 'Settings', any: ['setting:read', 'setting:write', '*'], icon: SettingsIcon },
    ]
  },
]

// Add dev-only Debug Storage to Tools menu in development mode
if (import.meta.env.DEV) {
  const toolsMenu = navClinicalWorkflow.find(item => item.label === 'Tools');
  if (toolsMenu?.children) {
    toolsMenu.children.push({ to: '/debug-storage', label: 'Debug Storage (Dev)', any: ['*'] });
  }
}

// ==================== LEGACY MENU (Current Implementation) ====================
// Keep for backward compatibility and gradual migration
const navLegacy = [
  { to: '/dashboard', label: 'Dashboard', perm: 'dashboard.view', icon: LayoutDashboard },
  {
    label: 'Orders',
    perm: 'order.view',
    icon: ClipboardList,
    children: [
      { to: '/orders/new', label: 'New Order', perm: 'order.create', icon: Plus },
      { to: '/orders', label: 'All Orders', perm: 'order.view' },
      { to: '/pacs/intake', label: 'Intake Dashboard', any: ['intake.view', 'intake.*'], icon: Activity },
      { to: '/orders?tab=intake', label: 'Intake Queue', any: ['intake.view', 'intake.*'] },
      { to: '/orders?tab=completed', label: 'Completed', perm: 'order.view' },
      { to: '/orders/workflow', label: 'Workflow Guide', perm: 'order.view' },
    ]
  },
  { to: '/worklist', label: 'Worklist', perm: 'worklist.view', icon: ListTodo },
  { to: '/reports', label: 'Reports (PDF)', perm: 'report.view', icon: FileText },
  {
    label: 'Studies',
    perm: 'study.view',
    icon: Files,
    children: [
      { to: '/studies', label: 'Study List', perm: 'study.view' },
      { to: '/upload', label: 'Upload DICOM', any: ['studies.upload', 'study.*', '*'], icon: Upload },
    ]
  },
  {
    label: 'SaaS Management',
    icon: BuildingOfficeIcon,
    any: ['*:superadmin'],
    superadminOnly: true,
    children: [
      { to: '/tenants', label: 'Tenants', icon: BuildingOfficeIcon },
      { to: '/subscriptions', label: 'Subscriptions', icon: CreditCardIcon },
      { to: '/products', label: 'Products', icon: SparklesIcon },
      { to: '/usage-dashboard', label: 'Usage Dashboard', icon: BarChartIcon },
    ]
  },
  {
    label: 'Master Data',
    icon: Database,
    children: [
      { to: '/patients', label: 'Patients', perm: 'patient.view', icon: User },
      { to: '/doctors', label: 'Doctors', perm: 'doctor.view', icon: Stethoscope },
      {
        label: 'User Management',
        icon: UsersIcon,
        children: [
          { to: '/users', label: 'Users', any: ['user:manage', 'user:read', '*'] },
          { to: '/roles', label: 'Roles', any: ['user:manage', 'user:read', '*'] },
          { to: '/permissions', label: 'Permissions', any: ['user:manage', 'user:read', '*'] },
        ]
      },
      { to: '/procedures', label: 'Procedures', any: ['procedure.view', 'procedure.*'], icon: Activity },
      { to: '/mappings', label: 'Procedure Mappings', any: ['mapping.view', 'mapping.*'], icon: FileJson, activeOn: ['/mappings-enhanced'] },
      { to: '/integrations-hub', label: 'Integrations Hub', any: ['integration.view', '*'], icon: LayoutGrid },
      { to: '/external-systems', label: 'External Systems', any: ['external_system:read', '*'], icon: Network },
      { to: '/modalities', label: 'Modalities', any: ['modality.manage', 'modality.view'], icon: Monitor },
      { to: '/dicom-nodes', label: 'DICOM Nodes', any: ['node.manage', 'node.view'], icon: Network },
    ]
  },

  // Audit & System Management
  { to: '/audit-logs', label: 'Audit Logs', any: ['audit.view', '*'], icon: Shield },
  { to: '/auth-audit-logs', label: 'Auth Audit Logs', any: ['audit.view', '*'], icon: Shield },
  { to: '/impersonate-history', label: 'Impersonate History', any: ['user:manage', '*'], icon: History },
  {
    label: 'Storage',
    icon: HardDrive,
    children: [
      { to: '/storage-management', label: 'Storage Management', any: ['storage.manage', '*'], icon: HardDrive },
      { to: '/storage-monitor', label: 'Storage Monitor', any: ['storage.view', 'storage.manage', '*'], icon: Monitor },
    ]
  },

  {
    label: 'Settings',
    icon: SettingsIcon,
    children: [
      { to: '/settings', label: 'General Settings', any: ['setting:read', 'setting:write', '*'] },
      { to: '/settings/reports', label: 'Report Settings', any: ['setting:write', '*'] },
      { to: '/theme-settings', label: 'Theme Settings', any: ['*'], superadminOnly: true },
      { to: '/profile', label: 'My Profile', any: ['*'] },
      { to: '/changelog', label: 'Changelog', any: ['*'] },
    ]
  },
  // Tools menu will be added dynamically based on user role
]

// Select which navigation structure to use
const baseNav = USE_LEGACY_MENU ? navLegacy : navClinicalWorkflow

import { getStatus, startHealthWatch, onHealthChange } from '../services/health'

export default function Layout({ children }) {
  const { t, i18n } = useTranslation()
  const { pathname, search } = useLocation()
  const navto = useNavigate()
  const toast = useToast()
  const [backendStatus, setBackendStatus] = useState(() => getStatus()) 
  const [cfg, setCfg] = useState(null)

  // Start health watch on mount
  useEffect(() => {
    const stop = startHealthWatch(60000); // 1 minute interval
    const off = onHealthChange(setBackendStatus);
    return () => {
      stop();
      off();
    };
  }, []);
  const currentPathWithSearch = `${pathname}${search}`
  const isRouteMatch = (target = '') => target === pathname || target === currentPathWithSearch
  const normalizeRoute = (route = '') => route.split('?')[0] || route

  const isItemActive = (item) => {
    if (isRouteMatch(item.to)) return true;
    if (item.activeOn && Array.isArray(item.activeOn)) {
      return item.activeOn.some(path => isRouteMatch(path));
    }
    return false;
  }

  // Theme integration - use try/catch to handle case when ThemeProvider is not available
  let themeContext = null;
  try {
    themeContext = useTheme();
  } catch (e) {
    // ThemeProvider not available, use default styles
  }
  const currentTheme = themeContext?.currentTheme;

  // Use synchronous config getter for faster initialization
  useEffect(() => {
    setCfg(getConfigSync());
  }, [])
  const { currentUser } = useAuth()
  const isAuthed = !!currentUser
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [worklistOpen, setWorklistOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState(() => {
    const initialState = {};

    // Helper to recursively find and expand parent menus
    const findAndExpandParents = (menuItems, parentLabels = []) => {
      for (const item of menuItems) {
        if (item.children) {
          // Check if any direct child matches the current path
          const directMatch = item.children.some(c => isItemActive(c));
          if (directMatch) {
            initialState[item.label] = true;
            parentLabels.forEach(label => initialState[label] = true);
            return true;
          }

          // Recursively check nested children
          const nestedLabels = [...parentLabels, item.label];
          for (const child of item.children) {
            if (child.children) {
              const found = findAndExpandParents([child], nestedLabels);
              if (found) {
                initialState[item.label] = true;
                return true;
              }
            }
          }
        }
      }
      return false;
    };

    // Get the current nav configuration for state initialization
    const currentNav = [...baseNav];

    // Filter out worklist if user doesn't have access
    let filteredNav = currentNav.filter(item => {
      if (item.to === '/worklist') {
        return canAccessWorklist();
      }
      if (item.to === '/reports') {
        return canAccessReports();
      }
      return true;
    });

    // Add Tools menu dynamically ONLY for legacy menu (clinical workflow already has Tools)
    // Legacy menu requires SatuSehat Monitor and other tools that aren't in the base definition
    if (USE_LEGACY_MENU && canAccessTools()) {
      const toolsChildren = [
        { to: '/satusehat-monitor', label: 'SatuSehat Monitor' },
        { to: '/dicom-viewer', label: 'DICOM Viewer (Upload)' },
        { to: '/dicom-viewer-demo', label: 'DICOM Viewer Demo' },
        { to: '/dicom-uid-generator', label: 'DICOM UID Generator' },
        { to: '/phi-migration', label: 'PHI Migration' },
        { to: '/integration-monitor', label: 'Integration Monitor', any: ['integration.view', '*'] },
        { to: '/data-management', label: 'Data Management', any: ['*'] },
      ];

      // Only show Debug Storage in development mode
      if (import.meta.env.DEV) {
        toolsChildren.push({ to: '/debug-storage', label: 'Debug Storage (Dev)', any: ['*'] });
      }

      filteredNav.push({
        label: 'Tools',
        children: toolsChildren
      });
    }

    findAndExpandParents(filteredNav);
    return initialState;
  });

  // Get data storage configuration - lazy load to avoid importing heavy dataSync module
  const [dataStorageConfig, setDataStorageConfig] = useState({ mode: 'browser' });
  useEffect(() => {
    import('../services/dataSync').then(({ getDataStorageConfig }) => {
      setDataStorageConfig(getDataStorageConfig());
    }).catch(() => {
      // Use browser mode as fallback
    });
  }, []);

  // Changelog modal state
  const [showChangelogModal, setShowChangelogModal] = useState(false);

  // Check if storage indicator should be shown (from env config)
  const showStorageIndicator = import.meta.env.VITE_SHOW_STORAGE_INDICATOR !== 'false';

  const toggleMenu = (label) => {
    setExpandedMenus(prev => ({
      ...prev,
      [label]: !prev[label]
    }))
  }

  // Helper function to recursively check if any nested child is active
  const hasActiveChildRecursive = (children) => {
    if (!children) return false;

    return children.some(child => {
      // Check if this child's path matches
      if (isItemActive(child)) return true;

      // Recursively check nested children
      if (child.children) {
        return hasActiveChildRecursive(child.children);
      }

      return false;
    });
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed)
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const logout = async () => {
    if (isLoggingOut) return

    setIsLoggingOut(true)

    try {
      const registry = loadRegistry()
      const authConfig = registry.auth

      // If backend auth is enabled, call backend logout
      if (authConfig && authConfig.enabled) {
        await logoutBackend()
      } else {
        // For local auth, just clear local state
        clearCurrentUser()
      }

      // Clear storage on logout (lazy import to avoid loading it on every page)
      try {
        const { clearOnLogout } = await import('../services/storageManager')
        clearOnLogout()
      } catch { }
      // Navigate to login page
      navto('/login', { replace: true })
    } catch (error) {
      console.error('Logout error:', error)
      // Even if backend logout fails, clear local state and redirect
      clearCurrentUser()
      try {
        const { clearOnLogout } = await import('../services/storageManager')
        clearOnLogout()
      } catch { }
      navto('/login', { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  const backendOn = cfg?.backendEnabled
  const indicator = !backendOn ? { text: 'OFF', cls: 'bg-slate-300 text-slate-700' } :
    backendStatus === 'up' ? { text: 'ON', cls: 'bg-emerald-100 text-emerald-700' } :
      backendStatus === 'down' ? { text: 'DOWN', cls: 'bg-red-100 text-red-700' } :
        { text: '...', cls: 'bg-amber-100 text-amber-700' }

  // Get storage indicator for current route
  const currentRouteStorage = getStorageIndicatorForRoute(pathname, dataStorageConfig.mode);

  // Live order updates
  const { orders } = useOrderLiveUpdates();
  const [newOrderCount, setNewOrderCount] = useState(0);

  useEffect(() => {
    if (orders.length > 0) {
      setNewOrderCount(prev => prev + orders.length);
      toast.info('New order arrived', {
        message: 'New order(s) arrived',
        detail: `You have ${orders.length} new order(s).`
      });
    }
  }, [orders, toast]);

  return (
    <div className="h-full flex flex-col md:flex-row">
      {isAuthed ? (
        <>
          {/* Mobile Header */}
          <div
            className="md:hidden border-b p-4 flex items-center justify-between z-20 sticky top-0"
            style={{
              backgroundColor: currentTheme?.colors?.header?.bg || '#ffffff',
              borderColor: 'rgba(0,0,0,0.1)',
              color: currentTheme?.colors?.header?.text || '#1e293b'
            }}
          >
            <div className="flex items-center gap-3">
              <button onClick={toggleMobileMenu} className="p-1 rounded" style={{ color: currentTheme?.colors?.sidebar?.text || '#334155' }}>
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
              {/* Theme Icon in Mobile Header */}
              {currentTheme?.icon && (
                <div
                  className="p-1.5 rounded-lg"
                  style={{ backgroundColor: currentTheme?.colors?.accentLight || '#93c5fd' }}
                >
                  {(() => {
                    const ThemeIcon = currentTheme.icon;
                    return <ThemeIcon size={18} style={{ color: currentTheme?.colors?.primary || '#1e40af' }} />;
                  })()}
                </div>
              )}
              <div className="text-lg font-bold" style={{ color: currentTheme?.colors?.primary || '#1e40af' }}>{APP_NAME}</div>
            </div>
            <div className="flex items-center gap-2">
              {newOrderCount > 0 && (
                <div className="relative">
                  <Bell size={20} className="text-amber-500" />
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full px-1">{newOrderCount}</span>
                </div>
              )}
              <SessionInfo compact={true} />
              <button
                onClick={() => navto('/profile')}
                className="p-2 rounded-full"
                style={{ backgroundColor: currentTheme?.colors?.accentLight || '#93c5fd' }}
              >
                <User size={20} style={{ color: currentTheme?.colors?.primaryDark || '#1e3a8a' }} />
              </button>
            </div>
          </div>

          {/* Sidebar Overlay for Mobile */}
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-30 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}

          {/* Sidebar */}
          <Sidebar 
            isCollapsed={isSidebarCollapsed} 
            setIsCollapsed={setIsSidebarCollapsed} 
          />

          {/* Main Content */}
          <main className="flex-1 flex flex-col h-full overflow-hidden w-full">
            {/* Enhanced Header with Quick Search */}
            <div
              className="backdrop-blur border-b px-4 md:px-6 py-3 flex items-center justify-between z-10 sticky top-0"
              style={{
                backgroundColor: currentTheme?.colors?.header?.bg ? `${currentTheme.colors.header.bg}cc` : 'rgba(248, 250, 252, 0.8)',
                borderColor: 'rgba(0,0,0,0.1)',
                color: currentTheme?.colors?.header?.text || '#1e293b'
              }}
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="hidden md:block text-sm" style={{ opacity: 0.6 }}>{pathname}</div>
                {/* Quick Search - PACS Enhancement */}
                <QuickSearch className="max-w-md w-full md:w-auto search-container" />
              </div>
              <div className="flex items-center gap-3 topbar-user">
                {/* Global Tenant Context for Superadmin */}
                <GlobalTenantSelector />
                
                {/* Session Info */}
                <SessionInfo compact={true} />

                {/* <div className="text-sm">{currentUser?.name || 'Guest'}</div> */}
                <button
                  onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'id' : 'en')}
                  className="hidden md:flex px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 items-center gap-1 uppercase font-bold"
                  title={t('Switch Language')}
                >
                  🌐 {i18n.language === 'en' ? 'ID' : 'EN'}
                </button>
                <button
                  onClick={() => navto('/profile')}
                  className="hidden md:block px-2 py-1 text-xs rounded"
                  style={{
                    backgroundColor: currentTheme?.colors?.accentLight || '#93c5fd',
                    color: currentTheme?.colors?.primaryDark || '#1e3a8a'
                  }}
                >{t('Profile')}</button>
                {/* <button onClick={() => navto('/settings')} className="px-2 py-1 text-xs rounded bg-slate-200 hover:bg-slate-300">Settings</button> */}
                <button
                  onClick={logout}
                  disabled={isLoggingOut}
                  className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isLoggingOut ? '...' : t('Logout')}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex flex-col">
              {/* Impersonate Session Banner */}
              <Suspense fallback={null}>
                <ImpersonateSessionBanner />
              </Suspense>

              {/* Main Content */}
              <div className="flex-1 overflow-auto p-4 md:p-6">
                {children}
              </div>
            </div>
          </main>

          {/* Worklist Widget - PACS Enhancement */}
          <WorklistWidget
            isOpen={worklistOpen}
            onToggle={() => setWorklistOpen(!worklistOpen)}
          />
          <NotificationManager />
          <Suspense fallback={null}>
            {loadRegistry().ai?.enabled === true && <AIChatBot />}
            <GuidedTour />
            <QuickStartWizard />
            {showChangelogModal && (
              <ChangelogModal
                open={showChangelogModal}
                onClose={() => setShowChangelogModal(false)}
              />
            )}
          </Suspense>
        </>
      ) : (
        <main className="flex-1 overflow-auto h-full">
          <div className="p-6 h-full">
            {children}
          </div>
        </main>
      )}
    </div>
  )
}
