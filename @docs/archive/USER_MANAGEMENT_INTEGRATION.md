# User Management Integration Documentation

## Overview

Implementasi komprehensif untuk manajemen user yang terintegrasi dengan Backend API (http://103.42.117.19:8888). Sistem ini mendukung RBAC (Role-Based Access Control) dengan wildcard permissions dan manajemen user secara penuh.

---

## 📁 File Structure

```
src/
├── services/
│   └── userService.js          # API service untuk user management
├── pages/
│   └── UserManagement.jsx      # Halaman utama user management
├── components/
│   └── Layout.jsx              # Updated dengan menu user management
└── App.jsx                     # Updated routing
```

---

## 🔧 Components

### 1. User Service (`src/services/userService.js`)

Service layer yang menangani semua API calls untuk user management.

**Base URL:** `http://103.42.117.19:8888`

#### Authentication Methods
- `login(username, password)` - Login dan simpan token
- `register(userData)` - Registrasi user baru (public)
- `getCurrentUser()` - Dapatkan profil user saat ini
- `changePassword(currentPassword, newPassword)` - Ubah password
- `logout()` - Logout dan hapus token

#### User Management Methods
- `getUsers(params)` - List users dengan pagination dan filter
  - Params: `page`, `limit`, `search`, `role`
- `getUserById(userId)` - Detail user
- `createUser(userData)` - Buat user baru (Admin)
- `updateUser(userId, userData)` - Update user (Admin)
- `deleteUser(userId)` - Soft delete user (Admin)
- `changeUserPassword(userId, newPassword)` - Change user password (Admin)
- `activateUser(userId)` - Aktifkan user
- `deactivateUser(userId)` - Non-aktifkan user

#### Role Management Methods
- `getRoles()` - List semua roles
- `getRoleByName(roleName)` - Detail role
- `createRole(roleData)` - Buat role baru
- `getUsersInRole(roleName)` - Users dalam role tertentu
- `getRolePermissions(roleId)` - Permissions dalam role
- `assignPermissionToRole(roleId, permissionId)` - Assign permission ke role
- `removePermissionFromRole(roleId, permissionId)` - Hapus permission dari role

#### Permission Management Methods
- `getPermissions()` - List semua permissions
- `createPermission(permissionData)` - Buat permission baru
- `checkPermission(permission)` - Check apakah user memiliki permission

#### User-Role Assignment Methods
- `getUserRoles(userId)` - Roles user
- `assignRoleToUser(userId, roleId, roleName)` - Assign role ke user
- `removeRoleFromUser(userId, roleId)` - Hapus role dari user

#### User-Permission Assignment Methods
- `getUserPermissions(userId)` - Direct permissions user
- `assignPermissionToUser(userId, permissionId)` - Assign permission ke user
- `removePermissionFromUser(userId, permissionId)` - Hapus permission dari user

#### Cache Management Methods
- `clearCache()` - Clear permission cache (Admin)
- `getCacheStats()` - Statistik cache (Admin)

---

### 2. User Management Page (`src/pages/UserManagement.jsx`)

Halaman komprehensif untuk manajemen user dengan fitur lengkap.

#### Features

1. **User List dengan Pagination**
   - Tampilan tabel dengan informasi lengkap
   - Avatar user dengan initial
   - Status aktif/inactive
   - Role badge
   - Last login timestamp

2. **Search dan Filter**
   - Search by username, email, atau full name
   - Filter by role
   - Real-time search

3. **Create User**
   - Form lengkap untuk user baru
   - Validasi password (minimum 8 karakter)
   - Pilih role dari dropdown
   - Set status aktif/inactive

4. **Edit User**
   - Update informasi user
   - Username tidak bisa diubah
   - Password opsional (kosongkan untuk tidak ubah)
   - Update role dan status

5. **View User Details**
   - Informasi lengkap user
   - List permissions dengan badge
   - Timestamp created_at dan last_login

6. **User Actions**
   - Activate/Deactivate user
   - Delete user (dengan konfirmasi)
   - Change password
   - Edit informasi

7. **Error Handling**
   - Success/Error messages dengan auto-dismiss (5 detik)
   - Loading states untuk semua operations
   - Konfirmasi untuk destructive actions

#### State Management

```javascript
// Pagination
const [currentPage, setCurrentPage] = useState(1)
const [totalPages, setTotalPages] = useState(1)
const [totalUsers, setTotalUsers] = useState(0)

// Filters
const [searchQuery, setSearchQuery] = useState('')
const [roleFilter, setRoleFilter] = useState('')

// Modal
const [showModal, setShowModal] = useState(false)
const [modalMode, setModalMode] = useState('create') // 'create' | 'edit' | 'view'
const [selectedUser, setSelectedUser] = useState(null)

// Form
const [formData, setFormData] = useState({
  username: '',
  email: '',
  password: '',
  full_name: '',
  role: 'VIEWER',
  is_active: true,
})
```

---

## 🔐 Authentication & Authorization

### JWT Token Storage
Token disimpan di `localStorage` dengan key `token`:

```javascript
localStorage.setItem('token', access_token)
```

### Authorization Header
Setiap request ke protected endpoint menggunakan Bearer token:

```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
}
```

### Permission System

Sistem menggunakan wildcard permissions:

- `*` - Admin (all permissions)
- `category:*` - All actions dalam category (e.g., `user:*`)
- `category:action` - Specific action (e.g., `user:read`)

**Available Permission Categories:**
- `user` - User management
- `patient` - Patient data
- `order` - Order management
- `worklist` - Worklist operations
- `dicom` / `orthanc` - DICOM/Orthanc access
- `accession` - Accession numbers
- `system` - System administration

---

## 🎨 UI Components

### User Table
Tampilan tabel responsif dengan kolom:
- User (avatar + name + username)
- Email
- Role (badge)
- Status (Active/Inactive badge)
- Last Login
- Actions (View, Edit, Activate/Deactivate, Delete)

### User Modal
Modal dengan 3 mode:
1. **Create Mode** - Form untuk user baru
2. **Edit Mode** - Form untuk update user
3. **View Mode** - Detail user read-only

### Pagination Controls
- Previous/Next buttons
- Page numbers (max 5 shown)
- Total pages indicator
- Responsive design (mobile & desktop)

### Search & Filters
- Search input dengan submit button
- Role dropdown filter
- Results counter

---

## 📝 API Request Examples

### Login
```javascript
const response = await userService.login('admin', 'Admin@12345')
// Returns: { status, access_token, user }
```

### Get Users with Pagination
```javascript
const response = await userService.getUsers({
  page: 1,
  limit: 20,
  search: 'john',
  role: 'DOCTOR'
})
// Returns: { status, data: { users, pagination } }
```

### Create User
```javascript
const userData = {
  username: 'doctor01',
  email: 'doctor@hospital.com',
  password: 'SecurePass123',
  full_name: 'Dr. John Doe',
  role: 'DOCTOR',
  is_active: true
}
const response = await userService.createUser(userData)
// Returns: { status, message, user }
```

### Update User
```javascript
const updateData = {
  full_name: 'Dr. John Doe Jr.',
  role: 'ADMIN',
  is_active: false
}
const response = await userService.updateUser(userId, updateData)
// Returns: { status, message, user }
```

### Activate/Deactivate User
```javascript
await userService.activateUser(userId)
await userService.deactivateUser(userId)
// Returns: { status, message }
```

### Delete User
```javascript
await userService.deleteUser(userId)
// Returns: { status, message }
```

---

## 🚀 Usage Guide

### 1. Development Setup

```bash
# Install dependencies (jika belum)
npm install

# Run development server
npm run dev
```

### 2. Accessing User Management

Navigasi ke halaman User Management:
- URL: `http://localhost:5173/user-management`
- Menu: Sidebar → User Management → User Admin

### 3. Required Permissions

User harus memiliki salah satu dari permissions berikut:
- `user:manage` - Full user management access
- `user:read` - Read-only access
- `*` - Admin access (all permissions)

### 4. Testing

#### Test Login
```javascript
// Dalam browser console atau component
import { login } from './services/userService'

const result = await login('admin', 'Admin@12345')
console.log(result)
```

#### Test Get Users
```javascript
import { getUsers } from './services/userService'

const result = await getUsers({ page: 1, limit: 10 })
console.log(result)
```

---

## 🔧 Configuration

### Base URL
Edit di `src/services/userService.js`:

```javascript
const BASE_URL = 'http://103.42.117.19:8888'
```

### Pagination Limit
Edit di `src/pages/UserManagement.jsx`:

```javascript
const [limit] = useState(20) // Change to desired default
```

---

## 🎯 Role Permissions Matrix

| Role | Key Permissions |
|------|----------------|
| **ADMIN** | `*` (all permissions) |
| **DOCTOR** | `order:read`, `order:create`, `worklist:read`, `worklist:update`, `orthanc:read` |
| **TECHNICIAN** | `worklist:read`, `worklist:update`, `worklist:scan`, `orthanc:read`, `orthanc:write` |
| **RECEPTIONIST** | `order:read`, `order:create`, `worklist:create`, `worklist:read`, `worklist:search` |
| **VIEWER** | `worklist:read`, `orthanc:read` |

---

## ⚠️ Important Notes

### Security
1. **Password Strength**: Minimum 8 characters required
2. **Token Expiry**: JWT tokens expire after configured time
3. **HTTPS**: Use HTTPS in production for secure token transmission
4. **CORS**: Backend must allow requests from your frontend origin

### Best Practices
1. **Error Handling**: Always wrap API calls in try-catch
2. **Loading States**: Show loading indicators during API calls
3. **Confirmations**: Ask confirmation for destructive actions
4. **Auto-Refresh**: Reload user list after modifications
5. **Token Management**: Check for expired tokens and redirect to login

### Known Limitations
1. Username cannot be changed after creation
2. Soft delete only (users marked inactive, not removed from DB)
3. Password must be provided when creating user
4. Cannot delete own account

---

## 🐛 Troubleshooting

### Issue: "401 Unauthorized"
**Solution:** Token expired or invalid. Login again.

### Issue: "403 Forbidden"
**Solution:** User doesn't have required permissions. Check user role.

### Issue: "Network Error" / "Failed to fetch"
**Solution:**
- Check backend is running: `http://103.42.117.19:8888/health`
- Check CORS configuration
- Check network connectivity

### Issue: Users not loading
**Solution:**
- Check browser console for errors
- Verify token in localStorage
- Test API endpoint directly with Postman/curl

### Issue: Modal not closing
**Solution:** Check for JavaScript errors in console. Clear browser cache.

---

## 📚 API Documentation References

- Main API Docs: `docs/api_user_documentation.md`
- RBAC Update Docs: `docs/API_GATEWAY_RBAC_UPDATE.md`
- Backend API: `http://103.42.117.19:8888`

---

## 🔄 Future Enhancements

### Planned Features
- [ ] Bulk user operations (activate, deactivate, delete)
- [ ] Export user list to CSV/Excel
- [ ] Advanced filtering (by status, date range)
- [ ] User activity logs
- [ ] Permission editor UI
- [ ] Role assignment UI with checkboxes
- [ ] Password reset via email
- [ ] Two-factor authentication
- [ ] User profile pictures upload
- [ ] User groups/teams management

### Performance Improvements
- [ ] Implement virtual scrolling for large user lists
- [ ] Add caching layer for roles and permissions
- [ ] Debounce search input
- [ ] Optimize re-renders with React.memo

---

## 📞 Support

For issues or questions:
- Check backend logs: `docker logs api-gateway -f`
- Check auth-service logs: `docker logs auth-service -f`
- Review browser console errors
- Test API endpoints with curl/Postman

---

## ✅ Implementation Checklist

- [x] User service API implementation
- [x] UserManagement page component
- [x] Routing configuration
- [x] Navigation menu integration
- [x] RBAC permission checks
- [x] Error handling
- [x] Loading states
- [x] Pagination
- [x] Search and filters
- [x] Create/Edit/View modals
- [x] Delete confirmation
- [x] Activate/Deactivate actions
- [x] Success/Error messages
- [x] Documentation
- [ ] Integration testing
- [ ] E2E testing
- [ ] Performance optimization
- [ ] Accessibility improvements

---

## 📝 Changelog

### Version 1.0.0 (2025-11-01)
- ✨ Initial implementation
- ✨ Complete CRUD operations for users
- ✨ Role and permission management
- ✨ Search and filter functionality
- ✨ Pagination support
- ✨ Modal-based UI for create/edit/view
- ✨ Comprehensive error handling
- 📚 Documentation

---

## 👥 Contributors

- Development: Claude Code Assistant
- Backend API: MWL-PACS Team
- Documentation: Auto-generated

---

## 📄 License

Part of MWL-PACS UI project. See main project license.
