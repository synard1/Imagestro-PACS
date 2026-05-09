# API Gateway - Index Fitur & Function (Optimized Version)

## 📊 System Overview
**API Gateway v2.2.0** - Production Ready dengan Enhanced RBAC Support
*Single Entry Point* untuk seluruh sistem dengan JWT Authentication dan Role-Based Access Control

---

## 🗺️ Architecture Map
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Web UIs      │    │   External      │
│   (React, etc)  │    │   (MWL, UI)    │    │   Systems       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   API Gateway   │ ← Single Entry Point
                    │   (Port 8888)   │
                    └─────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Auth Service │  │ Order Mgmt   │  │ Master Data  │
│ (Port 5000)   │  │ (Port 8001)  │  │ (Port 8002)  │
└──────────────┘  └──────────────┘  └──────────────┘
        │                    │                    │
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ User Mgmt    │  │ MWL Writer   │  │ Patient/Doc  │
│              │  │              │  │ Procedures   │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 🔍 Search & Navigation Guide

### Quick Search by Category
- **Authentication**: `/auth/*` - User management, roles, permissions
- **Orders**: `/orders/*` - Order processing, SATUSEHAT integration
- **Worklist**: `/worklist/*` - Modality worklist management
- **Master Data**: `/patients/*`, `/doctors/*`, `/procedures/*` - Reference data
- **Orthanc**: `/orthanc/*`, `/orthanc-ui/*` - DICOM server access
- **Settings**: `/settings/*` - Configuration management

### Search by Permission Level
- **Superadmin Only**: `system:admin`, `*` permissions
- **Admin**: User/role management endpoints
- **User**: Standard CRUD operations
- **Public**: Health checks, static assets

---

## 📋 Endpoint Catalog

### 1. ROOT & HEALTH ROUTES
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/` | GET | `index` | `api_gateway.py` | 8-48 | Simple | Public | `api-gateway` |
| `/health` | GET | `health` | `api_gateway.py` | 52-133 | Medium | Public | `api-gateway` |

**Description**: Root endpoint and system health monitoring with detailed service status

---

### 2. AUTHENTICATION ROUTES (Enhanced RBAC)

#### 🔐 Public Auth Endpoints (No Auth Required)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/auth/login` | POST | `auth_login` | `api_gateway.py` | 139-142 | Simple | Public | `auth-service` |
| `/auth/verify` | POST | `auth_verify` | `api_gateway.py` | 144-147 | Simple | Public | `auth-service` |
| `/auth/register` | POST | `auth_register_public` | `api_gateway.py` | 149-152 | Simple | Public | `auth-service` |

#### 👤 User Profile Management
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/auth/me` | GET | `auth_me` | `api_gateway.py` | 155-158 | Proxy | Auth | `auth-service` |
| `/auth/change-password` | POST | `auth_change_password` | `api_gateway.py` | 161-164 | Proxy | Auth | `auth-service` |

#### 👥 User Management (Admin)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/auth/users` | GET | `auth_users_list` | `api_gateway.py` | 167-174 | Proxy | Admin | `auth-service` |
| `/auth/users` | POST | `auth_users_create` | `api_gateway.py` | 177-180 | Proxy | Admin | `auth-service` |
| `/auth/users/<user_id>` | GET | `auth_users_get` | `api_gateway.py` | 183-186 | Proxy | Admin | `auth-service` |
| `/auth/users/<user_id>` | PUT | `auth_users_update` | `api_gateway.py` | 189-192 | Proxy | Admin | `auth-service` |
| `/auth/users/<user_id>` | DELETE | `auth_users_delete` | `api_gateway.py` | 195-198 | Proxy | Admin | `auth-service` |
| `/auth/users/<user_id>/change-password` | POST | `auth_users_change_password` | `api_gateway.py` | 201-204 | Proxy | Admin | `auth-service` |
| `/auth/users/<user_id>/activate` | POST | `auth_users_activate` | `api_gateway.py` | 207-210 | Proxy | Admin | `auth-service` |
| `/auth/users/<user_id>/deactivate` | POST | `auth_users_deactivate` | `api_gateway.py` | 213-216 | Proxy | Admin | `auth-service` |

