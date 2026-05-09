# SSO Web UI - Deployment Guide

## 📋 Daftar Isi

- [Persyaratan Sistem](#persyaratan-sistem)
- [Persiapan Environment](#persiapan-environment)
- [Deployment dengan Docker](#deployment-dengan-docker)
- [Deployment Manual](#deployment-manual)
- [Konfigurasi Production](#konfigurasi-production)
- [Monitoring dan Logging](#monitoring-dan-logging)
- [Backup dan Recovery](#backup-dan-recovery)
- [Troubleshooting](#troubleshooting)

## 🔧 Persyaratan Sistem

### Minimum Requirements
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 10GB free space
- **OS**: Linux (Ubuntu 20.04+), Windows Server 2019+, macOS 10.15+

### Recommended Requirements
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 50GB+ SSD
- **Network**: 1Gbps connection

### Software Dependencies
- **Docker**: 24.0+
- **Docker Compose**: 2.20+
- **Node.js**: 18.0+ (untuk development)
- **Nginx**: 1.20+ (untuk reverse proxy)

## 🌍 Persiapan Environment

### 1. Clone Repository
```bash
git clone <repository-url>
cd fullstack-orthanc-dicom
```

### 2. Setup Environment Variables
```bash
# Copy environment template
cp sso-ui/.env.example sso-ui/.env

# Edit environment variables
nano sso-ui/.env
```

### 3. Konfigurasi Environment Variables Production
```env
# API Configuration
VITE_API_BASE_URL=https://your-domain.com/api
VITE_AUTH_SERVICE_URL=https://your-domain.com/auth
VITE_MWL_SERVICE_URL=https://your-domain.com/mwl
VITE_ORTHANC_URL=https://your-domain.com/orthanc
VITE_ORDERS_SERVICE_URL=https://your-domain.com/orders

# Security Configuration
VITE_JWT_SECRET=your-super-secure-jwt-secret-key-256-bits
VITE_ENABLE_HTTPS=true
VITE_CORS_ORIGIN=https://your-domain.com

# Production Settings
VITE_DEBUG_MODE=false
VITE_LOG_LEVEL=error
VITE_ENABLE_MOCK_DATA=false
```

## 🐳 Deployment dengan Docker

### 1. Build dan Deploy
```bash
# Build semua services
docker-compose build

# Start services
docker-compose up -d

# Verify deployment
docker-compose ps
docker-compose logs sso-ui
```

### 2. Health Check
```bash
# Check container health
docker-compose exec sso-ui curl -f http://localhost:3000/health || exit 1

# Check all services
docker-compose exec api-gateway curl -f http://localhost:8888/health || exit 1
```

### 3. SSL/TLS Configuration
```yaml
# docker-compose.override.yml
version: '3.8'
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - sso-ui
      - api-gateway
```

## 🔧 Deployment Manual

### 1. Build Application
```bash
cd sso-ui

# Install dependencies
npm ci --production

# Build for production
npm run build

# Verify build
ls -la dist/
```

### 2. Setup Web Server (Nginx)
```nginx
# /etc/nginx/sites-available/sso-ui
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Static Files
    location / {
        root /var/www/sso-ui/dist;
        try_files $uri $uri/ /index.html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API Proxy
    location /api/ {
        proxy_pass http://localhost:8888/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Enable Site
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/sso-ui /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

## ⚙️ Konfigurasi Production

### 1. Database Configuration
```sql
-- Create production database
CREATE DATABASE sso_production;
CREATE USER 'sso_user'@'%' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON sso_production.* TO 'sso_user'@'%';
FLUSH PRIVILEGES;
```

### 2. Redis Configuration
```redis
# /etc/redis/redis.conf
bind 127.0.0.1
port 6379
requirepass your_redis_password
maxmemory 256mb
maxmemory-policy allkeys-lru
```

### 3. Environment Optimization
```bash
# Set production environment
export NODE_ENV=production
export VITE_NODE_ENV=production

# Optimize Node.js
export NODE_OPTIONS="--max-old-space-size=4096"
```

## 📊 Monitoring dan Logging

### 1. Application Monitoring
```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

### 2. Log Configuration
```javascript
// src/utils/logger.js
const logger = {
  info: (message, meta = {}) => {
    if (import.meta.env.PROD) {
      // Send to external logging service
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'info', message, meta, timestamp: new Date().toISOString() })
      });
    } else {
      console.log(message, meta);
    }
  },
  error: (message, error = {}) => {
    if (import.meta.env.PROD) {
      // Send to error tracking service
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          level: 'error', 
          message, 
          error: error.stack || error.message, 
          timestamp: new Date().toISOString() 
        })
      });
    } else {
      console.error(message, error);
    }
  }
};
```

### 3. Health Check Endpoint
```javascript
// src/utils/healthCheck.js
export const healthCheck = async () => {
  const checks = {
    api: false,
    auth: false,
    database: false,
    redis: false
  };

  try {
    // Check API Gateway
    const apiResponse = await fetch('/api/health');
    checks.api = apiResponse.ok;

    // Check Auth Service
    const authResponse = await fetch('/api/auth/health');
    checks.auth = authResponse.ok;

    return {
      status: Object.values(checks).every(Boolean) ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      checks,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};
```

## 💾 Backup dan Recovery

### 1. Database Backup
```bash
#!/bin/bash
# backup-database.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/database"
DB_NAME="sso_production"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
docker-compose exec postgres pg_dump -U postgres $DB_NAME > $BACKUP_DIR/backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/backup_$DATE.sql

# Remove old backups (keep last 30 days)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Database backup completed: backup_$DATE.sql.gz"
```

### 2. Application Backup
```bash
#!/bin/bash
# backup-application.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/application"
APP_DIR="/var/www/sso-ui"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup application files
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz -C $APP_DIR .

# Remove old backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Application backup completed: app_backup_$DATE.tar.gz"
```

### 3. Recovery Procedure
```bash
#!/bin/bash
# restore-database.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    exit 1
fi

# Stop application
docker-compose stop sso-ui

# Restore database
gunzip -c $BACKUP_FILE | docker-compose exec -T postgres psql -U postgres sso_production

# Start application
docker-compose start sso-ui

echo "Database restored from: $BACKUP_FILE"
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Application Won't Start
```bash
# Check logs
docker-compose logs sso-ui

# Check environment variables
docker-compose exec sso-ui env | grep VITE_

# Rebuild container
docker-compose build --no-cache sso-ui
docker-compose up -d sso-ui
```

#### 2. Authentication Issues
```bash
# Check JWT secret
echo $VITE_JWT_SECRET | wc -c  # Should be 32+ characters

# Check auth service connectivity
docker-compose exec sso-ui curl -f http://auth-service:3001/health

# Reset auth cache
docker-compose exec redis redis-cli FLUSHDB
```

#### 3. Performance Issues
```bash
# Check resource usage
docker stats

# Check memory usage
docker-compose exec sso-ui cat /proc/meminfo

# Optimize build
npm run build -- --mode production
```

#### 4. SSL/TLS Issues
```bash
# Test SSL certificate
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# Check certificate expiry
openssl x509 -in /path/to/cert.pem -text -noout | grep "Not After"

# Renew Let's Encrypt certificate
certbot renew --nginx
```

### Performance Optimization

#### 1. Frontend Optimization
```javascript
// vite.config.js - Production optimizations
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['@headlessui/react', '@heroicons/react'],
          utils: ['axios', 'js-cookie', 'jose']
        }
      }
    },
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
});
```

#### 2. Nginx Optimization
```nginx
# Enable HTTP/2
listen 443 ssl http2;

# Enable Brotli compression
brotli on;
brotli_comp_level 6;
brotli_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

# Enable caching
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## 📞 Support

Untuk bantuan deployment atau troubleshooting:

1. **Documentation**: Lihat README.md untuk informasi dasar
2. **Logs**: Periksa logs aplikasi dan container
3. **Health Check**: Gunakan endpoint `/health` untuk monitoring
4. **Monitoring**: Setup Grafana dashboard untuk monitoring real-time

## 🔄 Update Procedure

### 1. Backup sebelum update
```bash
./backup-database.sh
./backup-application.sh
```

### 2. Update aplikasi
```bash
# Pull latest changes
git pull origin main

# Rebuild containers
docker-compose build --no-cache

# Deploy with zero downtime
docker-compose up -d --no-deps sso-ui
```

### 3. Verify update
```bash
# Check application version
curl -s http://localhost:3000/api/version

# Run health check
curl -s http://localhost:3000/health
```

---

**⚠️ Penting**: Selalu test deployment di staging environment sebelum deploy ke production!