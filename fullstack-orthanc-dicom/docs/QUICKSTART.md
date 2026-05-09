# Quick Start Guide

## 1. Start Services

```bash
docker compose -f docker-compose-secured.yml up -d
```

## 2. Check Services Status

```bash
docker compose ps
```

All services should be "Up" and healthy.

## 3. Verify Health

```bash
# Auth Service
curl http://localhost:5000/health

# API Gateway
curl http://localhost:8888/health
```

## 4. Login as Admin

```bash
# Get credentials from CREDENTIALS.txt
cat CREDENTIALS.txt

# Login
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "YOUR_ADMIN_PASSWORD_FROM_CREDENTIALS"
  }'
```

Save the returned `access_token`.

## 5. Create First User

```bash
curl -X POST http://localhost:8888/auth/register \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "doctor1",
    "email": "doctor1@hospital.com",
    "password": "SecurePass123",
    "full_name": "Dr. John Smith",
    "role": "DOCTOR"
  }'
```

## 6. Create Worklist (as Receptionist)

```bash
curl -X POST http://localhost:8888/worklist/create \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_name": "BUDI^SANTOSO",
    "patient_id": "3201012345670001",
    "accession_number": "ACC20251020001",
    "modality": "MR",
    "procedure_description": "MRI Kepala"
  }'
```

## 7. Access Orthanc (through proxy)

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  http://localhost:8888/orthanc/system
```

## Common Commands

### View Logs
```bash
docker compose logs -f auth-service
docker compose logs -f api-gateway
```

### Stop Services
```bash
docker compose down
```

### Restart Service
```bash
docker compose restart auth-service
```

### Database Access
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db
```

## Security Checklist

- [ ] Changed admin password
- [ ] Created additional users
- [ ] Tested role-based permissions
- [ ] Reviewed audit logs
- [ ] Configured backup strategy
- [ ] Set up monitoring
- [ ] Enabled HTTPS (production)
- [ ] Configured firewall rules

## Troubleshooting

### Check all services are running
```bash
docker compose ps
```

### Check database connection
```bash
docker exec dicom-postgres-secured pg_isready -U dicom
```

### Reset admin password
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db \
  -c "UPDATE users SET password_hash = '\$2b\$12\$...' WHERE username='admin'"
```

(Use bcrypt to generate new hash)

For detailed documentation, see Security-Implementation-Guide.pdf
