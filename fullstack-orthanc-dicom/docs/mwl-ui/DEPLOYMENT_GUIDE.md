# MWL UI Service - Deployment Guide & Testing Procedures

## 🚀 Pre-Deployment Checklist

### System Requirements
- [ ] Docker Engine 20.10+ installed
- [ ] Docker Compose 2.0+ installed
- [ ] Minimum 4GB RAM available
- [ ] Minimum 10GB disk space available
- [ ] Network ports 8096, 8888 available
- [ ] PostgreSQL database accessible

### Environment Verification
- [ ] All environment variables configured
- [ ] JWT secrets consistent across services
- [ ] Database credentials valid
- [ ] Network connectivity verified
- [ ] SSL certificates ready (production)

## 📋 Deployment Steps

### Step 1: Environment Preparation

1. **Navigate to Project Directory**
   ```bash
   cd /path/to/fullstack-orthanc-dicom
   ```

2. **Verify Docker Compose Configuration**
   ```bash
   # Validate docker-compose.yml syntax
   docker-compose config
   
   # Check for any configuration errors
   docker-compose config --quiet
   ```

3. **Pull Required Images**
   ```bash
   # Pull base images
   docker-compose pull postgres
   
   # Verify images
   docker images | grep -E "(postgres|python)"
   ```

### Step 2: Database Setup

1. **Start PostgreSQL Service**
   ```bash
   docker-compose up -d postgres
   ```

2. **Verify Database Connection**
   ```bash
   # Wait for PostgreSQL to be ready
   docker-compose exec postgres pg_isready -U dicom
   
   # Test database access
   docker-compose exec postgres psql -U dicom -d worklist_db -c "SELECT version();"
   ```

3. **Verify Worklist Table**
   ```bash
   docker-compose exec postgres psql -U dicom -d worklist_db -c "\dt worklist_items"
   ```

### Step 3: Core Services Deployment

1. **Start Auth Service**
   ```bash
   docker-compose up -d auth-service
   
   # Verify auth service
   curl -f http://localhost:8888/auth/health || echo "Auth service not ready"
   ```

2. **Start MWL Writer Service**
   ```bash
   docker-compose up -d mwl-writer
   
   # Verify MWL writer
   docker-compose ps mwl-writer
   ```

3. **Start API Gateway**
   ```bash
   docker-compose up -d api-gateway
   
   # Verify API Gateway
   curl -f http://localhost:8888/health || echo "API Gateway not ready"
   ```

### Step 4: MWL UI Deployment

1. **Build MWL UI Service**
   ```bash
   # Build the container
   docker-compose build mwl-ui
   
   # Verify build success
   docker images | grep mwl-ui
   ```

2. **Start MWL UI Service**
   ```bash
   docker-compose up -d mwl-ui
   
   # Monitor startup logs
   docker-compose logs -f mwl-ui
   ```

3. **Verify Service Health**
   ```bash
   # Wait for service to be ready
   sleep 30
   
   # Check container status
   docker-compose ps mwl-ui
   
   # Test health endpoint
   curl -f http://localhost:8096/health
   curl -f http://localhost:8888/mwl-ui/health
   ```

## 🧪 Testing Procedures

### Automated Health Checks

Create a health check script:

