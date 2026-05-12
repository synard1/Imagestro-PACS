# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Imagestro-PACS**, a full-stack DICOM/PACS (Picture Archiving and Communication System) medical imaging platform with integrated worklist management, order management, and SATUSEHAT (Indonesian healthcare) integration.

**Tech Stack:**
- **Frontend**: React 18 + Vite + TailwindCSS + React Router
- **Backend**: Multiple FastAPI microservices (Python) + Hono.js API Gateway (TypeScript)
- **Database**: PostgreSQL 17
- **DICOM**: Orthanc PACS server integration
- **Deployment**: Docker Compose orchestration
- **Testing**: Vitest (frontend), Python unittest (backend)

## Development Commands

### Frontend Development

```bash
# Start development server (port 5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run all tests
npm test

# Run tests once (CI mode)
npm run test:run

# Run baseline CI tests only
npm run test:ci

# Run tests with coverage
npm run test:coverage

# Clear Vite cache and restart dev server
npm run dev:fresh
```

### Backend Services

Backend services are located in `fullstack-orthanc-dicom/` and run via Docker Compose:

```bash
# Start all services
docker-compose up -d

# View logs for specific service
docker-compose logs -f <service-name>

# Restart a service
docker-compose restart <service-name>

# Stop all services
docker-compose down
```

**Key Backend Services:**
- `api-gateway-v2` - Main API gateway (Hono.js, TypeScript)
- `auth-service` - Authentication & RBAC (FastAPI)
- `master-data-service` - Master data management (doctors, procedures, mappings)
- `order-management` - Order/worklist management
- `pacs-service` - DICOM/PACS integration
- `satusehat-integrator` - Indonesian healthcare system integration
- `mwl-writer` - DICOM Modality Worklist writer

### API Gateway v2 (Hono.js)

```bash
cd fullstack-orthanc-dicom/api-gateway-v2

# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Deploy to Cloudflare Workers
npm run worker:deploy
```

### Python Services

Each Python service follows this pattern:

```bash
cd fullstack-orthanc-dicom/<service-name>

# Activate virtual environment (if exists)
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Run service (typically)
python app.py
# or
uvicorn app:app --reload
```

### Testing

```bash
# Run specific test file
npm test tests/unit/someTest.test.js

# Run tests matching pattern
npm test -- --grep "pattern"

# Run tests in watch mode
npm test -- --watch

# Python syntax check (CI)
npm run ci:python-syntax
```

## Architecture

### Frontend Structure (`src/`)

```
src/
├── pages/           # React page components (60+ pages)
├── components/      # Reusable React components
├── services/        # API clients and business logic (100+ services)
├── hooks/           # Custom React hooks
├── contexts/        # React Context providers
├── utils/           # Utility functions
├── config/          # Configuration files
├── data/            # Mock/seed data (JSON files)
├── styles/          # Global styles
└── workers/         # Service Workers (PWA)
```

**Key Service Files:**
- `authService.js` - Authentication & session management
- `orderService.js` - Order/worklist operations
- `dicomImageCacheService.js` - DICOM image caching
- `satusehatService.js` - SATUSEHAT integration
- `rbac.js` - Role-based access control
- `pwaManager.js` - Progressive Web App management

### Backend Structure (`fullstack-orthanc-dicom/`)

Each microservice follows FastAPI conventions:
```
<service-name>/
├── app.py or main.py    # FastAPI application entry point
├── requirements.txt     # Python dependencies
├── Dockerfile          # Container definition
├── .env.template       # Environment variable template
└── docs/              # Service-specific documentation
```

### Database

- **Primary DB**: PostgreSQL (shared cluster on port 5433)
- **Connection**: Services connect via `POSTGRES_HOST` environment variable
- **Migrations**: Located in `migrations/` directory
- **Init Scripts**: `postgres-init/` for database initialization

### API Gateway Architecture

The system uses a **dual gateway approach**:

1. **API Gateway v2** (Hono.js) - Modern TypeScript gateway
   - Path: `fullstack-orthanc-dicom/api-gateway-v2/`
   - Port: 8003 (default)
   - Routes requests to backend microservices
   - JWT authentication middleware
   - Can deploy to Cloudflare Workers

2. **Legacy API Gateway** (FastAPI) - Being phased out
   - Path: `fullstack-orthanc-dicom/api-gateway/`

### Frontend-Backend Communication

- **Development**: Vite proxy forwards `/api`, `/backend-api`, `/wado-rs` to backend
- **Production**: Direct API calls to `VITE_MAIN_API_BACKEND_URL`
- **CORS**: Handled by backend services

## Environment Configuration

1. Copy `.env.example` to `.env`
2. Update backend URLs:
   ```
   VITE_MAIN_API_BACKEND_URL=http://localhost:8003
   VITE_MAIN_PACS_API_BACKEND_URL=http://localhost:8888
   ```
3. Configure feature flags as needed (DICOM viewer, SATUSEHAT, etc.)

**Critical Environment Variables:**
- `VITE_MAIN_API_BACKEND_URL` - Main API gateway URL
- `VITE_ENABLE_LOCAL_AUTH` - Enable mock auth for development
- `JWT_SECRET` - Backend JWT signing key (in docker-compose.yml)
- `POSTGRES_HOST` - Database host (external shared cluster)

