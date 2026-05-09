# RBAC Testing Guide - Production Readiness

## 📋 Overview

Dokumen ini berisi comprehensive testing procedures untuk memastikan semua fitur RBAC (Role-Based Access Control) berfungsi dengan baik dan siap untuk production.

**Last Updated:** 2025-11-01
**Backend API:** http://103.42.117.19:8888
**Frontend URL:** http://localhost:5173/user-management

---

## 🎯 Test Coverage

### Features to Test
- ✅ Role Management (CRUD)
- ✅ Permission Management (CRUD)
- ✅ Role-Permission Assignment
- ✅ User-Role Assignment
- ✅ User-Permission Direct Assignment
- ✅ Cache Management
- ✅ Integration with User Management

---

## 🔧 Pre-Test Setup

### 1. Clear Browser Storage
```javascript
// Open browser console (F12)
localStorage.clear();
sessionStorage.clear();
location.reload();
```

### 2. Login as Admin
```
URL: http://localhost:5173/login
Username: admin
Password: Admin@12345
```

### 3. Navigate to User Management
```
Menu: User Management → User Admin
URL: http://localhost:5173/user-management
```

### 4. Switch to RBAC Tab
Click on **"🔐 Roles & Permissions"** tab

---

## 📝 Test Scenarios

## Test Group 1: Permission Management

### Test 1.1: Create Permission

**Steps:**
1. Click **"Permissions"** tab
2. Click **"+ Create Permission"** button
3. Fill form:
   - Name: `report:read`
   - Description: `Permission to view reports`
   - Category: `report`
4. Click **"Create Permission"**

**Expected Result:**
- ✅ Success message: "Permission created successfully"
- ✅ New permission appears in the list
- ✅ Permission shows: `report:read` with description and category badge

**Verification:**
```javascript
// Check via API
const auth = JSON.parse(localStorage.getItem('auth.session.v1'));
fetch('http://103.42.117.19:8888/auth/permissions', {
  headers: { 'Authorization': `Bearer ${auth.access_token}` }
})
.then(r => r.json())
.then(data => {
  const found = data.permissions.find(p => p.name === 'report:read');
  console.log('Permission found:', found);
});
```

---

### Test 1.2: Edit Permission

**Steps:**
1. Find the `report:read` permission
2. Click **"Edit"** button
3. Update Description: `Permission to read and view reports`
4. Click **"Update Permission"**

**Expected Result:**
- ✅ Success message: "Permission updated successfully"
- ✅ Description updated in the list

---

### Test 1.3: Delete Permission

**Prerequisites:** Create a temporary permission first

**Steps:**
1. Create test permission: `temp:test`
2. Click **"Delete"** button on temp permission
3. Confirm deletion

**Expected Result:**
- ✅ Confirmation dialog appears
- ✅ Success message: "Permission deleted successfully"
- ✅ Permission removed from list

---

## Test Group 2: Role Management

### Test 2.1: Create Role

**Steps:**
1. Click **"Roles"** tab
2. Click **"+ Create Role"** button
3. Fill form:
   - Name: `REPORTING_STAFF`
   - Description: `Staff with reporting access`
   - ✓ Active Role (checked)
4. Click **"Create Role"**

**Expected Result:**
- ✅ Success message: "Role created successfully"
- ✅ New role appears in roles list
- ✅ Role shows active status (green badge)

**Verification:**
```javascript
// Check via API
fetch('http://103.42.117.19:8888/auth/roles', {
  headers: { 'Authorization': `Bearer ${auth.access_token}` }
})
.then(r => r.json())
.then(data => {
  const found = data.roles.find(r => r.name === 'REPORTING_STAFF');
  console.log('Role found:', found);
});
```

---

### Test 2.2: Edit Role

**Steps:**
1. Click on `REPORTING_STAFF` role to select it
2. Click **"Edit"** button
3. Update Description: `Staff with full reporting access and analytics`
4. Click **"Update Role"**

**Expected Result:**
- ✅ Success message: "Role updated successfully"
- ✅ Description updated

---

### Test 2.3: View Role Selection

**Steps:**
1. Click on different roles in the list
2. Observe the right panel