```bash
#!/bin/bash
# health_check.sh

echo "=== MWL UI Service Health Check ==="

# Check container status
echo "1. Container Status:"
docker-compose ps mwl-ui | grep -q "Up" && echo "✅ Container running" || echo "❌ Container not running"

# Check health endpoint
echo "2. Health Endpoint:"
curl -s -f http://localhost:8096/health > /dev/null && echo "✅ Direct health check passed" || echo "❌ Direct health check failed"

# Check via API Gateway
echo "3. API Gateway Integration:"
curl -s -f http://localhost:8888/mwl-ui/health > /dev/null && echo "✅ Gateway health check passed" || echo "❌ Gateway health check failed"

# Check database connectivity
echo "4. Database Connectivity:"
docker-compose exec -T mwl-ui python -c "
import psycopg2
import os
try:
    conn = psycopg2.connect(
        host=os.getenv('POSTGRES_HOST', 'postgres'),
        port=os.getenv('POSTGRES_PORT', '5432'),
        database=os.getenv('POSTGRES_DB', 'worklist_db'),
        user=os.getenv('POSTGRES_USER', 'dicom'),
        password=os.getenv('POSTGRES_PASSWORD', 'dicom123')
    )
    conn.close()
    print('✅ Database connection successful')
except Exception as e:
    print(f'❌ Database connection failed: {e}')
"

# Check UI accessibility
echo "5. UI Accessibility:"
curl -s -f http://localhost:8888/mwl-ui/ | grep -q "MWL Management" && echo "✅ UI accessible" || echo "❌ UI not accessible"

echo "=== Health Check Complete ==="
```

### Manual Testing Checklist

#### 🔍 Basic Functionality Tests

1. **UI Access Test**
   - [ ] Open http://localhost:8888/mwl-ui/ in browser
   - [ ] Verify page loads without errors
   - [ ] Check responsive design on different screen sizes
   - [ ] Verify all UI components render correctly

2. **Authentication Test**
   - [ ] Login functionality works
   - [ ] JWT token is stored correctly
   - [ ] Protected endpoints require authentication
   - [ ] Token refresh works automatically

3. **Worklist Display Test**
   - [ ] Worklist items load correctly
   - [ ] Pagination works properly
   - [ ] Sorting functions correctly
   - [ ] Statistics display accurate data

4. **Filter Functionality Test**
   - [ ] Patient name filter works
   - [ ] Patient ID filter works
   - [ ] Modality filter works
   - [ ] Date range filter works
   - [ ] Status filter works
   - [ ] Combined filters work correctly

5. **CRUD Operations Test**
   - [ ] View worklist item details
   - [ ] Update worklist item status
   - [ ] Changes persist in database
   - [ ] Real-time updates work

6. **Export Functionality Test**
   - [ ] CSV export works
   - [ ] Exported data is accurate
   - [ ] File downloads correctly

#### 🔧 Technical Tests

1. **Performance Test**
   ```bash
   # Load test with curl
   for i in {1..10}; do
     time curl -s http://localhost:8888/mwl-ui/api/worklist > /dev/null
   done
   ```

2. **Memory Usage Test**
   ```bash
   # Monitor memory usage
   docker stats mwl-ui --no-stream
   ```

3. **Log Analysis Test**
   ```bash
   # Check for errors in logs
   docker-compose logs mwl-ui | grep -i error
   docker-compose logs mwl-ui | grep -i warning
   ```

4. **Database Connection Pool Test**
   ```bash
   # Test multiple concurrent connections
   for i in {1..5}; do
     curl -s http://localhost:8888/mwl-ui/api/statistics &
   done
   wait
   ```

### Load Testing

Create a simple load test script:

```bash
#!/bin/bash
# load_test.sh

echo "=== MWL UI Load Test ==="

# Test concurrent requests
echo "Testing concurrent API requests..."
for i in {1..20}; do
  curl -s -w "%{http_code} %{time_total}s\n" \
       -H "Authorization: Bearer YOUR_TEST_TOKEN" \
       http://localhost:8888/mwl-ui/api/worklist > /dev/null &
done
wait

# Test UI load
echo "Testing UI load..."
for i in {1..10}; do
  curl -s -w "%{http_code} %{time_total}s\n" \
       http://localhost:8888/mwl-ui/ > /dev/null &
done
wait

echo "=== Load Test Complete ==="
```

## 🔍 Verification Checklist

### Pre-Production Verification

#### Infrastructure Checks
- [ ] All containers running and healthy
- [ ] Resource limits configured appropriately
- [ ] Network connectivity between services verified
- [ ] Volume mounts working correctly
- [ ] Log rotation configured

#### Security Checks
- [ ] JWT secrets are secure and unique
- [ ] Database credentials are secure
- [ ] CORS settings are appropriate
- [ ] No sensitive data in logs
- [ ] SSL/TLS configured (production)

