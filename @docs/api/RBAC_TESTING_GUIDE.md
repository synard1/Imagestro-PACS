# RBAC Protected Permissions - Testing Guide

## Manual Testing Checklist

### Test 1: Create Protected Permission (SUPERADMIN)

**Setup:**
- Login sebagai SUPERADMIN
- Navigate ke User Management → Roles & Permissions tab

**Steps:**
1. Click "+ Create Permission"
2. Fill form:
   - Name: `test:protected`
   - Description: `Test protected permission`
   - Category: `test`
3. Check "🔒 Protected Permission"
4. Check "👁️ Hidden from Tenant Admin"
5. Click "Create Permission"

**Expected Result:**
- Permission created successfully
- Permission terlihat di list dengan badges 🔒 👁️
- Edit dan Delete buttons terlihat
- Success message ditampilkan

---

### Test 2: View Protected Permission (Regular ADMIN)

**Setup:**
- Login sebagai regular ADMIN
- Navigate ke User Management → Roles & Permissions tab

**Steps:**
1. Search untuk `test:protected` permission
2. Observe permission card

**Expected Result:**
- Jika `hidden_from_tenant_admin: true`: Permission tidak terlihat di list
- Jika `hidden_from_tenant_admin: false`: Permission terlihat dengan badge 🔒
- Edit dan Delete buttons tidak terlihat
- Tidak bisa click edit atau delete

---

### Test 3: Try Edit Protected Permission (Regular ADMIN)

**Setup:**
- Login sebagai regular ADMIN
- Navigate ke User Management → Roles & Permissions tab
- Find protected permission yang tidak hidden

**Steps:**
1. Try click Edit button (jika terlihat)
2. Try right-click untuk context menu
3. Try keyboard shortcut

**Expected Result:**
- Edit button tidak terlihat atau disabled
- Tidak bisa edit permission
- No error messages

---

### Test 4: Create Non-Protected Permission (Regular ADMIN)

**Setup:**
- Login sebagai regular ADMIN
- Navigate ke User Management → Roles & Permissions tab

**Steps:**
1. Click "+ Create Permission"
2. Fill form:
   - Name: `test:regular`
   - Description: `Test regular permission`
   - Category: `test`
3. Leave "🔒 Protected Permission" unchecked
4. Leave "👁️ Hidden from Tenant Admin" unchecked
5. Click "Create Permission"

**Expected Result:**
- Permission created successfully
- Permission terlihat di list tanpa badges
- Edit dan Delete buttons terlihat
- Success message ditampilkan

---

### Test 5: Edit Non-Protected Permission (Regular ADMIN)

**Setup:**
- Login sebagai regular ADMIN
- Navigate ke User Management → Roles & Permissions tab
- Find non-protected permission yang dibuat di Test 4

**Steps:**
1. Click Edit button
2. Change description
3. Click "Update Permission"

**Expected Result:**
- Permission updated successfully
- Changes terlihat di list
- Success message ditampilkan

---

### Test 6: Delete Non-Protected Permission (Regular ADMIN)

**Setup:**
- Login sebagai regular ADMIN
- Navigate ke User Management → Roles & Permissions tab
- Find non-protected permission

**Steps:**
1. Click Delete button
2. Confirm deletion

**Expected Result:**
- Permission deleted successfully
- Permission tidak terlihat di list
- Success message ditampilkan

---

### Test 7: Try Delete Protected Permission (SUPERADMIN)

**Setup:**
- Login sebagai SUPERADMIN
- Navigate ke User Management → Roles & Permissions tab
- Find protected permission

**Steps:**
1. Click Delete button
2. Observe result

**Expected Result:**
- Delete button tidak terlihat atau disabled
- Cannot delete protected permission
- Error message atau info message ditampilkan

---

### Test 8: Edit Protected Permission (SUPERADMIN)

**Setup:**
- Login sebagai SUPERADMIN
- Navigate ke User Management → Roles & Permissions tab
- Find protected permission

**Steps:**
1. Click Edit button
2. Change description
3. Toggle "🔒 Protected Permission" checkbox
4. Click "Update Permission"

**Expected Result:**
- Permission updated successfully
- Changes terlihat di list
- Protected flag dapat di-toggle
- Success message ditampilkan

---

### Test 9: Assign Protected Permission to Role

**Setup:**
- Login sebagai SUPERADMIN
- Navigate ke User Management → Roles & Permissions tab
- Select a role

**Steps:**
1. Click "+ Assign Permission"
2. Search untuk protected permission
3. Click permission untuk assign
4. Confirm

**Expected Result:**
- Protected permission dapat di-assign ke role
- Permission terlihat di role's permission list
- Success message ditampilkan

---

### Test 10: Filter Hidden Permissions

**Setup:**
- Login sebagai SUPERADMIN
- Navigate ke User Management → Roles & Permissions tab

**Steps:**
1. Observe permissions list
2. Count permissions dengan 👁️ badge
3. Logout dan login sebagai regular ADMIN
4. Navigate ke User Management → Roles & Permissions tab
5. Count permissions