#### 👑 Role Management (Superadmin/Developer Only)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/auth/roles` | GET | `auth_roles_list` | `api_gateway.py` | 219-232 | Complex 🔴 | High | `auth-service` |
| `/auth/roles` | POST | `auth_roles_create` | `api_gateway.py` | 235-242 | Complex 🔴 | High | `auth-service` |
| `/auth/roles/<role_name>` | GET | `auth_roles_get` | `api_gateway.py` | 245-252 | Complex 🔴 | High | `auth-service` |
| `/auth/roles/<role_name>/users` | GET | `auth_roles_users` | `api_gateway.py` | 255-262 | Complex 🔴 | High | `auth-service` |
| `/auth/roles/<role_id>/permissions` | GET | `auth_roles_permissions_get` | `api_gateway.py` | 265-272 | Complex 🔴 | High | `auth-service` |
| `/auth/roles/<role_id>/permissions` | POST | `auth_roles_permissions_assign` | `api_gateway.py` | 275-282 | Complex 🔴 | High | `auth-service` |
| `/auth/roles/<role_id>/permissions/<permission_id>` | DELETE | `auth_roles_permissions_remove` | `api_gateway.py` | 285-292 | Complex 🔴 | High | `auth-service` |

#### 🔐 Permission Management (Superadmin/Developer Only)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/auth/permissions` | GET | `auth_permissions_list` | `api_gateway.py` | 295-355 | Complex 🔴 | High | `auth-service` |
| `/auth/permissions` | POST | `auth_permissions_create` | `api_gateway.py` | 358-387 | Complex 🔴 | High | `auth-service` |
| `/auth/permissions/check` | POST | `auth_permissions_check` | `api_gateway.py` | 390-393 | Simple | Auth | `auth-service` |

#### 🔄 User-Role Management
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/auth/users/<user_id>/roles` | GET | `auth_users_roles_get` | `api_gateway.py` | 396-399 | Proxy | Admin | `auth-service` |
| `/auth/users/<user_id>/roles` | POST | `auth_users_roles_assign` | `api_gateway.py` | 402-405 | Proxy | Admin | `auth-service` |
| `/auth/users/<user_id>/roles/<role_id>` | DELETE | `auth_users_roles_remove` | `api_gateway.py` | 408-411 | Proxy | Admin | `auth-service` |

#### 🎯 User-Permission Management
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/auth/users/<user_id>/permissions` | GET | `auth_users_permissions_get` | `api_gateway.py` | 414-417 | Proxy | Admin | `auth-service` |
| `/auth/users/<user_id>/permissions` | POST | `auth_users_permissions_assign` | `api_gateway.py` | 420-423 | Proxy | Admin | `auth-service` |
| `/auth/users/<user_id>/permissions/<permission_id>` | DELETE | `auth_users_permissions_remove` | `api_gateway.py` | 426-429 | Proxy | Admin | `auth-service` |

#### 💾 Cache Management (Superadmin/Developer Only)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/auth/cache/clear` | POST | `auth_cache_clear` | `api_gateway.py` | 432-435 | Simple 🔴 | High | `auth-service` |
| `/auth/cache/stats` | GET | `auth_cache_stats` | `api_gateway.py` | 438-441 | Simple 🔴 | High | `auth-service` |

#### 📋 Audit Logs (High Privilege Only)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/auth/audit/logs` | GET | `auth_audit_logs_proxy` | `api_gateway.py` | 444-461 | Complex 🔴 | High | `auth-service` |

