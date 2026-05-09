# PACS Service

FastAPI-based PACS backend service for medical image management.

## Features

- ✅ DICOM Study/Series/Instance management
- ✅ Integration with Orthanc DICOM server
- ✅ Radiology reporting
- ✅ Storage management
- ✅ Order management integration
- ✅ Role-based access control (SUPERADMIN/DEVELOPER only)
- ✅ RESTful API with OpenAPI documentation
- ✅ PostgreSQL database
- ✅ Docker containerization

## Quick Start

### Prerequisites

- Docker and Docker Compose
- PostgreSQL database (existing)
- Orthanc DICOM server

### Setup

1. **Copy environment variables:**
   ```bash
   cp ../.env.pacs.example ../.env.pacs
   # Edit .env.pacs and fill in the values
   ```

2. **Build and start services:**
   ```bash
   cd ..
   docker-compose -f docker-compose.pacs.yml up -d
   ```

3. **Check service status:**
   ```bash
   docker-compose -f docker-compose.pacs.yml ps
   ```

4. **View logs:**
   ```bash
   docker-compose -f docker-compose.pacs.yml logs -f pacs-service
   ```

5. **Access API documentation:**
   - Swagger UI: http://localhost:8003/pacs/docs
   - ReDoc: http://localhost:8003/pacs/redoc

### Development

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run locally:**
   ```bash
   export DATABASE_URL="postgresql://user:pass@localhost:5432/db"
   export ORTHANC_URL="http://localhost:8042"
   export JWT_SECRET="your-secret-key"
   export ORTHANC_PASSWORD="orthanc-password"
   
   python -m app.main
   ```

3. **Run tests:**
   ```bash
   pytest tests/
   ```

## API Endpoints

### Health Check
- `GET /pacs/health` - Service health check

### Studies
- `GET /pacs/studies` - List studies (paginated)
- `GET /pacs/studies/{study_uid}` - Get study details
- `DELETE /pacs/studies/{study_uid}` - Delete study

### Reports
- `GET /pacs/reports` - List reports
- `POST /pacs/studies/{study_uid}/reports` - Create report
- `GET /pacs/reports/{report_id}` - Get report
- `PUT /pacs/reports/{report_id}` - Update report
- `DELETE /pacs/reports/{report_id}` - Delete report

### Storage
- `GET /pacs/storage/stats` - Get storage statistics
- `POST /pacs/storage/cleanup` - Cleanup old studies

### Integration
- `GET /pacs/orders/{order_id}/studies` - Get studies for order
- `POST /pacs/studies/{study_uid}/link-order` - Link study to order

## Authentication

All endpoints require JWT authentication with SUPERADMIN or DEVELOPER role.

**Request Header:**
```
Authorization: Bearer <your_jwt_token>
```

**Token Payload:**
```json
{
  "sub": "user_id",
  "username": "admin",
  "role": "superadmin",
  "permissions": ["*"]
}
```

## Database Schema

- `pacs_studies` - Study-level metadata
- `pacs_series` - Series-level metadata
- `pacs_instances` - Instance-level metadata
- `pacs_reports` - Radiology reports
- `pacs_storage_stats` - Storage statistics
- `pacs_audit_log` - Audit trail

## Configuration

See `.env.pacs.example` for all configuration options.

**Key Settings:**
- `DATABASE_URL` - PostgreSQL connection string
- `ORTHANC_URL` - Orthanc server URL
- `JWT_SECRET` - JWT secret key
- `ALLOWED_ROLES` - Roles allowed to access PACS (default: superadmin,developer)
- `MAX_STORAGE_GB` - Maximum storage size
- `RETENTION_DAYS` - Study retention period

## Monitoring

- Health check: `GET /pacs/health`
- Metrics: `GET /pacs/metrics` (Prometheus format)
- Logs: `/var/log/pacs/`

## Troubleshooting

### Database connection failed
```bash
# Check database is running
docker ps | grep postgres

# Check connection
docker exec pacs-service python -c "from app.database import check_db_connection; print(check_db_connection())"
```

### Orthanc connection failed
```bash
# Check Orthanc is running
curl http://localhost:8042/system

# Check from container
docker exec pacs-service curl http://orthanc:8042/system
```

### Permission denied
- Ensure user has SUPERADMIN or DEVELOPER role
- Check JWT token is valid
- Verify `ALLOWED_ROLES` in configuration

## Documentation

For complete documentation, see **[/docs](../docs/README.md)**:
- **[Quick Start Guides](../docs/quick-start/)** - FHIR, HL7, Audit Logging
- **[API Reference](../docs/api-reference/)** - Complete API documentation
- **[Integration Guides](../docs/integration/)** - FHIR R4, HL7 v2.x, S3, SATUSEHAT
- **[Architecture](../docs/architecture/)** - System architecture and design

## License

Proprietary - Internal Use Only