**Expected Result:**
- SUPERADMIN melihat semua permissions (termasuk hidden)
- Regular ADMIN tidak melihat hidden permissions
- Count berbeda antara SUPERADMIN dan ADMIN

---

## Automated Testing

### Unit Tests

```javascript
// tests/rbacConstants.test.js

describe('getPermissionProtectionInfo', () => {
  it('should return protected info when permission.protected is true', () => {
    const permission = { protected: true };
    const user = { role: 'admin' };
    
    const result = getPermissionProtectionInfo(permission, user);
    
    expect(result.isProtected).toBe(true);
    expect(result.canEdit).toBe(false);
    expect(result.canDelete).toBe(false);
  });

  it('should allow edit for high-priv user', () => {
    const permission = { protected: true };
    const user = { role: 'superadmin' };
    
    const result = getPermissionProtectionInfo(permission, user);
    
    expect(result.isProtected).toBe(true);
    expect(result.canEdit).toBe(true);
    expect(result.canDelete).toBe(false);
  });

  it('should fallback to reserved permissions list', () => {
    const permission = { name: 'rbac:manage', protected: undefined };
    const user = { role: 'admin' };
    
    const result = getPermissionProtectionInfo(permission, user);
    
    expect(result.isProtected).toBe(true);
  });
});

describe('getRoleProtectionInfo', () => {
  it('should return protected info when role.protected is true', () => {
    const role = { protected: true };
    const user = { role: 'admin' };
    
    const result = getRoleProtectionInfo(role, user);
    
    expect(result.isProtected).toBe(true);
    expect(result.canEdit).toBe(false);
  });
});
```

### Component Tests

```javascript
// tests/RolePermissionManager.test.jsx

describe('RolePermissionManager', () => {
  it('should show protected badge for protected permissions', () => {
    const permission = { 
      id: '1', 
      name: 'test:protected',
      protected: true,
      hidden_from_tenant_admin: false
    };
    
    render(<RolePermissionManager />);
    
    expect(screen.getByText('🔒')).toBeInTheDocument();
  });

  it('should show hidden badge for hidden permissions', () => {
    const permission = { 
      id: '1', 
      name: 'test:hidden',
      protected: false,
      hidden_from_tenant_admin: true
    };
    
    render(<RolePermissionManager />);
    
    expect(screen.getByText('👁️')).toBeInTheDocument();
  });

  it('should hide edit button for protected permissions (non-high-priv)', () => {
    const permission = { 
      id: '1', 
      name: 'test:protected',
      protected: true
    };
    const user = { role: 'admin' };
    
    render(<RolePermissionManager currentUser={user} />);
    
    expect(screen.queryByTitle('Edit Permission')).not.toBeInTheDocument();
  });

  it('should filter hidden permissions for non-high-priv users', () => {
    const permissions = [
      { id: '1', name: 'visible', hidden_from_tenant_admin: false },
      { id: '2', name: 'hidden', hidden_from_tenant_admin: true }
    ];
    const user = { role: 'admin' };
    
    render(<RolePermissionManager permissions={permissions} currentUser={user} />);
    
    expect(screen.getByText('visible')).toBeInTheDocument();
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
  });
});
```

### Integration Tests

```javascript
// tests/integration/protected-permissions.test.js

describe('Protected Permissions Integration', () => {
  it('should create protected permission via API', async () => {
    const permissionData = {
      name: 'test:protected',
      description: 'Test',
      protected: true,
      hidden_from_tenant_admin: true
    };
    
    const response = await userService.createPermission(permissionData);
    
    expect(response.protected).toBe(true);
    expect(response.hidden_from_tenant_admin).toBe(true);
  });

  it('should prevent regular admin from editing protected permission', async () => {
    const user = { role: 'admin' };
    const permission = { id: '1', protected: true };
    
    const canEdit = getPermissionProtectionInfo(permission, user).canEdit;
    
    expect(canEdit).toBe(false);
  });

  it('should allow superadmin to edit protected permission', async () => {
    const user = { role: 'superadmin' };
    const permission = { id: '1', protected: true };
    
    const canEdit = getPermissionProtectionInfo(permission, user).canEdit;
    
    expect(canEdit).toBe(true);
  });
});
```

## Backend Testing

### API Tests

```bash
# Create protected permission
curl -X POST http://localhost:8888/auth/permissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "test:protected",
    "description": "Test protected permission",
    "protected": true,
    "hidden_from_tenant_admin": true
  }'

# Get all permissions
curl -X GET http://localhost:8888/auth/permissions \
  -H "Authorization: Bearer $TOKEN"

# Update permission
curl -X PUT http://localhost:8888/auth/permissions/{id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "protected": false
  }'
```

## Test Coverage Goals

- Unit tests: 80%+ coverage untuk rbacConstants.js
- Component tests: 80%+ coverage untuk RolePermissionManager.jsx
- Integration tests: All critical user flows
- E2E tests: Create, edit, delete, filter protected permissions

## Regression Testing

After implementation, verify:
- Existing permissions still work
- Existing roles still work
- Backward compatibility dengan backend yang tidak support protected flag
- No performance degradation
- No UI/UX issues

