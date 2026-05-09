# MWL UI Service - Modality Worklist Management Interface

## Overview

MWL UI adalah antarmuka web modern untuk mengelola Modality Worklist (MWL) dalam sistem DICOM. Service ini menyediakan dashboard yang user-friendly untuk melihat, memfilter, dan mengelola item worklist yang akan diproses oleh modalitas medis.

## Features

### 🎯 Core Features
- **Dashboard Statistik**: Overview real-time dari status worklist
- **Manajemen Worklist**: View, filter, dan update item worklist
- **Pencarian Advanced**: Filter berdasarkan patient ID, nama, modalitas, tanggal, dll.
- **Update Status**: Ubah status item worklist (SCHEDULED → IN_PROGRESS → COMPLETED)
- **Export Data**: Export worklist ke format CSV
- **Responsive Design**: Optimized untuk desktop, tablet, dan mobile

### 🔧 Technical Features
- **FastAPI Backend**: High-performance Python web framework
- **PostgreSQL Integration**: Direct database access untuk performa optimal
- **JWT Authentication**: Secure authentication melalui API Gateway
- **Health Monitoring**: Built-in health checks dan monitoring
- **Docker Ready**: Containerized deployment dengan optimized Dockerfile

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser/UI    │◄──►│   API Gateway   │◄──►│   MWL UI API    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  Auth Service   │    │   PostgreSQL    │
                       └─────────────────┘    └─────────────────┘
```

## Installation & Deployment

### Prerequisites
- Docker & Docker Compose
- PostgreSQL database (sudah dikonfigurasi dalam docker-compose.yml)
- API Gateway service (sudah terintegrasi)

### Quick Start

1. **Clone dan Navigate ke Project Directory**
   ```bash
   cd /path/to/fullstack-orthanc-dicom
   ```

2. **Build dan Start Services**
   ```bash
   # Build semua services termasuk MWL UI
   docker-compose build mwl-ui
   
   # Start semua services
   docker-compose up -d
   
   # Atau start hanya MWL UI dan dependencies
   docker-compose up -d postgres api-gateway mwl-writer mwl-ui
   ```

3. **Verify Deployment**
   ```bash
   # Check service status
   docker-compose ps mwl-ui
   
   # Check logs
   docker-compose logs -f mwl-ui
   
   # Test health endpoint
   curl http://localhost:8888/mwl-ui/health
   ```

4. **Access MWL UI**
   - **Direct Access**: http://localhost:8096
   - **Via API Gateway**: http://localhost:8888/mwl-ui/

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `postgres` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `worklist_db` | Database name |
| `POSTGRES_USER` | `dicom` | Database user |
| `POSTGRES_PASSWORD` | `dicom123` | Database password |
| `GATEWAY_BASE` | `http://api-gateway:8888` | API Gateway URL |
| `JWT_SECRET` | `change-this-secret-key-in-production` | JWT secret key |
| `LOG_LEVEL` | `INFO` | Logging level |
| `SERVICE_NAME` | `MWL UI` | Service name |
| `SERVICE_VERSION` | `1.0.0` | Service version |

### Database Schema

MWL UI menggunakan tabel `worklist_items` dengan struktur:

```sql
CREATE TABLE worklist_items (
    accession_number VARCHAR(64) PRIMARY KEY,
    patient_id VARCHAR(64),
    patient_name VARCHAR(255),
    patient_birth_date DATE,
    patient_sex CHAR(1),
    study_instance_uid VARCHAR(128),
    study_description TEXT,
    modality VARCHAR(16),
    scheduled_procedure_step_start_date DATE,
    scheduled_procedure_step_start_time TIME,
    scheduled_station_aet VARCHAR(16),
    scheduled_performing_physician VARCHAR(255),
    requested_procedure_description TEXT,
    study_status VARCHAR(32) DEFAULT 'SCHEDULED',
    performed_procedure_step_start_date DATE,
    performed_procedure_step_start_time TIME,
    performed_procedure_step_end_date DATE,
    performed_procedure_step_end_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Public Endpoints (No Authentication)
- `GET /` - Main UI page
- `GET /health` - Health check
- `GET /config` - Frontend configuration

### Protected Endpoints (Requires JWT)
- `GET /api/worklist` - Get worklist items with filtering
- `GET /api/worklist/{accession_number}` - Get specific worklist item
- `PUT /api/worklist/{accession_number}` - Update worklist item
- `GET /api/statistics` - Get worklist statistics
- `GET /api/gateway/{path}` - Proxy to API Gateway

### API Usage Examples

```bash
# Get worklist with filters
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     "http://localhost:8888/mwl-ui/api/worklist?patient_name=John&modality=CT"

# Update worklist item status
curl -X PUT \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"study_status": "IN_PROGRESS"}' \
     "http://localhost:8888/mwl-ui/api/worklist/ACC123456"

