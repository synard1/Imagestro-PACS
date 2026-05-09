# MWL / mini-PACS UI (React + Vite)

Sample frontend for Radiology **Modality Worklist** & mini-PACS configuration.
**Dummy data only** (no backend). Designed to be later integrated via REST API.

## Install & Run
```bash
# 1) extract zip
# 2) inside the folder:
npm install

# 3) Setup environment configuration (optional)
cp .env.example .env
# Edit .env to configure authentication mode

npm run dev    # http://localhost:5173
npm run build  # build assets
npm run preview
```

## Environment Configuration

Create a `.env` file in the root directory (copy from `.env.example`):

```env
# Authentication Configuration
VITE_ENABLE_LOCAL_AUTH=true  # Set to 'false' to disable local/mock auth

# Backend API Configuration
VITE_API_BASE_URL=http://localhost:8000
VITE_API_TIMEOUT_MS=6000
VITE_HEALTH_INTERVAL_MS=15000
```

### Authentication Modes

**Local Authentication (Mock Mode)**
- Set `VITE_ENABLE_LOCAL_AUTH=true` in `.env`
- Uses mock data from `src/data/users.json`
- Allows switching between Local and Backend auth via toggle button
- Good for development and testing

**Backend Authentication Only**
- Set `VITE_ENABLE_LOCAL_AUTH=false` in `.env`
- Forces backend authentication only
- Toggle button will be hidden
- Production-ready mode

**Note:** After changing `.env` file, restart the dev server (`npm run dev`)

## Pages
- Dashboard (quick metrics)
- Worklist (Scheduled Procedure Steps)
- Orders
- Patients
- Modalities (CT/MR/CR/US...)
- DICOM Nodes (PACS / Router / Worklist)
- Users & Roles (RBAC mock)
- Audit Logs
- Settings

## Features

### Error Handling
- User-friendly error messages from backend responses
- Automatic parsing of JSON error responses
- Fallback messages based on HTTP status codes
- Network and timeout error handling
- See [ERROR_HANDLING.md](docs/ERROR_HANDLING.md) for details

### Authentication
- Local authentication (mock mode) for development
- Backend authentication support
- Environment-based configuration
- Token-based auth with refresh support

### Security
- Lazy loading of protected routes to prevent data leakage
- RBAC (Role-Based Access Control)
- Protected routes with permission checking
- Secure token storage

## Architecture & Simulation
- **[Imagestro Simulation Architecture](../guides/IMAGESTRO_SIMULATION_ARCHITECTURE.md)**: High-fidelity demonstration of clinical and regulatory workflows.

## Notes
- Styling: TailwindCSS
- Routing: React Router v6
- Dummy data in `src/data/*.json`
- Mock API in `src/services/api.js`
- Simple RBAC helper in `src/services/rbac.js`
```



---

## Backend API Toggle
- Buka **Settings** → **Backend API**.
- Centang **Enable backend data source** dan isi **Base URL** (mis. `http://localhost:8000`).
- UI akan mencoba GET ke endpoint berikut (disarankan untuk backend):  
  - `/api/dashboard`, `/api/patients`, `/api/orders`, `/api/worklist`, `/api/procedures`, `/api/modalities`, `/api/dicom-nodes`, `/api/users`, `/api/audit-logs`, `/api/ui-settings`
- Jika backend gagal diakses (timeout / network / HTTP error), akan muncul **toast notifikasi** dan UI otomatis **fallback ke dummy data** agar tetap dipakai.