#### 🔄 Catch-all Auth Proxy
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/auth/<path:path>` | GET/POST/PUT/DELETE | `auth_proxy` | `api_gateway.py` | 464-467 | Proxy | Auth | `auth-service` |

---

### 3. WORKLIST ROUTES
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/worklist/create` | POST | `worklist_create` | `api_gateway.py` | 470-473 | Proxy | Auth | `mwl-writer` |
| `/worklist/list` | GET | `worklist_list` | `api_gateway.py` | 476-479 | Proxy | Auth | `mwl-writer` |
| `/worklist/<path:path>` | GET/POST/PUT/DELETE | `worklist_proxy` | `api_gateway.py` | 482-485 | Proxy | Auth | `mwl-writer` |

---

### 4. MWL UI ROUTES (Public Access)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/mwl-ui` | GET | `mwl_ui_root` | `api_gateway.py` | 488-491 | Proxy | Public | `mwl-ui` |
| `/mwl-ui/health` | GET | `mwl_ui_health` | `api_gateway.py` | 494-497 | Proxy | Public | `mwl-ui` |
| `/mwl-ui/config` | GET | `mwl_ui_config` | `api_gateway.py` | 500-503 | Proxy | Public | `mwl-ui` |
| `/mwl-ui/api/<path:path>` | GET/POST/PUT/DELETE | `mwl_ui_api_proxy` | `api_gateway.py` | 506-509 | Proxy | Auth | `mwl-ui` |
| `/mwl-ui/<path:path>` | GET | `mwl_ui_static_proxy` | `api_gateway.py` | 512-515 | Proxy | Public | `mwl-ui` |

---

### 5. ORDER MANAGEMENT ROUTES
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/orders` | GET | `orders_list_root` | `api_gateway.py` | 518-521 | Custom Logic 🟡 | Auth | `order-management` |
| `/orders` | POST | `orders_create_root` | `api_gateway.py` | 524-527 | Custom Logic 🟡 | Auth | `order-management` |
| `/orders/<identifier>/satusehat-readiness` | GET | `orders_satusehat_readiness_proxy` | `api_gateway.py` | 530-533 | Proxy | Auth | `order-management` |
| `/orders/<identifier>/validation` | GET | `orders_validation_proxy` | `api_gateway.py` | 536-539 | Proxy | Auth | `order-management` |
| `/orders/<path:path>` | GET/POST/PUT/DELETE | `orders_proxy` | `api_gateway.py` | 542-596 | Complex 🟡 | Auth | `order-management` |
| `/orders/<identifier>/files/<file_id>/content` | GET | `orders_file_content_proxy` | `api_gateway.py` | 599-621 | Proxy | Auth | `order-management` |
| `/api/monitor/satusehat/orders` | GET | `monitor_satusehat_orders` | `api_gateway.py` | 624-675 | Complex 🟡 | Auth | `order-management` |

---

### 6. ACCESSION API ROUTES
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/accession/create` | POST | `accession_create` | `api_gateway.py` | 678-707 | Custom Logic 🟡 | Auth | `accession-api` |
| `/accession/<accession_number>` | GET | `accession_get` | `api_gateway.py` | 710-719 | Proxy | Auth | `accession-api` |
| `/accession/verify` | GET | `accession_verify` | `api_gateway.py` | 722-731 | Proxy | Auth | `accession-api` |
| `/accession/hooks/missing-acc` | POST | `accession_missing_hook` | `api_gateway.py` | 734-743 | Proxy | Admin | `accession-api` |
| `/accession/<path:path>` | GET/POST/PUT/DELETE | `accession_proxy` | `api_gateway.py` | 746-793 | Proxy | Auth | `accession-api` |

---

### 7. API SERVICEREQUEST ROUTES (Frontend Compatibility)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/api/servicerequest/create` | POST/OPTIONS | `api_servicerequest_create` | `api_gateway.py` | 796-838 | Complex 🟡 | Public | `satusehat-integrator` |

---