# Get statistics
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     "http://localhost:8888/mwl-ui/api/statistics"
```

## User Interface

### Dashboard Overview
- **Statistics Cards**: Total, Scheduled, In Progress, Completed items
- **Quick Actions**: Refresh, Export, Show Statistics
- **Filter Panel**: Advanced filtering options
- **Worklist Table**: Paginated table dengan sorting

### Filter Options
- **Patient ID**: Exact atau partial match
- **Patient Name**: Case-insensitive search
- **Accession Number**: Exact match
- **Modality**: Dropdown selection (CT, MR, XR, US, dll.)
- **Date Range**: From/To date filtering
- **Status**: SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED
- **Station AET**: DICOM Application Entity Title

### Actions
- **View**: Lihat detail lengkap worklist item
- **Edit**: Update status dan performed procedure steps
- **Export**: Download filtered data sebagai CSV

## Integration

### API Gateway Integration

MWL UI terintegrasi dengan API Gateway melalui routing berikut:

```python
# API Gateway routes untuk MWL UI
/mwl-ui/                    # Main UI page
/mwl-ui/health             # Health check
/mwl-ui/config             # Configuration
/mwl-ui/api/*              # API endpoints (authenticated)
/mwl-ui/*                  # Static files
```

### Authentication Flow

1. User mengakses MWL UI melalui API Gateway
2. Frontend meminta token dari Auth Service
3. Token disimpan di localStorage
4. Setiap API call menyertakan token di Authorization header
5. API Gateway memvalidasi token sebelum meneruskan ke MWL UI

### Database Integration

MWL UI terhubung langsung ke PostgreSQL database yang sama dengan:
- **MWL Writer Service**: Untuk data worklist
- **Auth Service**: Untuk user management
- **Order Management**: Untuk order tracking

## Monitoring & Logging

### Health Checks
```bash
# Container health check
docker-compose ps mwl-ui

# Application health check
curl http://localhost:8888/mwl-ui/health
```

### Logs
```bash
# View real-time logs
docker-compose logs -f mwl-ui

# View logs dengan timestamp
docker-compose logs -t mwl-ui

# View last 100 lines
docker-compose logs --tail=100 mwl-ui
```

### Metrics
- **Response Time**: Tracked via FastAPI middleware
- **Database Connections**: PostgreSQL connection pooling
- **Memory Usage**: Container resource monitoring
- **Error Rates**: Application error logging

## Security

### Authentication
- JWT-based authentication melalui API Gateway
- Token validation pada setiap protected endpoint
- Automatic token refresh handling

### Authorization
- Role-based access control (RBAC)
- Permission checking: `worklist:read`, `worklist:write`
- Admin permissions untuk advanced operations

### Data Protection
- HTTPS enforcement (production)
- SQL injection protection via parameterized queries
- XSS protection via content security policy
- CORS configuration untuk allowed origins

## Performance Optimization

### Backend Optimizations
- **Connection Pooling**: PostgreSQL connection reuse
- **Query Optimization**: Indexed database queries
- **Caching**: Response caching untuk static data
- **Pagination**: Efficient data loading

### Frontend Optimizations
- **Lazy Loading**: Load data on demand
- **Debounced Search**: Reduce API calls
- **Local Caching**: Cache frequently accessed data
- **Responsive Design**: Optimized untuk semua devices

## Troubleshooting

### Common Issues

1. **Service Won't Start**
   ```bash
   # Check dependencies
   docker-compose ps postgres api-gateway
   
   # Check logs
   docker-compose logs mwl-ui
   
   # Rebuild container
   docker-compose build --no-cache mwl-ui
   ```

2. **Database Connection Error**
   ```bash
   # Verify PostgreSQL is running
   docker-compose ps postgres
   
   # Check database credentials
   docker-compose exec postgres psql -U dicom -d worklist_db -c "\dt"
   
   # Test connection
   docker-compose exec mwl-ui python -c "import psycopg2; print('DB OK')"
   ```

3. **Authentication Issues**
   ```bash
   # Check API Gateway
   curl http://localhost:8888/health
   
   # Verify JWT secret consistency
   docker-compose exec api-gateway env | grep JWT_SECRET
   docker-compose exec mwl-ui env | grep JWT_SECRET
   ```

4. **UI Not Loading**
   ```bash
   # Check static files
   docker-compose exec mwl-ui ls -la /app/public/
   
   # Test direct access
   curl http://localhost:8096/
   
   # Check API Gateway routing
   curl http://localhost:8888/mwl-ui/
   ```

### Debug Mode

Enable debug mode untuk development:

```yaml
# docker-compose.override.yml
services:
  mwl-ui:
    environment:
      LOG_LEVEL: DEBUG
    command: uvicorn app:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./mwl-ui:/app
```

## Development

### Local Development Setup

1. **Install Dependencies**
   ```bash
   cd mwl-ui
   pip install -r requirements.txt
   ```

2. **Set Environment Variables**
   ```bash
   export POSTGRES_HOST=localhost
   export POSTGRES_PORT=5432
   export POSTGRES_DB=worklist_db
   export POSTGRES_USER=dicom
   export POSTGRES_PASSWORD=dicom123
   ```

3. **Run Development Server**
   ```bash
   uvicorn app:app --host 0.0.0.0 --port 8000 --reload
   ```

### Code Structure

```
mwl-ui/
├── app.py              # FastAPI application
├── requirements.txt    # Python dependencies
├── Dockerfile         # Container configuration
├── public/            # Frontend files
│   ├── index.html     # Main UI page
│   └── app.js         # Frontend JavaScript
└── README.md          # Documentation
```

### Adding New Features

1. **Backend API**: Add endpoints di `app.py`
2. **Frontend UI**: Update `public/index.html` dan `public/app.js`
3. **Database**: Add migrations jika diperlukan
4. **Tests**: Add unit tests untuk new functionality
5. **Documentation**: Update README.md

## Support

### Getting Help
- **Documentation**: Baca README.md lengkap
- **Logs**: Check container logs untuk error details
- **Health Checks**: Verify service status
- **Community**: Konsultasi dengan development team

### Reporting Issues
1. Describe the problem clearly
2. Include relevant logs
3. Provide steps to reproduce
4. Specify environment details

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Maintainer**: SIMRS Development Team