**Expected Result:**
- ✅ Selected role is highlighted (blue border)
- ✅ Right panel shows "Permissions for [Role Name]"
- ✅ Initially empty if no permissions assigned

---

### Test 2.4: Delete Role

**Prerequisites:** Create a temporary role first

**Steps:**
1. Create test role: `TEST_ROLE`
2. Click **"Delete"** button on test role
3. Confirm deletion

**Expected Result:**
- ✅ Confirmation dialog appears
- ✅ Success message: "Role deleted successfully"
- ✅ Role removed from list
- ✅ If role was selected, selection cleared

---

## Test Group 3: Role-Permission Assignment

### Test 3.1: Assign Permission to Role

**Prerequisites:**
- Role exists: `REPORTING_STAFF`
- Permission exists: `report:read`

**Steps:**
1. Click **"Roles"** tab
2. Select `REPORTING_STAFF` role
3. Click **"+ Assign Permission"** button
4. Find `report:read` in the list
5. Click **"Assign"** button next to it

**Expected Result:**
- ✅ Success message: "Permission assigned to role successfully"
- ✅ Modal closes
- ✅ Permission appears in role's permission list
- ✅ Cache cleared automatically

**Verification:**
```javascript
// Verify role has permission
fetch('http://103.42.117.19:8888/auth/roles/[ROLE_ID]/permissions', {
  headers: { 'Authorization': `Bearer ${auth.access_token}` }
})
.then(r => r.json())
.then(data => {
  console.log('Role permissions:', data.permissions);
});
```

---

### Test 3.2: Assign Multiple Permissions to Role

**Steps:**
1. Select `REPORTING_STAFF` role
2. Assign these permissions one by one:
   - `report:create`
   - `report:update`
   - `report:delete`
   - `report:export`

**Expected Result:**
- ✅ All permissions successfully assigned
- ✅ All appear in role's permission list
- ✅ Each assignment triggers cache clear

---

### Test 3.3: Remove Permission from Role

**Steps:**
1. Select `REPORTING_STAFF` role with assigned permissions
2. Click **"Remove"** button on `report:delete` permission
3. Confirm removal

**Expected Result:**
- ✅ Confirmation dialog appears
- ✅ Success message: "Permission removed from role successfully"
- ✅ Permission removed from list
- ✅ Cache cleared automatically

---

### Test 3.4: View Assigned vs Unassigned Permissions

**Steps:**
1. Select `REPORTING_STAFF` role
2. Click **"+ Assign Permission"** button
3. Observe the list

**Expected Result:**
- ✅ Modal shows only unassigned permissions
- ✅ Already assigned permissions not shown
- ✅ If all permissions assigned: "All permissions are already assigned to this role"

---

## Test Group 4: Integration with User Management

### Test 4.1: Assign Role to User

**Prerequisites:**
- User exists
- Role `REPORTING_STAFF` with permissions exists

**Steps:**
1. Switch to **"👤 Users"** tab
2. Click on a user to view details
3. Check assigned roles section
4. Assign `REPORTING_STAFF` role (implementation depends on UI)

**Expected Result:**
- ✅ Role assigned to user
- ✅ User inherits all role permissions

---

### Test 4.2: Verify User Permissions After Role Assignment

**Steps:**
1. Login as the user with assigned role
2. Navigate to User Management
3. Check accessible features

**Expected Result:**
- ✅ User can access features allowed by role permissions
- ✅ Blocked from features not in permissions

---

## Test Group 5: Cache Management

### Test 5.1: Manual Cache Clear