### 8. SATUSEHAT INTEGRATOR ROUTES
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/satusehat/token/generate` | POST | `satusehat_generate_token` | `api_gateway.py` | 841-926 | Complex 🔴 | High | `satusehat-integrator` |
| `/satusehat/<path:path>` | GET/POST/PUT/DELETE/OPTIONS | `satusehat_proxy` | `api_gateway.py` | 929-987 | Complex 🟡 | Auth | `satusehat-integrator` |
| `/DicomStudies` | POST | `dicom_studies_send` | `api_gateway.py` | 990-1005 | Proxy | Auth | `satusehat-integrator` |
| `/DicomStudies/cancel` | POST | `dicom_studies_cancel` | `api_gateway.py` | 1008-1023 | Proxy | Auth | `satusehat-integrator` |

---

### 9. ORTHANC API ROUTES (via Orthanc Proxy)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/orthanc/<path:path>` | GET/POST/PUT/DELETE | `orthanc_api_proxy` | `api_gateway.py` | 1026-1032 | Proxy | Auth | `orthanc-proxy` |

---

### 10. ORTHANC WEB UI ACCESS (Direct to Orthanc HTTP)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/orthanc-ui` | GET | `orthanc_web_ui_root` | `api_gateway.py` | 1035-1065 | Proxy | Basic Auth | `orthanc` |
| `/orthanc-ui/<path:path>` | GET/POST/PUT/DELETE | `orthanc_web_ui_proxy` | `api_gateway.py` | 1068-1120 | Complex 🟡 | Basic Auth | `orthanc` |
| `/ui` | GET | `orthanc_ui_static_proxy` | `api_gateway.py` | 1123-1154 | Proxy | Basic Auth | `orthanc` |
| `/app` | GET | `orthanc_app_static_proxy` | `api_gateway.py` | 1157-1188 | Proxy | Basic Auth | `orthanc` |

---

### 11. PATIENT MASTER DATA ROUTES
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/patients/<path:path>` | GET/POST/PUT/DELETE | `patients_proxy` | `api_gateway.py` | 1191-1244 | Proxy | Auth | `master-data-service` |
| `/patients/search` | GET | `patients_search` | `api_gateway.py` | 1247-1250 | Proxy | Auth | `master-data-service` |

---

### 12. DOCTOR/PRACTITIONER MASTER DATA ROUTES
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/doctors` | GET | `doctors_list` | `api_gateway.py` | 1253-1256 | Proxy | Auth | `master-data-service` |
| `/doctors` | POST | `doctors_create` | `api_gateway.py` | 1259-1262 | Proxy | Auth | `master-data-service` |
| `/doctors/<path:path>` | GET/POST/PUT/DELETE | `doctors_proxy` | `api_gateway.py` | 1265-1308 | Proxy | Auth | `master-data-service` |
| `/doctors/search` | GET | `doctors_search` | `api_gateway.py` | 1311-1314 | Proxy | Auth | `master-data-service` |

---

### 13. PROCEDURE MASTER DATA ROUTES
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/procedures` | GET | `procedures_list` | `api_gateway.py` | 1317-1320 | Proxy | Auth | `master-data-service` |
| `/procedures` | POST | `procedures_create` | `api_gateway.py` | 1323-1326 | Proxy | Auth | `master-data-service` |
| `/procedures/search` | GET | `procedures_search` | `api_gateway.py` | 1329-1332 | Proxy | Auth | `master-data-service` |
| `/procedures/<path:path>` | GET/POST/PUT/DELETE | `procedures_proxy` | `api_gateway.py` | 1335-1378 | Proxy | Auth | `master-data-service` |

---

### 14. PROCEDURE MAPPING ROUTES (External Systems & Mappings)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/external-systems` | GET | `external_systems_handler` | `api_gateway.py` | 1381-1412 | Complex 🟡 | High | `master-data-service` |
| `/external-systems/<system_id>` | GET/PUT/DELETE | `external_systems_proxy` | `api_gateway.py` | 1449-1483 | Complex 🔴 | High | `master-data-service` |
| `/procedure-mappings` | GET | `procedure_mappings_handler` | `api_gateway.py` | 1486-1517 | Proxy | Auth | `master-data-service` |
| `/procedure-mappings` | POST | `procedure_mappings_handler` | `api_gateway.py` | 1520-1551 | Proxy | Auth | `master-data-service` |
| `/procedure-mappings/bulk` | POST | `bulk_import_mappings` | `api_gateway.py` | 1554-1575 | Proxy | Auth | `master-data-service` |
| `/procedure-mappings/lookup` | POST | `lookup_procedure_mapping` | `api_gateway.py` | 1578-1599 | Proxy | Auth | `master-data-service` |
| `/procedure-mappings/stats` | GET | `get_mapping_statistics` | `api_gateway.py` | 1602-1623 | Proxy | Auth | `master-data-service` |
| `/procedure-mappings/<mapping_id>` | GET/PUT/DELETE | `procedure_mappings_proxy` | `api_gateway.py` | 1626-1659 | Proxy | Auth | `master-data-service` |