## Key Features & Modules

### Authentication & RBAC
- JWT-based authentication with refresh tokens
- Role-based access control (RBAC) with permissions
- User impersonation feature for admins
- Session management with configurable timeout

### DICOM Integration
- Cornerstone.js for DICOM image viewing
- DICOM file upload and parsing
- WADO-RS integration with Orthanc
- DICOM tag extraction and display
- Image caching for performance

### Order Management
- Create, update, delete orders
- Worklist generation for modalities
- Order status tracking and auto-sync
- Integration with DICOM MWL (Modality Worklist)

### SATUSEHAT Integration
- Indonesian healthcare system integration
- Encounter, ServiceRequest, ImagingStudy resources
- Sync status monitoring
- Sandbox/production environment switching

### PWA (Progressive Web App)
- Offline mode support
- Service Worker caching strategies
- Install prompts and update notifications
- Cache manager UI for debugging
- Configurable via environment variables

## Important Patterns & Conventions

### Security
- **XSS Prevention**: All `innerHTML` usage must use `DOMPurify.sanitize()`
- **Secrets**: SATUSEHAT credentials are encrypted in storage
- **Logging**: Console logs suppressed in production (see `src/config/logging.js`)
- **CSRF**: CSRF token header configured via `VITE_CSRF_HEADER`

### API Service Pattern
Services in `src/services/` follow this pattern:
```javascript
import api from './api.js'

export const someService = {
  async getItems() {
    const response = await api.get('/endpoint')
    return response.data
  },
  
  async createItem(data) {
    const response = await api.post('/endpoint', data)
    return response.data
  }
}
```

### Error Handling
- Frontend: Use `try/catch` with user-friendly error messages
- Backend: FastAPI exception handlers return structured JSON errors
- Integration errors: Special handlers in `khanzaErrorHandler.js`, `integrationErrorHandler.js`

### State Management
- React Context for global state (auth, settings, theme)
- Local state with `useState` for component-specific data
- No Redux or external state management library

## Docker Compose Services

Key services defined in `docker-compose.yml`:

- **auth-service** - Port 5000 (internal only)
- **master-data-service** - Master data APIs
- **order-management** - Order/worklist APIs
- **pacs-service** - DICOM/PACS integration
- **api-gateway-v2** - Port 8003 (main entry point)
- **orthanc** - DICOM server (if enabled)

**Note**: PostgreSQL is disabled in docker-compose.yml - uses external shared cluster.

## Testing Strategy

### Frontend Tests (Vitest)
- **Unit tests**: `tests/unit/*.test.js`
- **Component tests**: `tests/**/*.test.jsx` (jsdom environment)
- **Property tests**: `tests/**/*.property.test.js` (fast-check)
- **Setup**: `tests/setup.js` for global test configuration

### Backend Tests
- Python unittest or pytest per service
- Run via `python -m pytest` in service directory

### CI Pipeline
```bash
npm run ci  # Runs frontend build + baseline tests + Python syntax check
```

## Common Issues & Solutions

### Build Issues
- **Circular dependency errors**: Minification is disabled in `vite.config.js` to avoid TDZ errors
- **Module resolution**: Cornerstone.js uses UMD builds with explicit aliases

### Cache Issues
- Clear Vite cache: `npm run dev:fresh`
- Clear browser cache: Use Cache Manager UI (bottom-right in dev mode)
- Force service worker update: `npm run force-sw-update`

### Database Connection
- Ensure `POSTGRES_HOST` points to external cluster (not localhost)
- Default port: 5433 (not 5432)
- Check `docker-compose.yml` for connection details

### CORS Errors
- Development: Vite proxy should handle CORS
- Production: Backend must set proper CORS headers
- Check `VITE_ENABLE_CORS_PROXY` setting

## Documentation

Extensive documentation in `fullstack-orthanc-dicom/docs/`:
- `README.md` - Main documentation index
- `QUICKSTART.md` - Quick start guide
- Service-specific docs in subdirectories (e.g., `docs/order-management/`)
- API documentation per service

Additional docs:
- `@docs/` - Implementation and refactoring logs
- `docs/cloudflare-env-vars.md` - Cloudflare Pages deployment

## Deployment

### Cloudflare Pages (Frontend)
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: See `docs/cloudflare-env-vars.md`

### Docker Deployment (Backend)
```bash
docker-compose up -d --build
```

### Production Checklist
- [ ] Set `VITE_APP_ENV=production`
- [ ] Set `VITE_ENABLE_LOCAL_AUTH=false`
- [ ] Configure real `JWT_SECRET`
- [ ] Set `VITE_ENABLE_CONSOLE_LOGS=false`
- [ ] Update `VITE_MAIN_API_BACKEND_URL` to production URL
- [ ] Configure SATUSEHAT production credentials
- [ ] Set `VITE_PWA_FORCE_DISABLED=false` (if using PWA)

## Git Workflow

Recent commits show focus on:
- Security fixes (XSS prevention, encryption)
- Logging improvements (production log suppression)
- Documentation (Cloudflare environment variables)
- Code organization (backup cleanup)

**Branch**: `main` (primary development branch)
