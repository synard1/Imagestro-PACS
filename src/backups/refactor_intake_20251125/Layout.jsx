import PermissionGate from './PermissionGate'
import { useEffect, useState } from 'react'
import { useToast } from './ToastProvider'
import { clearCurrentUser } from '../services/rbac'
import { getConfig } from '../services/config'
import { getStatus, startHealthWatch, onHealthChange } from '../services/health'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { logoutBackend } from '../services/authService'
import { clearOnLogout } from '../services/storageManager'
import { loadRegistry } from '../services/api-registry'
import { getDataStorageConfig } from '../services/dataSync'
import { getCurrentUser } from '../services/rbac'
import LoadingScreen from './LoadingScreen'
import QuickSearch from './pacs/QuickSearch'
import WorklistWidget from './pacs/WorklistWidget'
import PacsHealthIndicator from './pacs/PacsHealthIndicator'

// Define storage indicators
const STORAGE_INDICATORS = {
  browser: {
    text: 'Browser Storage',
    icon: '💾',
    color: 'text-blue-600',
    description: 'Data stored locally in browser localStorage'
  },
  server: {
    text: 'Server Storage',
    icon: '📡',
    color: 'text-green-600',
    description: 'Data stored on remote server with synchronization'
  },
  external: {
    text: 'External API',
    icon: '☁️',
    color: 'text-purple-600',
    description: 'Data retrieved from external backend API'
  }
};

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
    return STORAGE_INDICATORS.browser;
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
        return STORAGE_INDICATORS.external;
      } else if (dataStorageMode === 'server') {
        return STORAGE_INDICATORS.server;
      } else {
        return STORAGE_INDICATORS.browser;
      }
    case 'mixed':
      // Settings page uses multiple storage types
      return null;
    default:
      return STORAGE_INDICATORS[type] || STORAGE_INDICATORS.browser;
  }
}

