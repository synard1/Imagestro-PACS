## 2026-04-23 - Feature: Tenant Storage Management
- Layers: Frontend
- Files: src/pages/admin/StorageProvidersPage.jsx
- Env vars: none
- Migrations: none
- Next: Final user UAT

## 2026-04-23 - Feature: Tenant Storage Refinement
- Layers: Frontend, Services
- Files: src/pages/admin/StorageProvidersPage.jsx, src/services/tenantService.js
- Env vars: none
- Migrations: none
- Next: Deploy to Staging

## 2026-04-24 - Feature: Study Lifecycle Management (DLM) & Analytics Modal Fix
- Layers: Frontend, Backend, Database
- Files: src/pages/admin/StorageProvidersPage.jsx, src/services/tenantService.js, app/models/study.py, app/api/studies.py, app/api/usage.py
- Env vars: none
- Migrations: 033_add_study_dlm_fields.sql
- Next: Archive execution endpoint

