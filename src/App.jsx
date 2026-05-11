import React, { useEffect, useState, Suspense, useMemo, lazy } from 'react'
import { Routes, Route, Navigate, Outlet, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useTokenRefresh } from './hooks/useTokenRefresh'
import LoadingScreen from './components/LoadingScreen'
import { ViewerErrorBoundary } from './components/viewer/ViewerErrorBoundary'
import ToastProvider from './components/ToastProvider'
import { ThemeProvider } from './contexts/ThemeContext'

// Lazy load all components to prevent loading on login page
const Layout = lazy(() => import('./components/Layout'))
const Login = lazy(() => import('./pages/Login'))
const ProtectedRoute = lazy(() => import('./components/ProtectedRoute'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Worklist = lazy(() => import('./pages/Worklist'))
const OrderForm = lazy(() => import('./pages/OrderForm'))
const Orders = lazy(() => import('./pages/Orders'))
const SatusehatMonitor = lazy(() => import('./pages/SatusehatMonitorClean'))
const OrderWorkflow = lazy(() => import('./pages/OrderWorkflow'))
const Studies = lazy(() => import('./pages/Studies'))
const SystemStatus = lazy(() => import('./pages/SystemStatus'))
const StudyListEnhanced = lazy(() => import('./pages/studies/StudyListEnhanced'))
const Patients = lazy(() => import('./pages/Patients'))
const PatientForm = lazy(() => import('./pages/PatientForm'))
const Doctors = lazy(() => import('./pages/Doctors'))
const DoctorForm = lazy(() => import('./pages/DoctorForm'))
const Nurses = lazy(() => import('./pages/Nurses'))
const NurseForm = lazy(() => import('./pages/NurseForm'))
const Modalities = lazy(() => import('./pages/Modalities'))
const DicomNodes = lazy(() => import('./pages/admin/DicomNodes'))
const Users = lazy(() => import('./pages/Users'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const RolesManagement = lazy(() => import('./pages/RolesManagement'))
const PermissionsManagement = lazy(() => import('./pages/PermissionsManagement'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))
const AuthAuditLogs = lazy(() => import('./pages/AuthAuditLogs'))
const DataManagement = lazy(() => import('./pages/admin/DataManagement'))
const Settings = lazy(() => import('./pages/Settings'))
const ReportSettings = lazy(() => import('./pages/settings/ReportSettings'))
const DicomUidGenerator = lazy(() => import('./pages/DicomUidGenerator'))
const StudyDetail = lazy(() => import('./pages/viewer/StudyDetail'))
const DicomViewerSimple = lazy(() => import('./pages/viewer/DicomViewerSimple'))
const DicomViewerEnhanced = lazy(() => import('./pages/viewer/DicomViewerEnhanced'))
const DicomViewerDemo = lazy(() => import('./pages/viewer/DicomViewerDemo'))
const ReportEditor = lazy(() => import('./pages/reporting/ReportEditor'))
const VerifySignature = lazy(() => import('./pages/VerifySignature'))
const SignatureTest = lazy(() => import('./pages/SignatureTest'))
const DicomUploadPage = lazy(() => import('./pages/DicomUploadPage'))
const DicomUpload = lazy(() => import('./pages/DicomUpload'))
const Reports = lazy(() => import('./pages/Reports'))
const ReportsWrapper = lazy(() => import('./pages/reports/ReportsWrapper'))
const ReportsDashboard = lazy(() => import('./pages/reports/ReportsDashboard'))
const RegistrationReport = lazy(() => import('./pages/reports/RegistrationReport'))
const ModalityReport = lazy(() => import('./pages/reports/ModalityReport'))
const SatusehatReport = lazy(() => import('./pages/reports/SatusehatReport'))
const WorklistReport = lazy(() => import('./pages/reports/WorklistReport'))
const StorageReport = lazy(() => import('./pages/reports/StorageReport'))
const ProductivityReport = lazy(() => import('./pages/reports/ProductivityReport'))
const AuditReport = lazy(() => import('./pages/reports/AuditReport'))
const StudyReportLauncher = lazy(() => import('./pages/reports/StudyReportLauncher'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Procedures = lazy(() => import('./pages/Procedures'))
const Subscriptions = lazy(() => import('./pages/Subscriptions'))
const Tenants = lazy(() => import('./pages/Tenants'))
const Products = lazy(() => import('./pages/Products'))
const UsageDashboard = lazy(() => import('./pages/UsageDashboard'))
const MySubscription = lazy(() => import('./pages/MySubscription'))
const BillingDashboard = lazy(() => import('./pages/Billing/BillingDashboard'))
const ProcedureForm = lazy(() => import('./pages/ProcedureForm'))
const Mappings = lazy(() => import('./pages/Mappings'))
const MappingsEnhanced = lazy(() => import('./pages/MappingsEnhanced'))
const MappingForm = lazy(() => import('./pages/MappingForm'))
const ExternalSystemsDocs = lazy(() => import('./pages/ExternalSystemsDocs'))
const ExternalSystemDocForm = lazy(() => import('./pages/ExternalSystemDocForm'))
const DebugStorage = lazy(() => import('./pages/DebugStorage'))
const EnhancedAuditLogs = lazy(() => import('./pages/EnhancedAuditLogs'))
const StorageLifecycleManagement = lazy(() => import('./pages/StorageLifecycleManagement'))
const IntegrationMonitor = lazy(() => import('./pages/IntegrationMonitor'))
const IntegrationsHub = lazy(() => import('./pages/IntegrationsHub'))
const StorageMonitorPage = lazy(() => import('./pages/StorageMonitorPage'))
const StorageProviders = lazy(() => import('./pages/admin/StorageProvidersPage'))
const StorageMigration = lazy(() => import('./pages/admin/StorageMigration'))
const ExternalSystems = lazy(() => import('./pages/ExternalSystems'))
const IntakeDashboard = lazy(() => import('./pages/pacs/intake/IntakeDashboard'))
const IntakeSchedule = lazy(() => import('./pages/pacs/intake/IntakeSchedule'))
const Profile = lazy(() => import('./pages/Profile'))
const ThemeSettings = lazy(() => import('./pages/ThemeSettings'))
const PHIMigrationUI = lazy(() => import('./components/PHIMigrationUI'))
const SimulationApp = lazy(() => import('./components/Simulation/SimulationApp'))
const ImpersonateHistoryPage = lazy(() => import('./pages/ImpersonateHistoryPage'))
const DevCacheManager = lazy(() => import('./components/DevCacheManager'))
// Example page for advanced features demonstration
const PatientsExample = lazy(() => import('./pages/PatientsExample'))
// Changelog
const ChangelogLayout = lazy(() => import('./apps/ChangelogLayout'))
const ChangelogViewer = lazy(() => import('./pages/ChangelogViewer'))
// ServerStatusMonitor handled by inline script in index.html

const REPORTS_ALLOWED_ROLES = ['superadmin', 'developer']

// Wraps DicomViewerEnhanced in an ErrorBoundary that lives in the MAIN bundle.
// The boundary must be outside the lazy chunk — if the chunk itself fails to
// evaluate (e.g. TDZ in @cornerstonejs), the boundary must already be mounted.
function EnhancedViewerRoute() {
  const { studyId } = useParams();
  const navigate = useNavigate();
  return (
    <ViewerErrorBoundary onFallback={() => navigate(`/viewer/${studyId}`)}>
      <DicomViewerEnhanced />
    </ViewerErrorBoundary>
  );
}

// Layout wrapper component for nested routes
function LayoutWrapper() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

// Layout wrapper for Changelog routes
function ChangelogRouteWrapper() {
  return (
    <ChangelogLayout>
      <Outlet />
    </ChangelogLayout>
  )
}

// Simple login layout component - transparent wrapper to allow Login page to control its own styling
function LoginLayout({ children }) {
  return (
    <div className="h-screen w-screen">
      {children}
    </div>
  )
}

// Home redirect component
function HomeIndex() {
  return <Navigate to="/dashboard" replace />
}

// Loading component
function AppLoading() {
  return <LoadingScreen message="Loading application..." />
}

export default function App() {
  const { currentUser } = useAuth() || {}
  const [isInitializing, setIsInitializing] = useState(true)
  
  console.log('[App] Version: 1.0.3-CLEAN-VIEWER');
  const canAccessReports = useMemo(() => {
    const role = (currentUser?.role || '').toLowerCase()
    return REPORTS_ALLOWED_ROLES.includes(role)
  }, [currentUser])

  // Auto-refresh token before expiration
  useTokenRefresh()

  useEffect(() => {
    // Initialize auth on app mount - ONLY verify existing session
    // Do NOT initialize session manager here - it will be initialized after login
    async function init() {
      try {
        // Dynamic import to avoid loading services on initial bundle
        const [{ loadRegistry }, { getAuth, initAuthCache }, { getCurrentUser }] = await Promise.all([
          import('./services/api-registry'),
          import('./services/auth-storage'),
          import('./services/rbac')
        ]);

        // Hydrate in-memory auth cache from encrypted localStorage before any getAuth() calls
        await initAuthCache();

        const registry = loadRegistry()
        const authConfig = registry.auth

        // Only verify if backend auth is enabled AND user has existing session
        if (authConfig && authConfig.enabled) {
          const existingAuth = getAuth();
          const existingUser = getCurrentUser();

          // If we have both token and user, verify the session
          if (existingAuth?.access_token && existingUser?.id) {
            console.info('[App] Existing session found, verifying...');

            try {
              // Lazy load auth service only if we need to verify
              const { verifyToken } = await import('./services/authService');
              await verifyToken();

              // Initialize session manager for existing session
              const sessionManagerModule = await import('./services/sessionManager');
              const sessionManager = sessionManagerModule.default;
              sessionManager.initialize();
              console.info('[App] Session verified and manager initialized');
            } catch (error) {
              console.warn('[App] Session verification failed:', error.message);
              // Don't initialize session manager if verification failed
            }
          } else {
            console.info('[App] No existing session found');
          }
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error)
        // Continue anyway - user will be redirected to login if needed
      } finally {
        setIsInitializing(false)
      }
    }

    init()
  }, [])

  // Show loading state while initializing
  if (isInitializing) {
    return <AppLoading />
  }

  return (
    <ThemeProvider>
      <React.Fragment>
        <Suspense fallback={<AppLoading />}>
          <Routes>
            {/* Public route - Login page (no Layout) */}
            <Route path="/login" element={
              <LoginLayout>
                <Login />
              </LoginLayout>
            } />

            {/* Public routes - No auth required */}
            <Route path="/verify-signature" element={<VerifySignature />} />

            {/* Protected routes - Wrapped with Layout using Outlet */}
            <Route path="/" element={<HomeIndex />} />

            {/* All authenticated routes share the same Layout instance */}
            <Route element={<LayoutWrapper />}>
              <Route path="/dashboard" element={
                <ProtectedRoute permissions={['dashboard.view']}>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/worklist" element={
                <ProtectedRoute permissions={['worklist.view']}>
                  <Worklist />
                </ProtectedRoute>
              } />
              <Route path="/orders/new" element={
                <ProtectedRoute permissions={['order.create', 'order.*']} any>
                  <OrderForm />
                </ProtectedRoute>
              } />
              <Route path="/orders/workflow" element={
                <ProtectedRoute permissions={['order.view', 'order.*']} any>
                  <OrderWorkflow />
                </ProtectedRoute>
              } />
              <Route path="/orders/:id" element={
                <ProtectedRoute permissions={['order.view', 'order.update', 'order.*']} any>
                  <OrderForm />
                </ProtectedRoute>
              } />
              <Route path="/orders" element={
                <ProtectedRoute permissions={['order.view', 'order.*']} any>
                  <Orders />
                </ProtectedRoute>
              } />
              <Route path="/reports" element={
                <ProtectedRoute permissions={['report.view', 'order.view', '*']} any>
                  <ReportsWrapper />
                </ProtectedRoute>
              }>
                <Route index element={<ReportsDashboard />} />
                <Route path="dashboard" element={
                  <ProtectedRoute permissions={['report.view', '*']} any>
                    <ReportsDashboard />
                  </ProtectedRoute>
                } />
                <Route path="registration" element={
                  <ProtectedRoute permissions={['report.view', '*']} any>
                    <RegistrationReport />
                  </ProtectedRoute>
                } />
                <Route path="modality" element={
                  <ProtectedRoute permissions={['report.view', '*']} any>
                    <ModalityReport />
                  </ProtectedRoute>
                } />
                <Route path="satusehat" element={
                  <ProtectedRoute permissions={['report.view', '*']} any>
                    <SatusehatReport />
                  </ProtectedRoute>
                } />
                <Route path="worklist" element={
                  <ProtectedRoute permissions={['report.view', '*']} any>
                    <WorklistReport />
                  </ProtectedRoute>
                } />
                <Route path="storage" element={
                  <ProtectedRoute permissions={['report.view', 'storage.view', '*']} any>
                    <StorageReport />
                  </ProtectedRoute>
                } />
                <Route path="productivity" element={
                  <ProtectedRoute permissions={['report.view', '*']} any>
                    <ProductivityReport />
                  </ProtectedRoute>
                } />
                <Route path="audit" element={
                  <ProtectedRoute permissions={['report.view', 'audit.view', '*']} any>
                    <AuditReport />
                  </ProtectedRoute>
                } />
                <Route path="study-reports" element={
                  <ProtectedRoute permissions={['report.view', '*']} any>
                    <StudyReportLauncher />
                  </ProtectedRoute>
                } />
              </Route>
              <Route path="/satusehat-monitor" element={
                <ProtectedRoute permissions={['order.view', 'order.*']} any>
                  <SatusehatMonitor />
                </ProtectedRoute>
              } />
              <Route path="/pacs/intake" element={
                <ProtectedRoute permissions={['intake.view', 'intake.*']} any>
                  <IntakeDashboard />
                </ProtectedRoute>
              } />
              <Route path="/pacs/intake/schedule/:id" element={
                <ProtectedRoute permissions={['intake.schedule', 'intake.*']} any>
                  <IntakeSchedule />
                </ProtectedRoute>
              } />
              <Route path="/studies" element={
                <ProtectedRoute permissions={['study.view', 'study.*']} any>
                  <StudyListEnhanced />
                </ProtectedRoute>
              } />
              <Route path="/studies/legacy" element={
                <ProtectedRoute permissions={['study.view', 'study.*']} any>
                  <Studies />
                </ProtectedRoute>
              } />
              {/* PACS Upload - Protected - Now using Layout */}
              <Route path="/upload" element={
                <ProtectedRoute permissions={['studies.upload', 'study.*', '*']} any>
                  <DicomUploadPage />
                </ProtectedRoute>
              } />
              <Route path="/dicom-upload" element={
                <ProtectedRoute permissions={['studies.upload', 'study.*', '*']} any>
                  <DicomUpload />
                </ProtectedRoute>
              } />
              <Route path="/patients/new" element={
                <ProtectedRoute permissions={['patient.create', 'patient.*']} any>
                  <PatientForm />
                </ProtectedRoute>
              } />
              <Route path="/patients/:id" element={
                <ProtectedRoute permissions={['patient.view', 'patient.update', 'patient.*']} any>
                  <PatientForm />
                </ProtectedRoute>
              } />
              <Route path="/patients" element={
                <ProtectedRoute permissions={['patient.view', 'patient.*']} any>
                  <Patients />
                </ProtectedRoute>
              } />
              <Route path="/patients-example" element={
                <ProtectedRoute permissions={['patient.view', 'patient.*']} any>
                  <PatientsExample />
                </ProtectedRoute>
              } />
              <Route path="/procedures/new" element={
                <ProtectedRoute permissions={['procedure.create', 'procedure.*']} any>
                  <ProcedureForm />
                </ProtectedRoute>
              } />
              <Route path="/procedures/:id" element={
                <ProtectedRoute permissions={['procedure.view', 'procedure.update', 'procedure.*']} any>
                  <ProcedureForm />
                </ProtectedRoute>
              } />
              <Route path="/procedures" element={
                <ProtectedRoute permissions={['procedure.view', 'procedure.*']} any>
                  <Procedures />
                </ProtectedRoute>
              } />
              <Route path="/doctors/new" element={
                <ProtectedRoute permissions={['doctor.create', 'doctor.*']} any>
                  <DoctorForm />
                </ProtectedRoute>
              } />
              <Route path="/doctors/:id" element={
                <ProtectedRoute permissions={['doctor.view', 'doctor.update', 'doctor.*']} any>
                  <DoctorForm />
                </ProtectedRoute>
              } />
              <Route path="/doctors" element={
                <ProtectedRoute permissions={['doctor.view', 'doctor.*']} any>
                  <Doctors />
                </ProtectedRoute>
              } />
              <Route path="/nurses/new" element={
                <ProtectedRoute permissions={['nurse.create', 'nurse.*']} any>
                  <NurseForm />
                </ProtectedRoute>
              } />
              <Route path="/nurses/:id/edit" element={
                <ProtectedRoute permissions={['nurse.update', 'nurse.*']} any>
                  <NurseForm />
                </ProtectedRoute>
              } />
              <Route path="/nurses/:id" element={
                <ProtectedRoute permissions={['nurse.view', 'nurse.*']} any>
                  <NurseForm />
                </ProtectedRoute>
              } />
              <Route path="/nurses" element={
                <ProtectedRoute permissions={['nurse.view', 'nurse.*']} any>
                  <Nurses />
                </ProtectedRoute>
              } />
              <Route path="/mappings/new" element={
                <ProtectedRoute permissions={['mapping.create', 'mapping.*']} any>
                  <MappingForm />
                </ProtectedRoute>
              } />
              <Route path="/mappings/:id" element={
                <ProtectedRoute permissions={['mapping.view', 'mapping.update', 'mapping.*']} any>
                  <MappingForm />
                </ProtectedRoute>
              } />
              <Route path="/mappings-enhanced" element={
                <ProtectedRoute permissions={['mapping.view', 'mapping.*']} any>
                  <MappingsEnhanced />
                </ProtectedRoute>
              } />
              <Route path="/mappings" element={
                <ProtectedRoute permissions={['mapping.view', 'mapping.*']} any>
                  <Mappings />
                </ProtectedRoute>
              } />

              <Route path="/modalities" element={
                <ProtectedRoute permissions={['modality.manage', 'modality.view']} any>
                  <Modalities />
                </ProtectedRoute>
              } />
              <Route path="/dicom-nodes" element={
                <ProtectedRoute permissions={['node.manage', 'node.view']} any>
                  <DicomNodes />
                </ProtectedRoute>
              } />
              {/* <Route path="/users" element={
            <ProtectedRoute permissions={['user.manage','user.view']} any>
              <Users />
            </ProtectedRoute>
          } /> */}
              <Route path="/users" element={
                <ProtectedRoute permissions={['user.manage', 'user.read', '*']} any>
                  <UserManagement />
                </ProtectedRoute>
              } />
              <Route path="/roles" element={
                <ProtectedRoute permissions={['user.manage', 'user.read', '*']} any>
                  <RolesManagement />
                </ProtectedRoute>
              } />
              <Route path="/permissions" element={
                <ProtectedRoute permissions={['user.manage', 'user.read', '*']} any>
                  <PermissionsManagement />
                </ProtectedRoute>
              } />
              <Route path="/subscriptions" element={
                <ProtectedRoute permissions={['*:superadmin']} any>
                  <Subscriptions />
                </ProtectedRoute>
              } />
              <Route path="/tenants" element={
                <ProtectedRoute permissions={['*:superadmin']} any>
                  <Tenants />
                </ProtectedRoute>
              } />
              <Route path="/products" element={
                <ProtectedRoute permissions={['*:superadmin']} any>
                  <Products />
                </ProtectedRoute>
              } />
              <Route path="/usage-dashboard" element={
                <ProtectedRoute permissions={['*:superadmin']} any>
                  <UsageDashboard />
                </ProtectedRoute>
              } />
              <Route path="/my-subscription" element={
                <ProtectedRoute permissions={['TENANT_ADMIN', '*']} any>
                  <MySubscription />
                </ProtectedRoute>
              } />
              <Route path="/billing" element={
                <ProtectedRoute permissions={['TENANT_ADMIN', '*']} any>
                  <BillingDashboard />
                </ProtectedRoute>
              } />
              <Route path="/signature-test" element={
                <ProtectedRoute permissions={['*:superadmin']} any>
                  <SignatureTest />
                </ProtectedRoute>
              } />
              <Route path="/impersonate-history" element={
                <ProtectedRoute permissions={['user:manage', '*']} any>
                  <ImpersonateHistoryPage />
                </ProtectedRoute>
              } />
              {/* <Route path="/audit-logs" element={
            <ProtectedRoute permissions={['audit.view']}>
              <AuditLogs />
            </ProtectedRoute>
          } /> */}
              <Route path="/auth-audit-logs" element={
                <ProtectedRoute permissions={['audit.view', '*']} any>
                  <AuthAuditLogs />
                </ProtectedRoute>
              } />
              <Route path="/audit-logs" element={
                <ProtectedRoute permissions={['audit.view', '*']} any>
                  <EnhancedAuditLogs />
                </ProtectedRoute>
              } />
              <Route path="/storage-management" element={<Navigate to="/storage-providers" replace />} />
              <Route path="/storage-backends" element={<Navigate to="/storage-providers" replace />} />
              <Route path="/storage-providers" element={
                <ProtectedRoute permissions={['storage.manage', '*']} any>
                  <StorageProviders />
                </ProtectedRoute>
              } />
              <Route path="/storage-lifecycle" element={
                <ProtectedRoute permissions={['storage.manage', '*']} any>
                  <StorageLifecycleManagement />
                </ProtectedRoute>
              } />
              <Route path="/storage-monitor" element={
                <ProtectedRoute permissions={['storage.view', 'storage.manage', '*']} any>
                  <StorageMonitorPage />
                </ProtectedRoute>
              } />
              <Route path="/storage-migration" element={
                <ProtectedRoute permissions={['storage.manage', '*']} any>
                  <StorageMigration />
                </ProtectedRoute>
              } />
              <Route path="/status" element={
                <ProtectedRoute permissions={['*']} any>
                  <SystemStatus />
                </ProtectedRoute>
              } />
              <Route path="/integration-monitor" element={
                <ProtectedRoute permissions={['integration.view', '*']} any>
                  <IntegrationMonitor />
                </ProtectedRoute>
              } />
              <Route path="/integrations-hub" element={
                <ProtectedRoute permissions={['integration.view', '*']} any>
                  <IntegrationsHub />
                </ProtectedRoute>
              } />
              {/* Redirect old SIMRS Khanza integration to unified external systems */}
              <Route path="/khanza-integration" element={<Navigate to="/external-systems" replace />} />

              {/* Redirect old external systems docs to unified external systems */}
              <Route path="/external-systems-docs" element={<Navigate to="/external-systems" replace />} />
              <Route path="/external-systems-docs/:id" element={<Navigate to="/external-systems" replace />} />
              <Route path="/external-systems-docs/new" element={<Navigate to="/external-systems" replace />} />

              <Route path="/external-systems" element={
                <ProtectedRoute permissions={['external_system.read', 'external_system.manage', '*']} any>
                  <ExternalSystems />
                </ProtectedRoute>
              } />
              <Route path="/data-management" element={
                <ProtectedRoute permissions={['*']} any>
                  <DataManagement />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute permissions={['setting.read', 'setting.write', '*']} any>
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="/settings/reports" element={
                <ProtectedRoute permissions={['setting.write', '*']} any>
                  <ReportSettings />
                </ProtectedRoute>
              } />
              <Route path="/theme-settings" element={
                <ProtectedRoute permissions={['*']} any>
                  <ThemeSettings />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              } />
              <Route path="/phi-migration" element={
                <ProtectedRoute permissions={['*']} any>
                  <PHIMigrationUI />
                </ProtectedRoute>
              } />
              <Route path="/simulation" element={
                <ProtectedRoute permissions={['*']} any>
                  <SimulationApp />
                </ProtectedRoute>
              } />
              {/* Debug Storage - Only available in development mode */}
              {import.meta.env.DEV && (
                <Route path="/debug-storage" element={
                  <ProtectedRoute permissions={['*']} any>
                    <DebugStorage />
                  </ProtectedRoute>
                } />
              )}
              <Route path="/dicom-uid-generator" element={
                <ProtectedRoute permissions={['study.create', 'study.*', '*']} any>
                  <DicomUidGenerator />
                </ProtectedRoute>
              } />
              <Route path="/study/:studyId" element={
                <ProtectedRoute permissions={['study.view', 'study.*']} any>
                  <StudyDetail />
                </ProtectedRoute>
              } />
              {/* Unified 2D Viewer Routes */}
              <Route path="/viewer/:studyId" element={
                <ProtectedRoute permissions={['study.view', 'study.*']} any>
                  <DicomViewerSimple />
                </ProtectedRoute>
              } />
              <Route path="/viewer/enhanced/:studyId" element={
                <ProtectedRoute permissions={['study.view', 'study.*']} any>
                  <EnhancedViewerRoute />
                </ProtectedRoute>
              } />
              {/* DICOM Viewer Demo - Test upload & view without database */}
              <Route path="/dicom-viewer-demo" element={
                <ProtectedRoute any>
                  <DicomViewerDemo />
                </ProtectedRoute>
              } />

              <Route path="/report/:studyId" element={
                <ProtectedRoute permissions={['report.create', 'report.*']} any>
                  <ReportEditor />
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* Changelog routes - uses separate layout */}
            <Route element={<ChangelogRouteWrapper />}>
              <Route path="/changelog" element={
                <ProtectedRoute permissions={['*']} any>
                  <ChangelogViewer />
                </ProtectedRoute>
              } />
            </Route>
          </Routes>
        </Suspense>

        {/* Development Tools - Only show in development */}
        <Suspense fallback={null}>
          <DevCacheManager />
        </Suspense>
      </React.Fragment>
    </ThemeProvider>
  )
}