function hasPrivilegedReportRole(user = getCurrentUser()) {
  const role = (user?.role || "").toLowerCase();
  return REPORTS_ALLOWED_ROLES.includes(role);
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

const nav = [
  { to: '/dashboard', label: 'Dashboard' },
  {
    label: 'Orders',
    perm: 'order.view',
    children: [
      { to: '/orders', label: 'All Orders', perm: 'order.view' },
      { to: '/orders?tab=intake', label: 'Intake Queue', any: ['intake.view', 'intake.*'] },
      { to: '/orders?tab=completed', label: 'Completed', perm: 'order.view' },
      { to: '/orders/workflow', label: 'Workflow Guide', perm: 'order.view' },
    ]
  },
  { to: '/worklist', label: 'Worklist', perm: 'worklist.view' },
  { to: '/reports', label: 'Reports (PDF)', perm: 'report.view' },
  {
    label: 'Studies',
    perm: 'study.view',
    children: [
      { to: '/studies', label: 'Study List', perm: 'study.view' },
      { to: '/upload', label: 'Upload DICOM', any: ['studies.upload', 'study.*', '*'] },
    ]
  },
  {
    label: 'Master Data',
    children: [
      { to: '/patients', label: 'Patients' },
      { to: '/doctors', label: 'Doctors' },
      {
        label: 'User Management',
        // Removed restrictive permissions from parent menu item
        // Permissions will be checked on individual child items
        children: [
          { to: '/users', label: 'Users', any: ['user:manage', 'user:read', '*'] },
          // { to: '/user-management', label: 'User Admin', any: ['user:manage', 'user:read', '*'] },
          { to: '/roles', label: 'Roles', any: ['user:manage', 'user:read', '*'] },
          { to: '/permissions', label: 'Permissions', any: ['user:manage', 'user:read', '*'] },
        ]
      },
      { to: '/procedures', label: 'Procedures', any: ['procedure.view', 'procedure.*'] },
      { to: '/mappings', label: 'Procedure Mappings', any: ['mapping.view', 'mapping.*'] },
      { to: '/external-systems-docs', label: 'External Systems (Docs)', any: ['external_system:read', '*'] },
      { to: '/modalities', label: 'Modalities', any: ['modality.manage', 'modality.view'] },
      { to: '/dicom-nodes', label: 'DICOM Nodes', any: ['node.manage', 'node.view'] },
    ]
  },

  // Audit & System Management
  { to: '/audit-logs', label: 'Audit Logs', any: ['audit.view', '*'] },
  { to: '/auth-audit-logs', label: 'Auth Audit Logs', any: ['audit.view', '*'] },
  { to: '/storage-management', label: 'Storage Management', any: ['storage.manage', '*'] },

  {
    label: 'Settings',
    children: [
      { to: '/settings', label: 'General Settings' },
      { to: '/settings/reports', label: 'Report Settings', any: ['setting:write', '*'] },
    ]
  },
  // Tools menu will be added dynamically based on user role
]

export default function Layout({ children }) {
  const { pathname, search } = useLocation()
  const navto = useNavigate()
  const toast = useToast()
  const [backendStatus, setBackendStatus] = useState(getStatus())
  const [cfg, setCfg] = useState(null)
  const currentPathWithSearch = `${pathname}${search}`
  const isRouteMatch = (target = '') => target === pathname || target === currentPathWithSearch
  const normalizeRoute = (route = '') => route.split('?')[0] || route

  useEffect(() => {
    // Load config asynchronously
    const loadConfig = async () => {
      const config = await getConfig();
      setCfg(config);
    };
    loadConfig();
  }, [])
  const { currentUser } = useAuth()
  const isAuthed = !!currentUser
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [worklistOpen, setWorklistOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState(() => {
    const initialState = {};

    // Helper to recursively find and expand parent menus
    const findAndExpandParents = (menuItems, parentLabels = []) => {
      for (const item of menuItems) {
        if (item.children) {
          // Check if any direct child matches the current path
          const directMatch = item.children.some(c => isRouteMatch(c.to));
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
    const currentNav = [...nav];

    // Filter out worklist if user doesn't have access
    const filteredNav = currentNav.filter(item => {
      if (item.to === '/worklist') {
        return canAccessWorklist();
      }
      if (item.to === '/reports') {
        return canAccessReports();
      }
      return true;
    });

    // Add Tools menu only if user has access
    if (canAccessTools()) {
      filteredNav.push({
        label: 'Tools',
        children: [
          { to: '/satusehat-monitor', label: 'SatuSehat Monitor' },
          { to: '/dicom-viewer', label: 'DICOM Viewer (Upload)' },
          { to: '/dicom-viewer-demo', label: 'DICOM Viewer Demo' },
          { to: '/dicom-uid-generator', label: 'DICOM UID Generator' },
          { to: '/debug-storage', label: 'Debug Storage (Dev)', any: ['*'] },
        ]
      });
    }

    findAndExpandParents(filteredNav);
    return initialState;
  });

  // Get data storage configuration
  const [dataStorageConfig, setDataStorageConfig] = useState(() => {
    return getDataStorageConfig();
  });

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
      if (isRouteMatch(child.to)) return true;

      // Recursively check nested children
      if (child.children) {
        return hasActiveChildRecursive(child.children);
      }

      return false;
    });
  };

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

      try { clearOnLogout() } catch { }
      // Navigate to login page
      navto('/login', { replace: true })
    } catch (error) {
      console.error('Logout error:', error)
      // Even if backend logout fails, clear local state and redirect
      clearCurrentUser()
      try { clearOnLogout() } catch { }
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


  return (
    <div className="h-full flex">
      {isAuthed ? (
        <>
          <aside className="w-[var(--sidebar-width)] bg-white border-r border-slate-200 flex flex-col">
            <div className="p-4 border-b">
              <div className="text-lg font-bold">MWL / mini-PACS</div>
              <div className="text-xs text-slate-500">{currentUser?.name || 'Guest'} · {currentUser?.role?.toUpperCase?.() || 'GUEST'}</div>
              <div className="mt-2 text-xs">
                <span className="mr-2 text-slate-500">Backend:</span>
                <span className={`px-2 py-0.5 rounded-full ${indicator.cls}`}>{indicator.text}</span>
              </div>
              {showStorageIndicator && currentRouteStorage && (
                <div className="mt-2 text-xs flex items-center">
                  <span className="mr-2 text-slate-500">Storage:</span>
                  <span className={`${currentRouteStorage.color} flex items-center`}>
                    <span className="mr-1">{currentRouteStorage.icon}</span>
                    {currentRouteStorage.text}
                  </span>
                </div>
              )}
              {/* PACS Health Indicator */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <PacsHealthIndicator />
              </div>
            </div>
            <nav className="flex-1 p-2 space-y-1">
              {(() => {
                // Get the current nav configuration
                const currentNav = [...nav];

                // Filter out worklist if user doesn't have access
                const filteredNav = currentNav.filter(item => {
                  if (item.to === '/worklist') {
                    return canAccessWorklist();
                  }
                  if (item.to === '/reports') {
                    return canAccessReports();
                  }
                  return true;
                });

                // Add Tools menu only if user has access
                if (canAccessTools()) {
                  filteredNav.push({
                    label: 'Tools',
                    children: [
                      { to: '/satusehat-monitor', label: 'SatuSehat Monitor' },
                      { to: '/dicom-viewer', label: 'DICOM Viewer (Upload)' },
                      { to: '/dicom-viewer-demo', label: 'DICOM Viewer Demo' },
                      { to: '/dicom-uid-generator', label: 'DICOM UID Generator' },
                      { to: '/debug-storage', label: 'Debug Storage (Dev)', any: ['*'] },
                    ]
                  });
                }

                return filteredNav;
              })().map((n, idx) => {
                // Menu with children (submenu)
                if (n.children) {
                  const isExpanded = expandedMenus[n.label]
                  const hasActiveChild = hasActiveChildRecursive(n.children)

                  return (
                    <div key={n.label || `menu-${idx}`}>
                      <button
                        onClick={() => toggleMenu(n.label)}
                        className={`w-full flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-slate-100 ${hasActiveChild ? 'bg-slate-100 font-semibold' : ''}`}
                      >
                        <span>{n.label}</span>
                        <svg
                          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isExpanded && (
                        <div className="ml-3 mt-1 space-y-1">
                          {n.children.map((child, childIdx) => {
                            // Check if this child has nested children (2nd level submenu)
                            if (child.children) {
                              const isChildExpanded = expandedMenus[child.label];
                              const hasActiveGrandchild = hasActiveChildRecursive(child.children);

                              return (
                                <PermissionGate key={child.label || `child-${childIdx}`} perm={child.perm} any={child.any}>
                                  <div>
                                    <button
                                      onClick={() => toggleMenu(child.label)}
                                      className={`w-full flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-slate-100 ${hasActiveGrandchild ? 'bg-slate-100 font-semibold' : ''}`}
                                    >
                                      <span>{child.label}</span>
                                      <svg
                                        className={`w-3 h-3 transition-transform ${isChildExpanded ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                    {isChildExpanded && (
                                      <div className="ml-3 mt-1 space-y-1">
                                        {child.children.map((grandchild, grandchildIdx) => {
                                          const grandchildStorage = showStorageIndicator ? getStorageIndicatorForRoute(normalizeRoute(grandchild.to), dataStorageConfig.mode) : null;
                                          return (
                                            <PermissionGate key={grandchild.to || `grandchild-${grandchildIdx}`} perm={grandchild.perm} any={grandchild.any}>
                                              <Link
                                                to={grandchild.to}
                                                className={`block rounded px-3 py-2 text-sm hover:bg-slate-100 ${isRouteMatch(grandchild.to) ? 'bg-slate-100 font-semibold' : ''}`}
                                              >
                                                <div className="flex justify-between items-center">
                                                  <span>{grandchild.label}</span>
                                                  {grandchildStorage && (
                                                    <span className={`text-xs ${grandchildStorage.color}`} title={grandchildStorage.description}>
                                                      {grandchildStorage.icon}
                                                    </span>
                                                  )}
                                                </div>
                                              </Link>
                                            </PermissionGate>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </PermissionGate>
                              );
                            }

                            // Regular child menu item (with direct link)
                            const childStorage = showStorageIndicator ? getStorageIndicatorForRoute(normalizeRoute(child.to), dataStorageConfig.mode) : null;
                            return (
                              <PermissionGate key={child.to || `child-${childIdx}`} perm={child.perm} any={child.any}>
                                <Link
                                  to={child.to}
                                  className={`block rounded px-3 py-2 text-sm hover:bg-slate-100 ${isRouteMatch(child.to) ? 'bg-slate-100 font-semibold' : ''}`}
                                >
                                  <div className="flex justify-between items-center">
                                    <span>{child.label}</span>
                                    {childStorage && (
                                      <span className={`text-xs ${childStorage.color}`} title={childStorage.description}>
                                        {childStorage.icon}
                                      </span>
                                    )}
                                  </div>
                                </Link>
                              </PermissionGate>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )
                }

                // Regular menu item
                const storageIndicator = showStorageIndicator ? getStorageIndicatorForRoute(normalizeRoute(n.to), dataStorageConfig.mode) : null;
                return (
                  <PermissionGate key={n.to || `item-${idx}`} perm={n.perm} any={n.any}>
                    <Link
                      to={n.to}
                      className={`block rounded px-3 py-2 text-sm hover:bg-slate-100 ${isRouteMatch(n.to) ? 'bg-slate-100 font-semibold' : ''}`}
                    >
                      <div className="flex justify-between items-center">
                        <span>{n.label}</span>
                        {storageIndicator && (
                          <span className={`text-xs ${storageIndicator.color}`} title={storageIndicator.description}>
                            {storageIndicator.icon}
                          </span>
                        )}
                      </div>
                    </Link>
                  </PermissionGate>
                )
              })}
            </nav>
            <div className="p-3 text-xs text-slate-500 border-t">
              v0.1 · Dummy UI
            </div>
          </aside>
          <main className="flex-1 overflow-auto">
            {/* Enhanced Header with Quick Search */}
            <div className="sticky top-0 bg-slate-50/80 backdrop-blur border-b border-slate-200 px-6 py-3 flex items-center justify-between z-10">
              <div className="flex items-center gap-4 flex-1">
                <div className="text-sm text-slate-500">{pathname}</div>
                {/* Quick Search - PACS Enhancement */}
                <QuickSearch className="max-w-md" />
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm">{currentUser?.name || 'Guest'}</div>
                <button onClick={() => navto('/settings')} className="px-2 py-1 text-xs rounded bg-slate-200 hover:bg-slate-300">Settings</button>
                <button
                  onClick={logout}
                  disabled={isLoggingOut}
                  className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isLoggingOut ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            </div>
            <div className="p-6">
              {children}
            </div>
          </main>

          {/* Worklist Widget - PACS Enhancement */}
          <WorklistWidget
            isOpen={worklistOpen}
            onToggle={() => setWorklistOpen(!worklistOpen)}
          />
        </>
      ) : (
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            {children}
          </div>
        </main>
      )}
    </div>
  )
}
