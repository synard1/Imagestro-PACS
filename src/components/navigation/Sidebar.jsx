import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  ChevronLeft, 
  ChevronRight, 
  LayoutDashboard, 
  ClipboardList, 
  ListTodo, 
  Files, 
  FileText, 
  Shield,
  HardDrive,
  Settings,
  Monitor,
  Activity,
  Database,
  Link as LinkIcon,
  Globe,
  Activity as ActivityIcon,
  CreditCard as CreditCardIcon,
  Sparkles as SparklesIcon,
  Building2 as BuildingOfficeIcon,
  BarChart3 as ChartBarIcon,
  Users as UserGroupIcon,
  ChevronDown,
  UserSquare2,
  User2,
  Stethoscope,
  Briefcase,
  Layers,
  Cpu,
  Table,
  ArrowRightLeft,
  Server,
  Upload,
  Heart,
  Tag as TagIcon
  } from 'lucide-react';
  import { useAuth } from '../../hooks/useAuth';
  import { can, getCurrentUser } from '../../services/rbac';
  import { getCompanyProfile } from '../../services/settingsService';
  import { NAVIGATION_CONFIG } from '../../config/navigation';

  const SIDEBAR_COLLAPSED_KEY = 'app_sidebar_collapsed';

  export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved ? JSON.parse(saved) : false;
  });
  const location = useLocation();
  const { currentUser } = useAuth();
  const [branding, setBranding] = useState({
    appTitle: 'PACS UI',
    shortTitle: 'P',
    logoUrl: ''
  });

  const [expandedSections, setExpandedSections] = useState({
    'Management': true,
    'Master Data': true,
    'Integrations': true,
    'SaaS Management': false,
    'Administration': false,
    'System': false
  });

  const activeUser = currentUser || getCurrentUser();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // Load branding from settings
  useEffect(() => {
    const loadBranding = async () => {
      try {
        const profile = await getCompanyProfile();
        if (profile) {
          setBranding({
            appTitle: profile.appTitle || 'PACS UI',
            shortTitle: profile.shortTitle || 'P',
            logoUrl: profile.logoUrl || ''
          });
        }
      } catch (err) {
        console.warn('Failed to load branding in sidebar', err);
      }
    };

    loadBranding();

    // Listen for branding updates
    window.addEventListener('app-branding-updated', loadBranding);
    return () => window.removeEventListener('app-branding-updated', loadBranding);
  }, []);

  const toggleSection = (title) => {
    setExpandedSections(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

   const navItems = React.useMemo(() => {
     return NAVIGATION_CONFIG.map(section => {
       const filteredItems = section.items.filter(item => {
         // Special handling for Dev-only items
         if (item.path === '/debug-storage' && !import.meta.env.DEV) return false;
         
         // Permission check
         if (!item.permission) return true;
         return can(item.permission, activeUser);
       });

       return {
         ...section,
         items: filteredItems
       };
     }).filter(section => section.items.length > 0);
   }, [activeUser]);

  // Auto-expand section containing active route
  useEffect(() => {
    const currentPath = location.pathname;
    
    // Find section that contains the current path
    const activeSection = navItems.find(section => 
      section.items.some(item => 
        currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path))
      )
    );

    if (activeSection) {
      setExpandedSections(prev => {
        // Only update if not already expanded to avoid unnecessary state updates
        if (prev[activeSection.title]) return prev;
        return {
          ...prev,
          [activeSection.title]: true
        };
      });
    }
  }, [location.pathname, navItems]);

  return (
    <aside 
      className={`bg-sidebar-bg border-r border-main-border flex flex-col transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-main-border bg-sidebar-bg/50 backdrop-blur-sm sticky top-0 z-10">
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold overflow-hidden shadow-sm">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : branding.shortTitle}
            </div>
            <span className="text-main-text font-bold text-lg tracking-tight truncate max-w-[140px]">{branding.appTitle}</span>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold mx-auto overflow-hidden shadow-sm">
             {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : branding.shortTitle}
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg border border-main-border hover:bg-secondary-100 text-secondary-500 transition-colors hidden md:block"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar">
        {navItems.map((section) => (
          <div key={section.title} className="mb-4">
            {!isCollapsed && (
              <button 
                onClick={() => toggleSection(section.title)}
                className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-bold text-secondary-400 uppercase tracking-wider mb-1 hover:text-secondary-600 transition-colors"
              >
                <span>{section.title}</span>
                <ChevronDown size={12} className={`transition-transform ${expandedSections[section.title] ? '' : '-rotate-90'}`} />
              </button>
            )}
            
            {(!isCollapsed && expandedSections[section.title] || isCollapsed) && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `
                      flex items-center space-x-3 px-3 py-2 rounded-xl transition-all group
                      ${isActive 
                        ? 'bg-primary-50 text-primary-700 font-semibold shadow-sm' 
                        : 'text-secondary-600 hover:bg-secondary-50 hover:text-secondary-900'}
                      ${isCollapsed ? 'justify-center space-x-0' : ''}
                    `}
                    title={isCollapsed ? item.name : ''}
                  >
                    <item.icon 
                      size={20} 
                      className={`${
                        location.pathname.startsWith(item.path) ? 'text-primary-600' : 'text-secondary-400 group-hover:text-secondary-600'
                      }`} 
                    />
                    {!isCollapsed && (
                      <span className="truncate text-sm">
                        {item.name}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {!isCollapsed && activeUser && (
        <div className="p-4 border-t border-main-border bg-secondary-50/30">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-primary-700 font-bold">
              {(activeUser.name || activeUser.username || 'U').substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-main-text truncate">{activeUser.name || activeUser.username}</p>
              <p className="text-xs text-secondary-500 truncate capitalize">{activeUser.role || 'User'}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