#### Integration Checks
- [ ] API Gateway routing works correctly
- [ ] Authentication flow works end-to-end
- [ ] Database queries execute successfully
- [ ] Error handling works properly
- [ ] Health checks respond correctly

#### Performance Checks
- [ ] Response times are acceptable (< 2s)
- [ ] Memory usage is within limits
- [ ] CPU usage is reasonable
- [ ] Database connections are efficient
- [ ] No memory leaks detected

### Production Readiness Checklist

#### Configuration
- [ ] Environment variables set for production
- [ ] Database connection pooling configured
- [ ] Logging level set appropriately
- [ ] Error reporting configured
- [ ] Monitoring alerts configured

#### Backup & Recovery
- [ ] Database backup strategy in place
- [ ] Container image backup available
- [ ] Configuration backup stored
- [ ] Recovery procedures documented
- [ ] Rollback plan prepared

#### Monitoring
- [ ] Health check endpoints monitored
- [ ] Log aggregation configured
- [ ] Performance metrics collected
- [ ] Alert thresholds configured
- [ ] Dashboard created

## 🚨 Troubleshooting Guide

### Common Issues & Solutions

#### Issue: Container Won't Start
```bash
# Diagnosis
docker-compose logs mwl-ui
docker-compose ps

# Solutions
1. Check dependencies: docker-compose up -d postgres api-gateway
2. Rebuild container: docker-compose build --no-cache mwl-ui
3. Check port conflicts: netstat -tulpn | grep 8096
```

#### Issue: Database Connection Failed
```bash
# Diagnosis
docker-compose exec postgres pg_isready -U dicom
docker-compose logs postgres

# Solutions
1. Verify PostgreSQL is running
2. Check database credentials
3. Verify network connectivity
4. Check firewall settings
```

#### Issue: Authentication Not Working
```bash
# Diagnosis
curl -v http://localhost:8888/auth/health
docker-compose logs auth-service

# Solutions
1. Verify auth service is running
2. Check JWT secret consistency
3. Verify API Gateway configuration
4. Check token expiration settings
```

#### Issue: UI Not Loading
```bash
# Diagnosis
curl -v http://localhost:8888/mwl-ui/
docker-compose logs api-gateway

# Solutions
1. Check API Gateway routing
2. Verify static file serving
3. Check CORS configuration
4. Verify network connectivity
```

### Emergency Procedures

#### Service Restart
```bash
# Graceful restart
docker-compose restart mwl-ui

# Force restart
docker-compose stop mwl-ui
docker-compose up -d mwl-ui
```

#### Rollback Procedure
```bash
# Stop current version
docker-compose stop mwl-ui

# Restore previous image
docker tag mwl-ui:previous mwl-ui:latest

# Start with previous version
docker-compose up -d mwl-ui
```

#### Data Recovery
```bash
# Backup current data
docker-compose exec postgres pg_dump -U dicom worklist_db > backup.sql

# Restore from backup
docker-compose exec -T postgres psql -U dicom worklist_db < backup.sql
```

## 📊 Monitoring & Maintenance

### Daily Checks
- [ ] Service health status
- [ ] Error log review
- [ ] Performance metrics review
- [ ] Database connection status

### Weekly Checks
- [ ] Resource usage analysis
- [ ] Log rotation verification
- [ ] Security patch review
- [ ] Backup verification

### Monthly Checks
- [ ] Performance trend analysis
- [ ] Capacity planning review
- [ ] Security audit
- [ ] Documentation updates

## 📞 Support Contacts

### Development Team
- **Primary Contact**: SIMRS Development Team
- **Emergency Contact**: System Administrator
- **Documentation**: README.md dan deployment guides

### Escalation Procedures
1. **Level 1**: Check logs dan basic troubleshooting
2. **Level 2**: Contact development team
3. **Level 3**: Emergency system administrator
4. **Level 4**: Vendor support (if applicable)

---

**Document Version**: 1.0.0  
**Last Updated**: 2024  
**Review Schedule**: Monthly