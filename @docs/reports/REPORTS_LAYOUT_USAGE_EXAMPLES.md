# Reports Layout Usage Examples

## Quick Start Guide

### 1. Accessing Reports

#### Via Main Navigation Menu
```
1. Click "Reports" in the main sidebar
2. Select desired report from submenu
3. Report page loads with ReportsLayout
```

#### Via Direct URL
```
- /reports → Dashboard
- /reports/dashboard → Dashboard
- /reports/registration → Registration Report
- /reports/modality → Modality Report
- /reports/satusehat → SATUSEHAT Report
- /reports/worklist → Worklist Report
- /reports/storage → Storage Report
- /reports/productivity → Productivity Report
- /reports/audit → Audit Report
```

### 2. Using the Sidebar

#### Expanding/Collapsing
```javascript
// Click the toggle button in sidebar header
// Sidebar width changes from 256px to 80px
// Menu text and descriptions hide when collapsed
```

#### Navigating Between Reports
```javascript
// Click any menu item to navigate
// Active item is highlighted with blue background
// Left border indicates current page
```

#### Returning to Dashboard
```javascript
// Click "Kembali" button at bottom of sidebar
// Navigates back to main dashboard
```

## Code Examples

### 1. Using ReportsLayout in a Custom Report

```jsx
import { useEffect, useState } from 'react';
import ReportsLayout from '../../components/layout/ReportsLayout';
import reportService from '../../services/reportService';

export default function CustomReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const result = await reportService.getCustomReport();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <ReportsLayout>
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Custom Report</h1>
        {/* Your report content here */}
      </div>
    </ReportsLayout>
  );
}
```

### 2. Adding a New Report to the Menu

```jsx
// In src/components/layout/ReportsLayout.jsx

const reportMenuItems = [
  // ... existing items ...
  {
    name: 'Laporan Custom',
    href: '/reports/custom',
    icon: ChartBarIcon,
    description: 'Laporan custom baru',
    permissions: ['report.view', '*']
  }
];
```

### 3. Adding a New Route

```jsx
// In src/App.jsx

<Route path="/reports" element={
  <ProtectedRoute permissions={['report.view', 'order.view', '*']} any>
    <ReportsWrapper />
  </ProtectedRoute>
}>
  {/* ... existing routes ... */}
  <Route path="custom" element={
    <ProtectedRoute permissions={['report.view', '*']} any>
      <CustomReport />
    </ProtectedRoute>
  } />
</Route>
```

### 4. Using Permission Checks

```jsx
import { usePermissions } from '../../hooks/usePermissions';

export default function ReportComponent() {
  const { hasPermission } = usePermissions();

  // Check if user can view reports
  if (!hasPermission(['report.view', '*'])) {
    return <div>Access Denied</div>;
  }

  return (
    <div>
      {/* Report content */}
    </div>
  );
}
```

### 5. Styling Custom Report Content

```jsx
export default function CustomReport() {
  return (
    <ReportsLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Custom Report
          </h1>
          <p className="text-gray-600 mt-2">
            Report description
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Stat cards */}
        </div>

        {/* Charts */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {/* Chart content */}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Table content */}
        </div>
      </div>
    </ReportsLayout>
  );
}
```

## Component Props

### ReportsLayout Props

```typescript
interface ReportsLayoutProps {
  children: React.ReactNode;  // Content to display
}
```

### Usage

```jsx
<ReportsLayout>
  <YourReportContent />
</ReportsLayout>
```

## Styling Examples

### Stat Card

```jsx
<div className="border rounded-lg p-6 bg-blue-50 text-blue-600 border-blue-200">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm font-medium opacity-75">Total Orders</p>
      <p className="text-3xl font-bold mt-2">1,234</p>
      <p className="text-sm mt-2 text-green-600">↑ 12% dari kemarin</p>
    </div>
    <ChartBarIcon className="w-12 h-12 opacity-20" />
  </div>
</div>
```

### Report Section

```jsx
<div className="bg-white rounded-lg border border-gray-200 p-6">
  <h2 className="text-lg font-semibold text-gray-900 mb-4">
    Section Title
  </h2>
  {/* Content */}
</div>
```

### Loading State

```jsx
<div className="flex items-center justify-center h-full">
  <div className="text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
    <p className="text-gray-600">Memuat data...</p>
  </div>
</div>
```

### Error State

```jsx
<div className="p-6">
  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
    <div className="flex items-center gap-3">
      <ExclamationIcon className="w-5 h-5 text-red-600" />
      <div>
        <h3 className="font-semibold text-red-900">Error</h3>
        <p className="text-red-700">{error}</p>
      </div>
    </div>
  </div>
</div>
```

## Data Loading Examples

### Using reportService

```jsx
import reportService from '../../services/reportService';

// Get dashboard stats
const stats = await reportService.getDashboardStats();

// Get registration report data
const regData = await reportService.getRegistrationReport({
  startDate: '2025-01-01',
  endDate: '2025-12-31'
});

// Get modality report data
const modData = await reportService.getModalityReport();

// Get storage report data
const storageData = await reportService.getStorageReport();
```

### Error Handling

