# Order Management - Permissions Guide

## Overview

Order Management menggunakan Role-Based Access Control (RBAC) untuk mengontrol akses ke fitur-fitur order. Setiap action memerlukan permission spesifik atau wildcard permission `order:*`.

---

## Permission List

### Core Permissions

| Permission | Description | Actions |
|------------|-------------|---------|
| `order:*` | Full access to all order operations | All actions below |
| `order:read` | View orders | View order list, view order details |
| `order:create` | Create new orders | Create order, save offline order |
| `order:update` | Update existing orders | Edit order, reschedule order |
| `order:delete` | Delete orders | Soft delete order |
| `order:status` | Change order status | Transition order status |
| `order:publish` | Publish to DICOM MWL | Publish order to worklist |
| `order:print` | Print order | Print order document |
| `order:export` | Export order data | Export to CSV/PDF |

### Advanced Permissions

| Permission | Description | Actions |
|------------|-------------|---------|
| `order:purge` | Hard delete orders | Permanent deletion (after soft delete) |
| `order:sync` | Sync to external systems | Sync to SatuSehat |
| `order:worklist` | Create worklist | Create DICOM worklist entry |
| `order:complete-flow` | Execute complete flow | Create + Sync + Worklist in one action |

---

## UI Component Permissions

### Orders Page (`/orders`)

**Required to access page:**
- `order:read` OR `order:*`

If user doesn't have read permission, will show:
```
🔒 Access Denied
You don't have permission to view orders.
Required permission: order:read or order:*
```

**Available actions based on permissions:**

| Action | Button | Required Permission |
|--------|--------|---------------------|
| View list | Auto shown | `order:read` or `order:*` |
| Create order | "Create" button | `order:create` or `order:*` |
| Search/Filter | Auto shown | `order:read` or `order:*` |
| Refresh | "Refresh" button | `order:read` or `order:*` |

### OrderActionButtons Component

Each action button checks for specific permission:

| Button | Permission Required | Visibility |
|--------|---------------------|------------|
| 👁️ View | `order:read` or `order:*` | Always visible (if has permission) |
| ✏️ Edit | `order:update` or `order:*` | Only for editable statuses |
| 🔵 Publish | `order:publish` or `order:*` | Only for publishable statuses |
| 🔄 Change Status | `order:status` or `order:*` | Only when transitions available |
| 🖨️ Print | `order:print` or `order:*` | Always visible in menu |
| 📤 Export | `order:export` or `order:*` | Always visible in menu |
| 🗑️ Delete | `order:delete` or `order:*` | Only for deletable statuses |

**Special behavior:**
- If user has NO permissions at all → Show "No access" message
- If user can't perform action due to status → Show disabled with reason tooltip

---

## Permission Checking in Code

### Using `can()` function

```javascript
import { can } from '../services/rbac'

// Check single permission
if (can('order:read')) {
  // User can read orders
}

// Check with OR logic (any of these)
if (can('order:read') || can('order:*')) {
  // User can read orders (specific) OR has wildcard
}
```

### Using `canAny()` function

```javascript
import { canAny } from '../services/rbac'

// Check if user has any of these permissions
if (canAny(['order:read', 'order:*'])) {
  // User has at least one of these permissions
}
```

### Using `PermissionGate` component

```javascript
import PermissionGate from '../components/PermissionGate'

// Wrap component to show only if has permission
<PermissionGate perm="order:create">
  <button>Create Order</button>
</PermissionGate>

// With OR logic (any)
<PermissionGate any={['order:read', 'order:*']}>
  <OrderList />
</PermissionGate>
```

---

## Role Examples

### Admin Role
```json
{
  "role": "admin",
  "permissions": ["*"]
}
```
✅ Has access to ALL features (wildcard permission)

### Order Manager Role
```json
{
  "role": "order_manager",
  "permissions": ["order:*", "patient:read", "doctor:read"]
}
```
✅ Full access to orders
✅ Read access to patients and doctors

### Radiologist Role
```json
{
  "role": "radiologist",
  "permissions": [
    "order:read",
    "order:status",
    "order:update",
    "order:print"
  ]
}
```
✅ Can view orders
✅ Can change order status
✅ Can update order details
✅ Can print orders
❌ Cannot create or delete orders

### Receptionist Role
```json
{
  "role": "receptionist",
  "permissions": [
    "order:read",
    "order:create",
    "order:print"
  ]
}
```
✅ Can view orders
✅ Can create new orders
✅ Can print orders
❌ Cannot update, delete, or change status

### Viewer Role (Read-only)
```json
{
  "role": "viewer",
  "permissions": ["order:read"]
}
```
✅ Can view orders only
❌ Cannot perform any actions

### No Access
```json
{
  "role": "user",
  "permissions": []
}
```
❌ Cannot access orders page at all

---

## Testing Permissions

### 1. Test in Browser Console

```javascript
// Check current user
import { getCurrentUser } from './src/services/rbac'
console.log(getCurrentUser())

// Check permissions
import { can } from './src/services/rbac'
console.log('Can read:', can('order:read'))
console.log('Can create:', can('order:create'))
console.log('Can update:', can('order:update'))
console.log('Can delete:', can('order:delete'))
console.log('Has wildcard:', can('order:*'))
```

### 2. Simulate Different Roles

