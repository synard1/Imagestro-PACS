# Reports Page - Role-Based Access Control Analysis

## Executive Summary

The Reports page is currently protected with route-level RBAC. This document provides a complete analysis of the implementation, existing patterns, and role definitions.

## 1. Reports Page Component

**Location**: `E:\Project\docker\mwl-pacs-ui\src\pages\Reports.jsx`
**Route**: `/reports`

### Features
- Filtering by date range, modality, priority, status
- Report sections: Summary, Status, Modality, Doctors, Pending Orders
- PDF export via browser print
- Configuration-aware modality lists

### Data Service
- **File**: `src/services/reportService.js`
- **Main Function**: `getReportSummary(filters)`

## 2. Route Protection (Current)

**File**: `src/App.jsx` (lines 147-151)

```jsx
<Route path="/reports" element={
  <ProtectedRoute permissions={['report.view', 'order.view', '*']} any>
    <Reports />
  </ProtectedRoute>
} />
```

**Protection Status**: PARTIAL
- Requires ONE of: `report.view`, `order.view`, or `*` (superadmin)
- Issue: `report.view` may not be defined in backend

## 3. RBAC Infrastructure

### Services Used
1. **rbac.js** - Permission checking (`can()`, `canAny()`, `canAll()`)
2. **authService.js** - Login and token management
3. **ProtectedRoute.jsx** - Route-level protection
4. **PermissionGate.jsx** - Component-level protection
5. **useAuth.js** - Auth state hook

### Permission Matching Logic
Supports wildcards:
- Exact match: `report.view`
- Category wildcard: `report.*`
- Global wildcard: `*` (admin bypass)

## 4. Role Definitions

### Default Roles (Backend)

**Superadmin**
- Permissions: `['*']` (all)
- Reserved: Yes

**Developer**
- Permissions: `rbac:manage`, `rbac:view`, `setting:dev`, `system:logs`, `system:config`
- Reserved: Yes

**Admin Security**
- Permissions: `rbac:custom-manage`, `rbac:view`
- Reserved: Yes

**Admin**
- Permissions: `user:manage`, `patient:*`, `order:*`, `worklist:*`, `dicom:*`, `setting:read`, `setting:write`
- Does NOT have `*` (global bypass)

**Clinical Roles**: Doctor, Technician, Receptionist, Viewer

## 5. Existing Permission Patterns

```
order.view, order.create, order.update, order.*
patient.view, patient.create, patient.update, patient.*
user:read, user:manage
dashboard.view
audit.view
report.view (current, may be undefined)
modality.manage, modality.view
node.manage, node.view
```

## 6. Protected Route Component

**File**: `src/components/ProtectedRoute.jsx`

### Features
- Checks backend auth enabled
- Validates token existence
- Supports wildcard permission matching
- Admin auto-bypass
- Two modes: `any` (OR), all permissions (AND)

### Flow
```
1. Check backend auth enabled
2. Check permissions required
3. Check if admin
4. Match permissions
5. Redirect to /unauthorized if denied
```

## 7. Authorization Storage

**Files**:
- `src/services/auth-storage.js` - Token storage
- `src/services/rbac.js` - User object storage
- `src/hooks/useAuth.js` - React hook

**User Object Structure**:
```javascript
{
  id: string,
  name: string,
  username: string,
  email: string,
  role: string,
  permissions: string[]
}
```

## 8. Backend RBAC Endpoints

**File**: `server/routes/auth.js`

Key endpoints:
- POST /auth/login
- GET /auth/me
- GET /auth/users
- GET /auth/roles
- GET /auth/permissions
- POST /auth/roles/{role_id}/permissions

## 9. Permission Gate Component

**File**: `src/components/PermissionGate.jsx`

Conditionally renders based on permissions:
```jsx
<PermissionGate perm="report.export">
  <ExportButton />
</PermissionGate>
```

## 10. Recommended Implementation

### Option 1: Ensure Backend Permission
1. Verify `report.view` permission exists in backend RBAC
2. Assign to: Admin, Doctor, Technician, Viewer roles
3. Keep current route protection

### Option 2: Add Granular Permissions
- `report.view` - View reports
- `report.edit` - Modify filters
- `report.export` - Print/PDF
- `report.manage` - Full management

### Option 3: Component-Level Protection
```jsx
<PermissionGate perm="report.export">
  <button onClick={handlePrint}>Print / Save PDF</button>
</PermissionGate>

<PermissionGate perm="report.edit">
  <button onClick={handleGenerate}>Refresh Data</button>
</PermissionGate>
```

## 11. Implementation Checklist

- [ ] Verify `report.view` permission exists in backend
- [ ] Assign `report.view` to appropriate roles
- [ ] Add component-level PermissionGate for actions
- [ ] Test access scenarios
- [ ] Add audit logging (optional)
- [ ] Update role assignments if needed

## 12. File Reference

| File | Purpose |
|------|---------|
| src/pages/Reports.jsx | Main component |
| src/services/reportService.js | Data fetching |
| src/services/rbac.js | Permission checking |
| src/components/ProtectedRoute.jsx | Route protection |
| src/components/PermissionGate.jsx | Component gating |
| src/hooks/useAuth.js | Auth state |
| src/services/authService.js | Login/tokens |
| src/App.jsx | Route definitions |
| server/routes/auth.js | Backend RBAC |
| docs/archive/auth-service-rbac.md | RBAC specification |

## 13. Security Notes

- Token auto-refresh every 4 minutes
- Permissions cached in localStorage
- Backend is source of truth
- Global wildcard `*` allows full access
- Logout revokes token server-side
- HTTPS recommended (localStorage used)

## Summary

Reports page has route-level protection via ProtectedRoute checking for `report.view`, `order.view`, or `*` permissions. Ensure the `report.view` permission is properly defined in the backend and assigned to appropriate roles. Consider adding component-level protection for specific actions using PermissionGate.