---

### 15. SETTINGS ROUTES
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/settings` | GET/POST | `settings_proxy` | `api_gateway.py` | 1662-1681 | Proxy | Auth | `master-data-service` |
| `/settings/<path:path>` | GET/PUT/DELETE | `settings_proxy` | `api_gateway.py` | 1684-1703 | Proxy | Auth | `master-data-service` |

---

### 16. DICOM ROUTER ROUTES
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/dicom-router/health` | GET | `dicom_router_health` | `api_gateway.py` | 1706-1709 | Proxy | Public | `dicom-router` |
| `/dicom-router` | GET | `dicom_router_root` | `api_gateway.py` | 1712-1715 | Proxy | Auth | `dicom-router` |
| `/dicom-router/<path:path>` | GET/POST/PUT/DELETE/OPTIONS | `dicom_router_proxy` | `api_gateway.py` | 1718-1746 | Proxy | Auth | `dicom-router` |

---

### 17. STORAGE / CAPACITY STATS
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/storage/stats` | GET | `storage_stats` | `api_gateway.py` | 1749-1830 | Custom Logic 🟡 | High | `orthanc` |

---

### 18. ORTHANC API DIRECT (UI Endpoints)
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/system` | GET | `orthanc_system` | `api_gateway.py` | 1833-1836 | Proxy | Public | `orthanc` |
| `/statistics` | GET | `orthanc_statistics` | `api_gateway.py` | 1839-1842 | Proxy | Public | `orthanc` |
| `/tools` | GET/POST | `orthanc_tools` | `api_gateway.py` | 1845-1848 | Proxy | Public | `orthanc` |
| `/instances` | GET | `orthanc_instances` | `api_gateway.py` | 1851-1854 | Proxy | Public | `orthanc` |
| `/studies` | GET | `orthanc_studies` | `api_gateway.py` | 1857-1860 | Proxy | Public | `orthanc` |
| `/series` | GET | `orthanc_series` | `api_gateway.py` | 1863-1866 | Proxy | Public | `orthanc` |
| `/patients` | GET | `patients_list` | `api_gateway.py` | 1869-1872 | Proxy | Auth | `master-data-service` |
| `/patients` | POST | `patients_create` | `api_gateway.py` | 1875-1878 | Proxy | Auth | `master-data-service` |
| `/changes` | GET | `orthanc_changes` | `api_gateway.py` | 1881-1884 | Proxy | Public | `orthanc` |
| `/peers` | GET | `orthanc_peers` | `api_gateway.py` | 1887-1890 | Proxy | Public | `orthanc` |
| `/modalities` | GET | `orthanc_modalities` | `api_gateway.py` | 1893-1896 | Proxy | Public | `orthanc` |
| `/plugins` | GET | `orthanc_plugins` | `api_gateway.py` | 1899-1902 | Proxy | Public | `orthanc` |
| `/jobs` | GET | `orthanc_jobs` | `api_gateway.py` | 1905-1908 | Proxy | Public | `orthanc` |

