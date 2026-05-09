# Reports Layout Structure

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                         Main Application                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Layout Component                      │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │              Main Navigation Menu                 │  │   │
│  │  │  ┌─────────────────────────────────────────────┐  │  │   │
│  │  │  │ Core Features                              │  │  │   │
│  │  │  │ - Dashboard                                │  │  │   │
│  │  │  │ - Orders                                   │  │  │   │
│  │  │  │ - Worklist                                 │  │  │   │
│  │  │  │ - Patients                                 │  │  │   │
│  │  │  │ - Procedures                               │  │  │   │
│  │  │  └─────────────────────────────────────────────┘  │  │   │
│  │  │  ┌─────────────────────────────────────────────┐  │  │   │
│  │  │  │ Reports & Analytics ▼                      │  │  │   │
│  │  │  │ ├─ Dashboard                               │  │  │   │
│  │  │  │ ├─ Laporan Pendaftaran                     │  │  │   │
│  │  │  │ ├─ Laporan Modality                        │  │  │   │
│  │  │  │ ├─ Laporan SATUSEHAT                       │  │  │   │
│  │  │  │ ├─ Laporan Worklist                        │  │  │   │
│  │  │  │ ├─ Laporan Storage                         │  │  │   │
│  │  │  │ ├─ Laporan Produktivitas                   │  │  │   │
│  │  │  │ └─ Laporan Audit                           │  │  │   │
│  │  │  └─────────────────────────────────────────────┘  │  │   │
│  │  │  [More sections...]                               │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    /reports Route                        │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │              ReportsWrapper                        │  │   │
│  │  │  ┌──────────────────────────────────────────────┐  │  │   │
│  │  │  │          ReportsLayout                       │  │  │   │
│  │  │  │  ┌────────────────┬──────────────────────┐   │  │  │   │
│  │  │  │  │   Sidebar      │   Main Content      │   │  │  │   │
│  │  │  │  │ ┌────────────┐ │ ┌────────────────┐  │   │  │  │   │
│  │  │  │  │ │ Dashboard  │ │ │ Current Page  │  │   │  │  │   │
│  │  │  │  │ ├────────────┤ │ │ Content       │  │   │  │  │   │
│  │  │  │  │ │ Laporan    │ │ │               │  │   │  │  │   │
│  │  │  │  │ │ Pendaftaran│ │ │ (Outlet)      │  │   │  │  │   │
│  │  │  │  │ ├────────────┤ │ │               │  │   │  │  │   │
│  │  │  │  │ │ Laporan    │ │ │               │  │   │  │  │   │
│  │  │  │  │ │ Modality   │ │ │               │  │   │  │  │   │
│  │  │  │  │ ├────────────┤ │ │               │  │   │  │  │   │
│  │  │  │  │ │ [More...]  │ │ │               │  │   │  │  │   │
│  │  │  │  │ ├────────────┤ │ │               │  │   │  │  │   │
│  │  │  │  │ │ Kembali    │ │ │               │  │   │  │  │   │
│  │  │  │  │ └────────────┘ │ └────────────────┘  │   │  │  │   │
│  │  │  │  └────────────────┴──────────────────────┘   │  │  │   │
│  │  │  └──────────────────────────────────────────────┘  │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
App
├── Routes
│   ├── /login → Login
│   ├── /dashboard → Layout → Dashboard
│   ├── /orders → Layout → Orders
│   ├── /reports → Layout → ReportsWrapper
│   │   ├── /reports (index) → ReportsDashboard
│   │   ├── /reports/dashboard → ReportsDashboard
│   │   ├── /reports/registration → RegistrationReport
│   │   ├── /reports/modality → ModalityReport
│   │   ├── /reports/satusehat → SatusehatReport
│   │   ├── /reports/worklist → WorklistReport
│   │   ├── /reports/storage → StorageReport
│   │   ├── /reports/productivity → ProductivityReport
│   │   └── /reports/audit → AuditReport
│   └── [Other routes...]
```

## File Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── ReportsLayout.jsx          ← Reports-specific layout
│   │   └── NavigationMenu.jsx         ← Main navigation with submenu
│   ├── Layout.jsx                     ← Main app layout
│   └── [Other components...]
├── pages/
│   ├── Reports/
│   │   ├── ReportsWrapper.jsx         ← Wrapper untuk nested routes
│   │   └── Dashboard.jsx              ← Dashboard placeholder
│   ├── reports/
│   │   ├── ReportsDashboard.jsx       ← Dashboard dengan stats
│   │   ├── RegistrationReport.jsx     ← Laporan pendaftaran
│   │   ├── ModalityReport.jsx         ← Laporan modality
│   │   ├── SatusehatReport.jsx        ← Laporan SATUSEHAT
│   │   ├── WorklistReport.jsx         ← Laporan worklist
│   │   ├── StorageReport.jsx          ← Laporan storage
│   │   ├── ProductivityReport.jsx     ← Laporan produktivitas
│   │   ├── AuditReport.jsx            ← Laporan audit
│   │   └── index.js
│   └── [Other pages...]
├── App.jsx                            ← Main routing
└── main.jsx
```

