# Dummy Data Generator untuk Auth Service

Script untuk generate dummy data users, roles, dan permissions untuk testing dan development environment.

## 📋 Features

- ✅ **32+ Sample Users** dengan berbagai roles dan karakteristik
- ✅ **5 Role Types**: ADMIN, DOCTOR, TECHNICIAN, RECEPTIONIST, VIEWER
- ✅ **60+ Permissions** dengan kategori lengkap
- ✅ **Multi-Role Support** - user bisa punya multiple roles
- ✅ **Direct Permissions** - permissions langsung ke user
- ✅ **Realistic Data** menggunakan Faker library
- ✅ **Activity Simulation** - last login, failed attempts
- ✅ **Comprehensive Logging** untuk tracking proses

## 🚀 Quick Start

### 1. Install Dependencies
```bash
# Install dependencies untuk dummy data generator
pip install -r requirements_dummy.txt
```

### 2. Set Environment Variables
```bash
# Set database connection (optional, ada default values)
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5532
export POSTGRES_DB=worklist_db
export POSTGRES_USER=dicom
export POSTGRES_PASSWORD=dicom123
```

### 3. Run Script
```bash
# Generate dummy data
python generate_dummy_data.py
```

## 👥 Generated Users

### Key Test Users
| Username | Password | Role | Description |
|----------|----------|------|-------------|
| `admin` | `admin123` | ADMIN | Full system access |
| `superadmin` | `super123` | ADMIN | Super administrator |
| `dr.smith` | `doctor123` | DOCTOR | Medical doctor |
| `dr.sarah` | `doctor123` | DOCTOR | Medical doctor |
| `dr.ahmad` | `doctor123` | DOCTOR | Medical doctor |
| `tech.mike` | `tech123` | TECHNICIAN | Radiology technician |
| `tech.lisa` | `tech123` | TECHNICIAN | Radiology technician |
| `tech.budi` | `tech123` | TECHNICIAN | Radiology technician |
| `reception.anna` | `reception123` | RECEPTIONIST | Front desk |
| `reception.siti` | `reception123` | RECEPTIONIST | Front desk |
| `viewer.guest` | `viewer123` | VIEWER | Read-only access |
| `intern.john` | `intern123` | VIEWER | Intern with limited access |

### Additional Users
- **20 Random Users** dengan nama realistis menggunakan Faker
- **Mixed Verification Status** - 75% verified, 25% unverified
- **Department Assignment** - Radiology, Cardiology, Neurology, dll
- **Activity Simulation** - last login dalam 30 hari terakhir

## 🔐 Roles & Permissions

### ADMIN
- **Permissions**: `["*"]` (All permissions)
- **Description**: System Administrator
- **Access**: Full system access

### DOCTOR
- **Permissions**: 
  - `order:read`, `order:create`
  - `worklist:read`, `worklist:update`
  - `orthanc:read`
- **Description**: Medical Doctor
- **Access**: Medical workflow management

### TECHNICIAN
- **Permissions**:
  - `worklist:read`, `worklist:update`, `worklist:scan`
  - `orthanc:read`, `orthanc:write`
- **Description**: Radiology Technician
- **Access**: Equipment operation and DICOM management

### RECEPTIONIST
- **Permissions**:
  - `order:read`, `order:create`
  - `worklist:create`, `worklist:read`, `worklist:search`
- **Description**: Front Desk Receptionist
- **Access**: Patient registration and scheduling

### VIEWER
- **Permissions**:
  - `worklist:read`, `orthanc:read`
- **Description**: Read-only Access
- **Access**: View-only access to system

## 🎯 Permission Categories

### User Management
- `user:read`, `user:create`, `user:update`, `user:delete`, `user:manage`

### Patient Management
- `patient:read`, `patient:create`, `patient:update`, `patient:delete`, `patient:*`

### Order Management
- `order:read`, `order:create`, `order:update`, `order:delete`, `order:*`

### Worklist Management
- `worklist:read`, `worklist:create`, `worklist:update`, `worklist:delete`
- `worklist:scan`, `worklist:search`, `worklist:*`

### DICOM Management
- `dicom:read`, `dicom:write`, `dicom:delete`, `dicom:*`

### Equipment Management
- `equipment:read`, `equipment:create`, `equipment:update`, `equipment:delete`, `equipment:*`

### Appointment Management
- `appointment:read`, `appointment:create`, `appointment:update`, `appointment:delete`, `appointment:*`

### System Administration
- `system:admin`, `system:config`, `system:logs`, `*`

## 🔄 Multi-Role Examples

Beberapa users memiliki multiple roles untuk testing:

- **admin**: ADMIN + DOCTOR
- **dr.smith**: DOCTOR + TECHNICIAN
- **tech.mike**: TECHNICIAN + VIEWER

## 🎯 Direct Permissions

Beberapa users mendapat direct permissions (tidak melalui role):

- **intern.john**: `patient:read`, `worklist:read`
- **viewer.guest**: `dicom:read`

## 📊 Database Tables

Script ini akan populate tables berikut:

1. **users** - User accounts
2. **roles** - Role definitions
3. **permissions** - Permission definitions
4. **user_roles** - User-role mappings (many-to-many)
5. **role_permissions** - Role-permission mappings (many-to-many)
6. **user_permissions** - Direct user permissions (many-to-many)

## 🛠️ Troubleshooting

### Database Connection Error
```bash
# Check database is running
docker-compose ps postgres

# Check connection
psql -h localhost -p 5532 -U dicom -d worklist_db
```

### Permission Denied
```bash
# Make sure database is initialized
docker-compose logs auth-service
```

### Users Already Exist
Script menggunakan `ON CONFLICT DO NOTHING`, jadi aman untuk dijalankan multiple kali.

## 🧪 Testing

Setelah generate dummy data, test dengan:

```bash
# Test login
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# Test user list (need admin token)
curl -X GET http://localhost:5000/auth/users \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📝 Notes

- Script menggunakan **Faker** untuk generate nama realistis
- Password di-hash menggunakan **bcrypt**
- Support untuk **Indonesian** dan **English** locales
- **Logging** lengkap untuk tracking proses
- **Error handling** untuk database conflicts
- **Transaction safety** dengan rollback on error

## 🔧 Customization

Edit `generate_dummy_data.py` untuk:
- Tambah/ubah user templates
- Modify role assignments
- Adjust permission mappings
- Change data generation logic

---

**Happy Testing!** 🚀