---

### 19. REPORTS SUMMARY
| Endpoint | Method | Function | File | Lines | Complexity | Security | Service |
|----------|--------|----------|------|-------|------------|----------|---------|
| `/reports/summary` | GET | `gateway_reports_summary` | `api_gateway.py` | 1911-1945 | Proxy | Public | `order-management` |

---

## 🔐 Authentication & Authorization System

### JWT Authentication
- **Header**: `Authorization: Bearer <token>`
- **Algorithm**: HS256
- **Secret**: Configurable via environment variable `JWT_SECRET`

### Permission System
- **Wildcard**: `*` = Admin wildcard (grants all permissions)
- **Category Wildcard**: `category:*` = Grants all permissions in category (e.g., `patient:*`)
- **Specific Permission**: `category:action` = Specific permission (e.g., `patient:read`)

### Role-Based Access Control (RBAC)
- **🔴 Superadmin**: Global access (`*` permission)
- **🟡 System Admin**: System management access
- **🟡 Developer**: Enhanced access for development
- **🟢 Regular Users**: Limited permissions based on assigned roles

---

## 🔒 Security Classification

### 🔴 High Security (Superadmin Only)
- `/auth/permissions` - Permission management
- `/auth/roles` - Role management
- `/auth/cache/*` - Cache management
- `/auth/audit/logs` - Audit logs
- `/external-systems` - External system management
- `/satusehat/token/generate` - SATUSEHAT token generation

### 🟡 Medium Security (Admin Level)
- User management endpoints
- Order management endpoints
- Procedure mapping endpoints
- Settings management

### 🟢 Low Security (Public/User Level)
- Health checks
- Static assets
- Public UI endpoints
- Basic authentication endpoints

---

## 🌐 Service URLs (Internal Network)

| Service | URL | Container | Purpose | Port |
|---------|-----|-----------|---------|------|
| **API Gateway** | `http://localhost:8888` | `api-gateway` | Main entry point | 8888 |
| Auth Service | `http://auth-service:5000` | `auth-service` | Authentication & RBAC | 5000 |
| MWL Service | `http://mwl-writer:8000` | `mwl-writer` | Modality Worklist | 8000 |
| MWL UI Service | `http://mwl-ui:8000` | `mwl-ui` | MWL Web Interface | 8000 |
| Orthanc Service | `http://orthanc-proxy:8043` | `orthanc-proxy` | Orthanc API Proxy | 8043 |
| Order Service | `http://order-management:8001` | `order-management` | Order Management | 8001 |
| Accession API | `http://accession-api:8180` | `accession-api` | Accession Number Management | 8180 |
| DICOM Router | `http://dicom-router:11112` | `dicom-router` | DICOM Routing | 11112 |
| SATUSEHAT Integrator | `http://satusehat-integrator:8081` | `satusehat-integrator` | SatuSehat Integration | 8081 |
| Master Data Service | `http://master-data-service:8002` | `master-data-service` | Master Data Management | 8002 |
| Orthanc Web UI | `http://orthanc:8042` | `orthanc` | Orthanc Web Interface | 8042 |

---

## 📊 Rate Limiting

### Global Limits
- **Default**: 1000 requests/hour; 60 requests/minute
- **Configurable**: Via environment variables:
  - `GATEWAY_GLOBAL_LIMITS`
  - `GATEWAY_LOGIN_LIMIT` (default: 10/minute)
  - `GATEWAY_REGISTER_LIMIT` (default: 20/hour)
  - `GATEWAY_VERIFY_LIMIT` (default: 120/minute)

---

## 🔧 Features

### Security Features
- ✅ JWT Authentication with RBAC
- ✅ Role-Based Access Control
- ✅ Permission Management with wildcard support
- ✅ User Management API
- ✅ Rate Limiting
- ✅ CORS Support
- ✅ IP Forwarding (X-Forwarded-For, X-Real-IP)
- ✅ User-Agent Forwarding