```jsx
try {
  const data = await reportService.getReport();
  setData(data);
} catch (err) {
  if (err.response?.status === 403) {
    setError('Anda tidak memiliki akses ke laporan ini');
  } else if (err.response?.status === 404) {
    setError('Data laporan tidak ditemukan');
  } else {
    setError(err.message || 'Gagal memuat laporan');
  }
}
```

## Navigation Examples

### Programmatic Navigation

```jsx
import { useNavigate } from 'react-router-dom';

export default function ReportComponent() {
  const navigate = useNavigate();

  const handleViewReport = (reportType) => {
    navigate(`/reports/${reportType}`);
  };

  return (
    <button onClick={() => handleViewReport('registration')}>
      View Registration Report
    </button>
  );
}
```

### Link Navigation

```jsx
import { Link } from 'react-router-dom';

export default function ReportComponent() {
  return (
    <Link to="/reports/modality" className="text-blue-600 hover:underline">
      View Modality Report
    </Link>
  );
}
```

## Permission Examples

### Checking Permissions

```jsx
import { usePermissions } from '../../hooks/usePermissions';

export default function ReportComponent() {
  const { hasPermission } = usePermissions();

  const canViewReports = hasPermission(['report.view', '*']);
  const canViewStorage = hasPermission(['storage.view', '*']);
  const canViewAudit = hasPermission(['audit.view', '*']);

  return (
    <div>
      {canViewReports && <div>Reports available</div>}
      {canViewStorage && <div>Storage report available</div>}
      {canViewAudit && <div>Audit report available</div>}
    </div>
  );
}
```

## Responsive Design Examples

### Mobile Layout

```jsx
// Sidebar collapses to 80px on mobile
// Menu text hidden
// Icons only visible
// Main content takes full width
```

### Tablet Layout

```jsx
// Sidebar can be toggled
// Collapsed: 80px
// Expanded: 256px
// Main content adjusts accordingly
```

### Desktop Layout

```jsx
// Sidebar always visible
// Full width: 256px
// Menu text and descriptions visible
// Main content takes remaining space
```

## Best Practices

### 1. Always Use ReportsLayout

```jsx
// ✅ Good
export default function MyReport() {
  return (
    <ReportsLayout>
      <div className="p-6">
        {/* Content */}
      </div>
    </ReportsLayout>
  );
}

// ❌ Bad - Missing ReportsLayout
export default function MyReport() {
  return (
    <div className="p-6">
      {/* Content */}
    </div>
  );
}
```

### 2. Handle Loading and Error States

```jsx
// ✅ Good
if (loading) return <LoadingState />;
if (error) return <ErrorState error={error} />;

// ❌ Bad - No loading/error handling
return <div>{data}</div>;
```

### 3. Use Consistent Styling

```jsx
// ✅ Good - Consistent with design system
<div className="bg-white rounded-lg border border-gray-200 p-6">
  <h2 className="text-lg font-semibold text-gray-900">Title</h2>
</div>

// ❌ Bad - Inconsistent styling
<div style={{backgroundColor: 'white', padding: '20px'}}>
  <h2 style={{fontSize: '18px'}}>Title</h2>
</div>
```

### 4. Check Permissions

```jsx
// ✅ Good
const { hasPermission } = usePermissions();
if (!hasPermission(['report.view', '*'])) {
  return <AccessDenied />;
}

// ❌ Bad - No permission check
return <ReportContent />;
```

### 5. Use Proper Error Messages

```jsx
// ✅ Good
setError('Gagal memuat data laporan. Silakan coba lagi.');

// ❌ Bad
setError('Error');
```

## Troubleshooting

### Sidebar Not Showing

```jsx
// Check if ReportsLayout is properly imported
import ReportsLayout from '../../components/layout/ReportsLayout';

// Check if children are passed
<ReportsLayout>
  <YourContent />
</ReportsLayout>
```

### Menu Items Not Appearing

```jsx
// Check permissions
const { hasPermission } = usePermissions();
console.log(hasPermission(['report.view', '*']));

// Check if menu items are defined
console.log(reportMenuItems);
```

### Styling Issues

```jsx
// Check if Tailwind CSS is configured
// Check if classes are correct
// Clear browser cache
// Check browser console for errors
```

### Navigation Not Working

```jsx
// Check if routes are properly defined in App.jsx
// Check if Link/navigate is used correctly
// Check browser console for routing errors
```

## Performance Tips

1. **Lazy Load Report Data**
   ```jsx
   const [data, setData] = useState(null);
   useEffect(() => {
     loadData(); // Load only when component mounts
   }, []);
   ```

2. **Memoize Components**
   ```jsx
   const ReportCard = React.memo(({ data }) => {
     return <div>{data}</div>;
   });
   ```

3. **Use Pagination**
   ```jsx
   const [page, setPage] = useState(1);
   const data = await reportService.getReport({ page });
   ```

4. **Cache Results**
   ```jsx
   const cache = useRef({});
   if (cache.current[key]) {
     return cache.current[key];
   }
   ```

## Security Considerations

1. **Always Check Permissions**
   - Use `hasPermission()` hook
   - Protect routes with `ProtectedRoute`

2. **Validate Data**
   - Sanitize user input
   - Validate API responses

3. **Handle Errors Gracefully**
   - Don't expose sensitive information
   - Log errors securely

4. **Use HTTPS**
   - Ensure all API calls use HTTPS
   - Protect sensitive data in transit