**Steps:**
1. Make permission changes
2. Call cache clear API:
```javascript
fetch('http://103.42.117.19:8888/auth/cache/clear', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${auth.access_token}` }
})
.then(r => r.json())
.then(data => console.log('Cache cleared:', data));
```

**Expected Result:**
- ✅ Success response
- ✅ Permission changes immediately effective

---

### Test 5.2: Cache Stats

**Steps:**
```javascript
fetch('http://103.42.117.19:8888/auth/cache/stats', {
  headers: { 'Authorization': `Bearer ${auth.access_token}` }
})
.then(r => r.json())
.then(data => console.log('Cache stats:', data));
```

**Expected Result:**
- ✅ Returns cache statistics
- ✅ Shows hits, misses, size, etc.

---

## Test Group 6: Error Handling

### Test 6.1: Create Duplicate Permission

**Steps:**
1. Try to create permission with existing name
2. Submit form

**Expected Result:**
- ✅ Error message displayed
- ✅ Form not submitted
- ✅ User notified clearly

---

### Test 6.2: Delete Role with Assigned Users

**Steps:**
1. Try to delete role assigned to users

**Expected Result:**
- ✅ Warning or error message
- ✅ Suggests removing users first or force delete option

---

### Test 6.3: Network Error Handling

**Steps:**
1. Disconnect network
2. Try to create permission/role

**Expected Result:**
- ✅ Clear error message about connection
- ✅ Retry option or guidance

---

### Test 6.4: Token Expiration

**Steps:**
1. Wait for token to expire (or manually expire)
2. Try to perform RBAC operation

**Expected Result:**
- ✅ Error: "Authentication token has expired"
- ✅ Redirect to login or refresh token

---

## Test Group 7: UI/UX Testing

### Test 7.1: Tab Navigation

**Steps:**
1. Switch between "Users" and "Roles & Permissions" tabs
2. Switch between "Roles" and "Permissions" sub-tabs

**Expected Result:**
- ✅ Smooth tab switching
- ✅ No data loss when switching
- ✅ Active tab clearly indicated

---

### Test 7.2: Modal Interactions

**Steps:**
1. Open create/edit modal
2. Click Cancel
3. Re-open modal
4. Click outside modal

**Expected Result:**
- ✅ Modal closes properly
- ✅ Form resets on close
- ✅ Click outside closes modal (optional)

---

### Test 7.3: Loading States

**Steps:**
1. Observe loading indicators during operations
2. Check disabled states during loading

**Expected Result:**
- ✅ Loading indicator visible during API calls
- ✅ Buttons disabled during operations
- ✅ No duplicate submissions possible

---

### Test 7.4: Success/Error Message Auto-Dismiss

**Steps:**
1. Trigger success message
2. Wait 5 seconds

**Expected Result:**
- ✅ Message auto-dismisses after 5 seconds
- ✅ No manual close needed

---

## Test Group 8: Data Validation

### Test 8.1: Permission Name Format

**Steps:**
1. Try to create permission with invalid names:
   - Empty name
   - Special characters
   - Too long name

**Expected Result:**
- ✅ Validation errors displayed
- ✅ Format hints shown
- ✅ Form not submitted

---

### Test 8.2: Role Name Validation

**Steps:**
1. Try to create role with invalid names:
   - Empty name
   - Spaces only
   - Special characters

**Expected Result:**
- ✅ Validation errors
- ✅ Clear requirements shown

---

## Test Group 9: Permissions Testing

### Test 9.1: Admin Access

**Steps:**
1. Login as admin user
2. Navigate to RBAC management

**Expected Result:**
- ✅ Full access to all RBAC features
- ✅ Can create, edit, delete all entities

---

### Test 9.2: Non-Admin Access

**Steps:**
1. Login as non-admin user
2. Try to access RBAC management

**Expected Result:**
- ✅ Access denied or limited access
- ✅ Clear permission error message
- ✅ Redirect if unauthorized

---

## Test Group 10: Production Readiness

### Test 10.1: Performance Testing

**Steps:**
1. Create 50 permissions
2. Create 10 roles
3. Assign permissions to roles
4. Check load times

**Expected Result:**
- ✅ UI remains responsive
- ✅ Load times < 2 seconds
- ✅ No freezing or lag

---

### Test 10.2: Concurrent Operations

**Steps:**
1. Open 2 browser windows
2. Perform operations simultaneously

**Expected Result:**
- ✅ Both windows sync properly
- ✅ No conflicts
- ✅ Cache invalidation works

---

### Test 10.3: Mobile Responsiveness

**Steps:**
1. Open on mobile browser or resize window
2. Test all RBAC features

**Expected Result:**
- ✅ Responsive layout
- ✅ All features accessible
- ✅ No UI breaks

---

## 📊 Test Results Template

```
Test Date: _________________
Tester: ____________________
Environment: _______________

