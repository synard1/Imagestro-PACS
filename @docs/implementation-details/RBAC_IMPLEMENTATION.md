# RBAC Implementation in MWL-PACS UI

## Overview
This document describes the Role-Based Access Control (RBAC) implementation in the MWL-PACS UI application, aligned with the RBAC documentation from the backend services.

## Core Components

### 1. RBAC Service (`src/services/rbac.js`)
The RBAC service handles permission checking and user management in the frontend.

#### Key Functions:
- `can(need, user)`: Check if a user has a specific permission
- `canAny(needs, user)`: Check if a user has any of the specified permissions
- `canAll(needs, user)`: Check if a user has all of the specified permissions
- `setCurrentUser(user)`: Set the current authenticated user
- `getCurrentUser()`: Get the current authenticated user
- `clearCurrentUser()`: Clear the current user (logout)

#### Permission Matching
The system supports several types of permission matching:
1. **Exact Match**: `user:read` matches `user:read`
2. **Global Wildcard**: `*` grants all permissions
3. **Category Wildcard**: `user:*` grants all user-related permissions
4. **Required Wildcard**: Checking for `user.*` matches any user permission

#### Admin Detection
Users are considered administrators if they have:
- Role of "admin" or "superadmin" (case-insensitive)
- Global wildcard permission (`*`)
- Admin wildcard permission (`admin.*`)

### 2. User Service (`src/services/userService.js`)
Handles all user management operations with both backend API and mock data support.

#### User Management Operations:
- `getUsers(params)`: List users with pagination and filtering
- `getUserById(userId)`: Get specific user details
- `createUser(userData)`: Create a new user
- `updateUser(userId, userData)`: Update user information
- `deleteUser(userId)`: Delete a user
- `changeUserPassword(userId, newPassword)`: Change user password
- `activateUser(userId)`: Activate a user account
- `deactivateUser(userId)`: Deactivate a user account

#### Role Management Operations:
- `getRoles()`: List all roles
- `getRole(roleId)`: Get specific role details
- `getRoleByName(roleName)`: Get role by name
- `createRole(roleData)`: Create a new role
- `updateRole(roleId, roleData)`: Update role information
- `deleteRole(roleId)`: Delete a role
- `getUsersInRole(roleName)`: Get users assigned to a role
- `getRolePermissions(roleId)`: Get permissions assigned to a role
- `assignPermissionToRole(roleId, permissionId)`: Assign permission to role
- `removePermissionFromRole(roleId, permissionId)`: Remove permission from role

#### Permission Management Operations:
- `getPermissions()`: List all permissions
- `getPermission(permissionId)`: Get specific permission details
- `createPermission(permissionData)`: Create a new permission
- `updatePermission(permissionId, permissionData)`: Update permission information
- `deletePermission(permissionId)`: Delete a permission
- `checkPermission(permission)`: Check if current user has a permission

#### User-Role Assignment Operations:
- `getUserRoles(userId)`: Get roles assigned to a user
- `assignRoleToUser(userId, roleId, roleName)`: Assign role to user
- `removeRoleFromUser(userId, roleId)`: Remove role from user

#### User-Permission Assignment Operations:
- `getUserPermissions(userId)`: Get permissions directly assigned to a user
- `assignPermissionToUser(userId, permissionId)`: Assign permission directly to user
- `removePermissionFromUser(userId, permissionId)`: Remove permission from user

#### Cache Management Operations:
- `clearCache()`: Clear RBAC cache
- `getCacheStats()`: Get RBAC cache statistics

### 3. Mock User Service (`src/services/mockUserService.js`)
Provides mock implementations for local development when backend is not available.

## RBAC Patterns Alignment

### Permission Naming Convention
Permissions follow the pattern `resource:action`:
- `user:read` - Read user information
- `user:create` - Create users
- `user:update` - Update user information
- `user:delete` - Delete users
- `user:manage` - Full user management
- `role:read` - Read roles
- `role:create` - Create roles
- `role:update` - Update roles
- `role:delete` - Delete roles
- `permission:read` - Read permissions
- `permission:create` - Create permissions
- `permission:update` - Update permissions
- `permission:delete` - Delete permissions

### Wildcard Support
The system supports several wildcard patterns:
- `*` - Grants all permissions (super admin)
- `resource:*` - Grants all actions on a resource (e.g., `user:*` grants all user permissions)
- `category:*` - Category-level permissions (e.g., `admin:*`)

### Reserved Roles and Permissions
Based on the backend documentation, certain roles and permissions are reserved:
- `SUPERADMIN` - Full system access
- `DEVELOPER` - Development and system configuration access
- `*` - Global wildcard permission
- `setting:dev` - Developer settings access
- `rbac:manage` - RBAC management permissions

## Integration with Backend Services

### Authentication Flow
1. User logs in via `authService.loginBackend()`
2. JWT token is received and stored
3. User data with permissions is extracted from the token
4. User data is stored in localStorage via `rbac.setCurrentUser()`
5. Permission checks are performed using `rbac.can()` functions

### API Communication
The userService uses the `apiClient` from `http.js` to communicate with backend services:
- Each service module has its own configuration in `api-registry.js`
- Authentication headers are automatically added to requests
- Error handling and response parsing is centralized

### Mock Data Fallback
When backend services are disabled:
- userService automatically falls back to mockUserService
- Mock data is stored in memory and simulates API responses
- Delay functions simulate network latency for realistic testing

## UI Implementation

### User Management Page (`src/pages/UserManagement.jsx`)
- Full CRUD operations for users, roles, and permissions
- Tabbed interface for user management and RBAC management
- Search and filtering capabilities
- Pagination for large datasets
- Password generation and strength checking
- Role-permission assignment interface

### Permission Checking in Components
Components can check permissions using:
```javascript
import { can } from '../services/rbac';

// Check for a specific permission
if (can('user:manage')) {
  // Show admin features
}

// Check for any of several permissions
if (canAny(['user:manage', 'user:create'])) {
  // Show create user button
}

// Check for all required permissions
if (canAll(['user:read', 'user:update'])) {
  // Show edit user functionality
}
```

### Protected Routes
The application uses `ProtectedRoute` components to restrict access to pages based on permissions.

## Best Practices

### 1. Permission Granularity
Use specific permissions rather than broad ones when possible:
- Prefer `user:read` over `user:*` for read-only access
- Use `user:manage` for full user management capabilities

### 2. Consistent Naming
Follow the `resource:action` pattern for all custom permissions:
- Use lowercase letters and underscores
- Be descriptive but concise
- Group related permissions by resource

### 3. Error Handling
Always handle permission-related errors gracefully:
- Show appropriate error messages for forbidden actions
- Redirect users to unauthorized pages when needed
- Log permission failures for auditing

### 4. Caching
The system includes cache management for RBAC data:
- Clear cache after permission changes
- Monitor cache statistics for performance optimization

## Testing

### Unit Tests
- Test permission matching logic with various wildcard scenarios
- Verify admin detection works correctly
- Test mock service implementations
- Validate API service error handling

### Integration Tests
- Test full user management workflows
- Verify role-permission assignments
- Check permission inheritance through roles
- Validate cache clearing functionality

## Security Considerations

### Frontend Security
- All permission checks are also enforced on the backend
- Frontend checks improve UX but don't replace backend security
- Sensitive operations should always be validated server-side

### Token Management
- JWT tokens are securely stored in localStorage
- Tokens are automatically refreshed when expired
- Proper cleanup on logout

### Data Protection
- Protected test data (SATUSEHAT) cannot be modified
- Role and permission constraints prevent unauthorized access
- Audit logging for sensitive operations