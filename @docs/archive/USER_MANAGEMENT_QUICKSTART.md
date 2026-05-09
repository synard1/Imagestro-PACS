# User Management - Quick Start Guide

## 🚀 Quick Setup

### 1. Files Created
```
✅ src/services/userService.js      - API service layer
✅ src/pages/UserManagement.jsx     - Main UI component
✅ src/App.jsx                      - Updated with routing
✅ src/components/Layout.jsx        - Updated with menu
```

### 2. Access the Page
```
URL: http://localhost:5173/user-management
Menu: Sidebar → User Management → User Admin
```

### 3. Required Permissions
User needs one of:
- `user:manage`
- `user:read`
- `*` (admin)

---

## 📱 Usage Examples

### Login
```javascript
import { login } from './services/userService'

// Login
const result = await login('admin', 'Admin@12345')
console.log(result.access_token) // JWT token stored automatically
```

### Get Users
```javascript
import { getUsers } from './services/userService'

// Get paginated users
const users = await getUsers({ page: 1, limit: 20 })

// With search
const filtered = await getUsers({
  page: 1,
  limit: 20,
  search: 'john',
  role: 'DOCTOR'
})
```

### Create User
```javascript
import { createUser } from './services/userService'

const newUser = await createUser({
  username: 'doctor01',
  email: 'doctor@hospital.com',
  password: 'SecurePass123',
  full_name: 'Dr. John Doe',
  role: 'DOCTOR',
  is_active: true
})
```

### Update User
```javascript
import { updateUser } from './services/userService'

// Update user (password optional)
const updated = await updateUser('user-id', {
  full_name: 'Dr. John Doe Jr.',
  role: 'ADMIN',
  is_active: false
})
```

### Manage User Status
```javascript
import { activateUser, deactivateUser } from './services/userService'

// Activate
await activateUser('user-id')

// Deactivate
await deactivateUser('user-id')
```

### Delete User
```javascript
import { deleteUser } from './services/userService'

await deleteUser('user-id')
```

---

## 🎨 UI Features

### List View
- ✅ User table with avatar, name, email, role, status
- ✅ Search by username, email, or name
- ✅ Filter by role
- ✅ Pagination (20 users per page)
- ✅ Last login timestamp

### Actions
- 👁️ **View** - See full user details and permissions
- ✏️ **Edit** - Update user information
- 🔄 **Activate/Deactivate** - Toggle user status
- 🗑️ **Delete** - Soft delete user (with confirmation)

### Create/Edit Modal
- Username (required, cannot change after creation)
- Email (required)
- Full Name (optional)
- Password (required for new user, optional for edit)
- Role (dropdown)
- Active status (checkbox)

---

## 🔑 Available Roles

| Role | Permissions |
|------|------------|
| **ADMIN** | `*` (all) |
| **DOCTOR** | Orders, Worklist, Orthanc read |
| **TECHNICIAN** | Worklist, Orthanc read/write |
| **RECEPTIONIST** | Orders, Worklist create/read |
| **VIEWER** | Worklist, Orthanc read only |

---

## ⚡ Testing

### 1. Test Backend Connection
```bash
curl http://103.42.117.19:8888/health
```

### 2. Test Login
```bash
curl -X POST http://103.42.117.19:8888/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@12345"}'
```

### 3. Test Get Users
```bash
curl http://103.42.117.19:8888/auth/users?page=1&limit=10 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🐛 Common Issues

### 401 Unauthorized
**Cause:** Invalid/expired token
**Fix:** Login again

### 403 Forbidden
**Cause:** Insufficient permissions
**Fix:** Check user role has `user:manage`, `user:read`, or `*`

### Network Error
**Cause:** Backend not reachable
**Fix:**
1. Check backend: `http://103.42.117.19:8888/health`
2. Check CORS settings
3. Check network/firewall

### Users Not Loading
**Fix:**
1. Open browser console
2. Check for errors
3. Verify token: `localStorage.getItem('token')`
4. Test API with Postman

---

## 🔧 Configuration

### Change Base URL
Edit `src/services/userService.js`:
```javascript
const BASE_URL = 'http://103.42.117.19:8888' // Change here
```

### Change Pagination Limit
Edit `src/pages/UserManagement.jsx`:
```javascript
const [limit] = useState(20) // Change default limit
```

---

## 📚 Full Documentation

See `docs/USER_MANAGEMENT_INTEGRATION.md` for complete documentation.

---

## ✅ Quick Checklist

- [ ] Backend running at http://103.42.117.19:8888
- [ ] Login with admin credentials
- [ ] Navigate to User Management page
- [ ] Test create user
- [ ] Test edit user
- [ ] Test activate/deactivate
- [ ] Test delete user
- [ ] Test search functionality
- [ ] Test role filter
- [ ] Test pagination

---

## 🎯 Next Steps

1. **Test all functionality** in the UI
2. **Verify permissions** for different roles
3. **Check error handling** with invalid inputs
4. **Test pagination** with large datasets
5. **Review security** (HTTPS in production)

---

## 📞 Need Help?

- 📖 Full docs: `docs/USER_MANAGEMENT_INTEGRATION.md`
- 🔌 API docs: `docs/api_user_documentation.md`
- 🔐 RBAC docs: `docs/API_GATEWAY_RBAC_UPDATE.md`
- 🖥️ Backend: `http://103.42.117.19:8888`

---

**Happy Coding! 🚀**