Test Group 1: Permission Management
[ ] Test 1.1: Create Permission - PASS/FAIL
[ ] Test 1.2: Edit Permission - PASS/FAIL
[ ] Test 1.3: Delete Permission - PASS/FAIL

Test Group 2: Role Management
[ ] Test 2.1: Create Role - PASS/FAIL
[ ] Test 2.2: Edit Role - PASS/FAIL
[ ] Test 2.3: View Role Selection - PASS/FAIL
[ ] Test 2.4: Delete Role - PASS/FAIL

Test Group 3: Role-Permission Assignment
[ ] Test 3.1: Assign Permission to Role - PASS/FAIL
[ ] Test 3.2: Assign Multiple Permissions - PASS/FAIL
[ ] Test 3.3: Remove Permission from Role - PASS/FAIL
[ ] Test 3.4: View Assigned vs Unassigned - PASS/FAIL

Test Group 4: Integration with User Management
[ ] Test 4.1: Assign Role to User - PASS/FAIL
[ ] Test 4.2: Verify User Permissions - PASS/FAIL

Test Group 5: Cache Management
[ ] Test 5.1: Manual Cache Clear - PASS/FAIL
[ ] Test 5.2: Cache Stats - PASS/FAIL

Test Group 6: Error Handling
[ ] Test 6.1: Duplicate Permission - PASS/FAIL
[ ] Test 6.2: Delete Role with Users - PASS/FAIL
[ ] Test 6.3: Network Error - PASS/FAIL
[ ] Test 6.4: Token Expiration - PASS/FAIL

Test Group 7: UI/UX Testing
[ ] Test 7.1: Tab Navigation - PASS/FAIL
[ ] Test 7.2: Modal Interactions - PASS/FAIL
[ ] Test 7.3: Loading States - PASS/FAIL
[ ] Test 7.4: Message Auto-Dismiss - PASS/FAIL

Test Group 8: Data Validation
[ ] Test 8.1: Permission Name Format - PASS/FAIL
[ ] Test 8.2: Role Name Validation - PASS/FAIL

Test Group 9: Permissions Testing
[ ] Test 9.1: Admin Access - PASS/FAIL
[ ] Test 9.2: Non-Admin Access - PASS/FAIL

Test Group 10: Production Readiness
[ ] Test 10.1: Performance Testing - PASS/FAIL
[ ] Test 10.2: Concurrent Operations - PASS/FAIL
[ ] Test 10.3: Mobile Responsiveness - PASS/FAIL

Overall Status: PASS/FAIL
Notes: _____________________
```

---

## 🔧 Troubleshooting

### Issue: Changes Not Reflecting

**Solution:**
1. Clear browser cache
2. Check if cache clear was called
3. Manually call cache clear API
4. Refresh page

### Issue: Permission Errors

**Solution:**
1. Verify user has admin permissions
2. Check token validity
3. Verify role assignments

### Issue: UI Not Loading

**Solution:**
1. Check console for errors
2. Verify API connectivity
3. Check network tab for failed requests

---

## ✅ Production Readiness Checklist

Before deploying to production:

- [ ] All test groups passed
- [ ] Error handling tested
- [ ] Performance acceptable
- [ ] Mobile responsive
- [ ] Security verified (admin-only access)
- [ ] Cache management working
- [ ] User permissions validated
- [ ] Documentation complete
- [ ] Backup procedures tested
- [ ] Rollback plan prepared

---

## 📞 Support

For issues during testing:

1. **Check Console:** Browser dev tools console
2. **Check Network:** Network tab for failed API calls
3. **Check Logs:** Backend logs if available
4. **Verify Token:** `localStorage.getItem('auth.session.v1')`

---

## 📝 Changelog

### Version 1.0.0 (2025-11-01)
- ✨ Initial RBAC testing guide
- 📝 Comprehensive test scenarios
- ✅ Production readiness checklist

---

**Status:** READY FOR TESTING
**Environment:** Development → Staging → Production
**Next Steps:** Execute all test scenarios and verify results