### Integration Features
- ✅ Single Entry Point Architecture
- ✅ Service Health Monitoring
- ✅ Automatic Token Management (SatuSehat)
- ✅ Proxy with Error Handling
- ✅ Request/Response Logging
- ✅ CORS Preflight Handling

### Performance Features
- ✅ Gunicorn WSGI Server
- ✅ Configurable Workers (4 workers)
- ✅ Timeout Handling (30 seconds)
- ✅ Connection Pooling
- ✅ Caching Support

---

## 🚀 Access Points

| Service | URL | Container | Description |
|---------|-----|-----------|-------------|
| **API Gateway** | `http://localhost:8888` | `api-gateway` | Main entry point |
| **Orthanc Web UI** | `http://localhost:8888/orthanc-ui/` | `orthanc` | Orthanc Web Interface |
| **MWL UI** | `http://localhost:8888/mwl-ui/` | `mwl-ui` | MWL Management Interface |
| **SSO Web UI** | `http://localhost:3000` | `sso-ui` | Authentication UI |
| **SIMRS Order UI** | `http://localhost:8095` | `simrs-order-ui` | Order Management UI |

---

## 📝 Environment Variables

### Configuration
- `JWT_SECRET`: JWT signing secret
- `JWT_ALGORITHM`: JWT algorithm (default: HS256)
- `ALLOW_ORTHANC_UI_PUBLIC`: Allow public Orthanc UI access
- `ADMIN_USERNAME`: Admin username for Orthanc UI
- `ADMIN_PASSWORD`: Admin password for Orthanc UI

### Service URLs
- `AUTH_SERVICE_URL`: Authentication service URL
- `ORTHANC_SERVICE_URL`: Orthanc proxy URL
- `SATUSEHAT_INTEGRATOR_URL`: SatuSehat integrator URL
- `MASTER_DATA_SERVICE_URL`: Master data service URL
- And other service URLs...

### Rate Limiting
- `GATEWAY_GLOBAL_LIMITS`: Global rate limits
- `GATEWAY_LOGIN_LIMIT`: Login rate limit
- `GATEWAY_REGISTER_LIMIT`: Registration rate limit
- `GATEWAY_VERIFY_LIMIT`: Token verification rate limit

---

## 🛡️ Security Notes

1. **All services** are accessible ONLY through this API gateway
2. **No direct port exposure** for internal services
3. **JWT tokens** required for all protected endpoints
4. **Role-based permissions** enforced for all operations
5. **Rate limiting** prevents abuse and brute force attacks
6. **CORS** properly configured for web applications
7. **IP forwarding** preserves client IP for logging and auditing

---

## 🔧 Troubleshooting

### Common Issues
1. **401 Unauthorized**: Check JWT token validity
2. **403 Forbidden**: Verify user permissions
3. **503 Service Unavailable**: Check backend service health
4. **Rate Limited**: Wait for rate limit reset or adjust limits

### Health Check
```bash
curl http://localhost:8888/health?detailed=true
```

### Service Status
```bash
curl http://localhost:8888/health
```

---

## 📚 Documentation

- **API Documentation**: Auto-generated from this index
- **RBAC Guide**: Refer to authentication section
- **Service Integration**: See service URLs table
- **Security Best Practices**: Follow security notes section

---

*Last Updated: API Gateway v2.2.0 - Production Ready with Enhanced RBAC Support*

## 🎯 AI Optimization Features

This optimized version includes:
1. **📊 Architecture Visualization**: Clear service relationship maps
2. **🔍 Enhanced Search**: Category and permission-based navigation
3. **💻 Code Metadata**: Function names, file locations, line numbers
4. **🔒 Security Classification**: Color-coded security levels
5. **⚡ Complexity Indicators**: Simple/Proxy vs Custom Logic
6. **📈 Service Dependencies**: Clear container and port mapping
7. **🔄 Data Flow Patterns**: Visual representation of request flows