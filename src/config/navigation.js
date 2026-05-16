import { 
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
  UserSquare2,
  User2,
  Stethoscope,
  Briefcase,
  Layers,
  Cpu,
  Table,
  ArrowRightLeft,
  Upload,
  Heart,
  Tag as TagIcon,
  ScrollText,
} from 'lucide-react';

/**
 * Centralized Navigation Configuration
 * 
 * Defines the structure, routing, and access control for the application sidebar.
 * Permissions are normalized from 'resource:action' to 'resource.action'.
 */
export const NAVIGATION_CONFIG = [
  {
    title: 'Management',
    items: [
      { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
      { name: 'Orders', path: '/orders', icon: ClipboardList, permission: 'order.view' },
      { name: 'Worklist', path: '/worklist', icon: ListTodo, permission: 'worklist.view' },
      { name: 'Studies', path: '/studies', icon: Files, permission: 'study.view' },
      { name: 'Upload DICOM', path: '/upload', icon: Upload, permission: 'study.upload' },
    ]
  },
  {
    title: 'Master Data',
    items: [
      { name: 'Patients', path: '/patients', icon: UserSquare2, permission: 'patient.view' },
      { name: 'Procedures', path: '/procedures', icon: Layers, permission: 'procedure.view' },
      { name: 'Doctors', path: '/doctors', icon: Stethoscope, permission: 'doctor.view' },
      { name: 'Nurses', path: '/nurses', icon: User2, permission: 'nurse.view' },
      { name: 'Mappings', path: '/mappings', icon: Table, permission: 'mapping.view' },
      { name: 'Modalities', path: '/modalities', icon: Briefcase, permission: 'modality.view' },
      { name: 'DICOM Nodes', path: '/dicom-nodes', icon: Cpu, permission: 'node.view' },
    ]
  },
  {
    title: 'Integrations',
    items: [
      { name: 'External Systems', path: '/external-systems', icon: Globe, permission: 'external_system.read' },
      { name: 'Integrations Hub', path: '/integrations-hub', icon: LinkIcon, permission: 'integration.view' },
      { name: 'Integration Monitor', path: '/integration-monitor', icon: ActivityIcon, permission: 'integration.view' },
      { name: 'SatuSehat Monitor', path: '/satusehat-monitor', icon: Heart, permission: 'order.view' },
    ]
  },
  {
    title: 'SaaS Management',
    items: [
      { name: 'Tenants', path: '/tenants', icon: BuildingOfficeIcon, permission: 'system.admin' },
      { name: 'Subscriptions', path: '/subscriptions', icon: CreditCardIcon, permission: 'system.admin' },
      { name: 'Products', path: '/products', icon: SparklesIcon, permission: 'system.admin' },
      { name: 'Usage', path: '/usage-dashboard', icon: ChartBarIcon, permission: 'system.admin' },
    ]
  },
  {
    title: 'Tools',
    items: [
      { name: 'Data Management', path: '/data-management', icon: Database, permission: 'system.admin' },
      { name: 'DICOM UID Gen', path: '/dicom-uid-generator', icon: Cpu, permission: 'study.create' },
      { name: 'DICOM Tag Inspector', path: '/dicom-upload', icon: TagIcon, permission: 'study.upload' },
      { name: 'DICOM Viewer Demo', path: '/dicom-viewer-demo', icon: Monitor, permission: null }, // Null means any authenticated user
      { name: 'Simulation', path: '/simulation', icon: ActivityIcon, permission: 'system.admin' },
      { name: 'PHI Migration', path: '/phi-migration', icon: ArrowRightLeft, permission: 'system.admin' },
      { name: 'Impersonate History', path: '/impersonate-history', icon: ClipboardList, permission: 'user.manage' },
      { name: 'Signature Test', path: '/signature-test', icon: Shield, permission: 'system.admin' },
    ]
  },
  {
    title: 'Administration',
    items: [
      { name: 'My Subscription', path: '/my-subscription', icon: SparklesIcon, permission: 'TENANT_ADMIN' }, // Role-based string
      { name: 'Billing & Invoices', path: '/billing', icon: FileText, permission: 'TENANT_ADMIN' },
      { name: 'Users', path: '/users', icon: UserGroupIcon, permission: 'user.read' },
      { name: 'Roles', path: '/roles', icon: Shield, permission: 'user.read' },
    ]
  },
  {
    title: 'Storage',
    items: [
      { name: 'Storage Providers', path: '/storage-providers', icon: Database, permission: 'storage.manage' },
      { name: 'Storage Migration', path: '/storage-migration', icon: ArrowRightLeft, permission: 'storage.manage' },
      { name: 'Storage Monitor', path: '/storage-monitor', icon: HardDrive, permission: 'storage.view' },
    ]
  },
  {
    title: 'System',
    items: [
      { name: 'Reports', path: '/reports', icon: FileText, permission: 'report.view' },
      { name: 'Log Viewer', path: '/admin/logs', icon: ScrollText, permission: 'logs.read' },
      { name: 'Audit Logs', path: '/audit-logs', icon: Shield, permission: 'audit.view' },
      { name: 'Auth Audit Logs', path: '/auth-audit-logs', icon: Shield, permission: 'audit.view' },
      { name: 'System Status', path: '/status', icon: Activity, permission: 'system.status' },
      { name: 'Settings', path: '/settings', icon: Settings, permission: 'setting.read' },
    ]
  }
];