## Data Flow

```
User navigates to /reports
    ↓
App.jsx routes to ReportsWrapper
    ↓
ReportsWrapper renders ReportsLayout with Outlet
    ↓
ReportsLayout renders:
  - Sidebar with menu items
  - Main content area with Outlet
    ↓
Outlet renders child route component
  (ReportsDashboard, RegistrationReport, etc.)
    ↓
Child component loads data via reportService
    ↓
Data displayed in component
```

## Sidebar Menu Structure

```
ReportsLayout
├── Header
│   ├── Title "Laporan"
│   └── Toggle Button (expand/collapse)
├── Navigation
│   ├── Dashboard
│   │   ├── Icon: ChartBarIcon
│   │   └── Description: "Ringkasan semua laporan"
│   ├── Laporan Pendaftaran
│   │   ├── Icon: DocumentChartBarIcon
│   │   └── Description: "Statistik pendaftaran order"
│   ├── Laporan Modality
│   │   ├── Icon: ComputerDesktopIcon
│   │   └── Description: "Utilisasi modalitas"
│   ├── Laporan SATUSEHAT
│   │   ├── Icon: CloudArrowUpIcon
│   │   └── Description: "Status sinkronisasi"
│   ├── Laporan Worklist
│   │   ├── Icon: QueueListIcon
│   │   └── Description: "Statistik workflow"
│   ├── Laporan Storage
│   │   ├── Icon: CircleStackIcon
│   │   └── Description: "Penggunaan storage"
│   ├── Laporan Produktivitas
│   │   ├── Icon: UserGroupIcon
│   │   └── Description: "Performa dokter & operator"
│   └── Laporan Audit
│       ├── Icon: ShieldCheckIcon
│       └── Description: "Aktivitas sistem"
└── Footer
    ├── Divider
    └── Back Button
        ├── Icon: ArrowLeftIcon
        └── Text: "Kembali"
```

## State Management

### ReportsLayout State
```javascript
{
  sidebarOpen: boolean,      // Sidebar expanded/collapsed
  location: {
    pathname: string         // Current route path
  }
}
```

### ReportsDashboard State
```javascript
{
  stats: {
    totalOrders: number,
    ordersToday: number,
    completedStudies: number,
    pendingOrders: number,
    ordersTrend: number,
    ordersTodayTrend: number,
    completedStudiesTrend: number,
    pendingOrdersTrend: number
  },
  loading: boolean,
  error: string | null
}
```

## Styling Classes

### Sidebar
- `w-64` - Full width (expanded)
- `w-20` - Collapsed width
- `bg-white` - Background color
- `border-r border-gray-200` - Right border

### Menu Items
- Active: `bg-blue-50 text-blue-700 border-l-4 border-blue-500`
- Inactive: `text-gray-600 hover:bg-gray-50 hover:text-gray-900`

### Icons
- Active: `text-blue-500`
- Inactive: `text-gray-400 group-hover:text-gray-600`

## Responsive Behavior

### Mobile (< 768px)
- Sidebar full width
- Menu items show full text
- Descriptions visible

### Tablet (768px - 1024px)
- Sidebar can be toggled
- Collapsed: 80px width (icons only)
- Expanded: 256px width (full menu)

### Desktop (> 1024px)
- Sidebar always visible
- Can be toggled
- Smooth transitions

## Permission Integration

```
User Permission Check
    ↓
hasPermission(['report.view', '*'])
    ↓
If true: Show menu items
If false: Hide menu items
    ↓
Route Protection
    ↓
ProtectedRoute component checks permission
    ↓
If authorized: Render component
If not: Redirect to unauthorized page
```

## Navigation Flow

```
Main Dashboard
    ↓
Click "Reports" in main menu
    ↓
Navigate to /reports
    ↓
ReportsWrapper renders ReportsLayout
    ↓
ReportsDashboard displays with stats
    ↓
User can:
  - Click menu item to go to specific report
  - Click "Kembali" to return to main dashboard
  - Toggle sidebar to expand/collapse
```