```javascript
import { setCurrentUser } from './src/services/rbac'

// Test as Admin
setCurrentUser({
  id: 'test-1',
  name: 'Admin Test',
  role: 'admin',
  permissions: ['*']
})

// Test as Order Manager
setCurrentUser({
  id: 'test-2',
  name: 'Manager Test',
  role: 'order_manager',
  permissions: ['order:*', 'patient:read']
})

// Test as Radiologist
setCurrentUser({
  id: 'test-3',
  name: 'Radiologist Test',
  role: 'radiologist',
  permissions: ['order:read', 'order:status', 'order:update']
})

// Test as Viewer (read-only)
setCurrentUser({
  id: 'test-4',
  name: 'Viewer Test',
  role: 'viewer',
  permissions: ['order:read']
})

// Then refresh page to see changes
```

### 3. Visual Testing Checklist

For each role, verify:

| Test | Expected Behavior |
|------|-------------------|
| Navigate to `/orders` | ✅ Access allowed OR ❌ Access denied |
| See "Create" button | ✅ Visible OR ❌ Hidden |
| Click "View" (eye icon) | ✅ Opens order detail OR ❌ Button hidden |
| Click "Edit" (pencil icon) | ✅ Opens order edit OR ❌ Button hidden |
| Click "..." (more menu) | ✅ Shows menu OR ❌ Empty menu |
| See "Publish" option | ✅ Visible in menu OR ❌ Hidden |
| See "Change Status" options | ✅ Visible in menu OR ❌ Hidden |
| See "Print" option | ✅ Visible in menu OR ❌ Hidden |
| See "Export" option | ✅ Visible in menu OR ❌ Hidden |
| See "Delete" option | ✅ Visible in menu OR ❌ Hidden |

---

## Backend Integration

### API Endpoints with Permissions

Backend API harus memvalidasi permissions juga:

```
GET /orders          → Requires: order:read or order:*
POST /orders         → Requires: order:create or order:*
GET /orders/{id}     → Requires: order:read or order:*
PUT /orders/{id}     → Requires: order:update or order:*
DELETE /orders/{id}  → Requires: order:delete or order:*
DELETE /orders/{id}/purge → Requires: order:purge or order:*
POST /orders/{id}/sync-satusehat → Requires: order:sync or order:*
POST /orders/{id}/create-worklist → Requires: order:worklist or order:*
POST /orders/complete-flow → Requires: order:create AND order:sync AND order:worklist
```

### JWT Token Format

Backend should send user permissions in JWT token:

```json
{
  "user_id": "uuid",
  "username": "john.doe",
  "role": "order_manager",
  "permissions": [
    "order:*",
    "patient:read",
    "doctor:read"
  ],
  "exp": 1234567890,
  "iat": 1234567890
}
```

Frontend will decode this and use for permission checking.

---

## Security Notes

### ⚠️ Important

1. **Client-side Only**: These permissions are for UI/UX only. Backend MUST also validate permissions.

2. **Don't Trust Frontend**: Always validate permissions on backend for security.

3. **Token Validation**: Ensure JWT tokens are properly signed and validated.

4. **Permission Sync**: Keep frontend and backend permission lists in sync.

### Best Practices

1. **Least Privilege**: Give users minimum permissions needed for their role.

2. **Wildcard Carefully**: Use `*` or `order:*` only for admin/manager roles.

3. **Audit Trail**: Log all permission-based actions for audit.

4. **Regular Review**: Periodically review and update role permissions.

---

## Troubleshooting

### User sees "No access" but should have permission

**Check:**
1. User logged in? `getCurrentUser()` returns user object?
2. User has correct permissions? Check `user.permissions` array
3. Permission string exact match? Case-sensitive: `order:read` not `Order:Read`
4. Token expired? Check `exp` field in JWT

### Button visible but action fails

**Check:**
1. Backend returns 403 Forbidden? Backend permission check failed
2. Status allows action? Check `canPerformAction(status, action)`
3. Network error? Check browser console

### Permission changes not reflected

**Solution:**
1. Refresh page after permission changes
2. Clear localStorage if needed
3. Re-login to get new JWT token with updated permissions

---

## Files Modified

### Permission Implementation:
- ✅ `src/components/OrderActionButtons.jsx` - Added permission checks for all actions
- ✅ `src/pages/Orders.jsx` - Added page-level permission check and create button permission
- ✅ `src/services/rbac.js` - RBAC core service (no changes needed, already supports wildcards)
- ✅ `src/components/PermissionGate.jsx` - Reusable permission gate component

### Documentation:
- ✅ `ORDER_PERMISSIONS_GUIDE.md` (this file)

---

## API Reference

### Permission Functions

```javascript
// From src/services/rbac.js

can(permission: string, user?: Object): boolean
// Check if user has specific permission
// Supports wildcard matching

canAny(permissions: string[], user?: Object): boolean
// Check if user has any of the permissions
// Returns true if at least one matches

canAll(permissions: string[], user?: Object): boolean
// Check if user has all of the permissions
// Returns true only if all match

getCurrentUser(): Object | null
// Get current authenticated user

setCurrentUser(user: Object): void
// Set current user (called after login)

clearCurrentUser(): void
// Clear current user (called on logout)
```

---

**Last Updated:** 2025-11-09
**Version:** 1.0
**Author:** Claude AI Assistant
