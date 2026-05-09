# Docker OHIF Viewer Fix

**Issue**: OHIF container fails to start because `ohif-config/app-config.js` file doesn't exist

**Error**:
```
Error response from daemon: failed to create task for container: 
failed to create shim task: OCI runtime create failed: 
runc create failed: unable to start container process: 
error during container init: error mounting 
"/home/apps/full-pacs/ohif-config/app-config.js" to rootfs at 
"/usr/share/nginx/html/app-config.js": 
create mountpoint for /usr/share/nginx/html/app-config.js mount: 
cannot create subdirectories in 
"/var/lib/docker/overlay2/.../merged/usr/share/nginx/html/app-config.js": 
not a directory: unknown: 
Are you trying to mount a directory onto a file (or vice-versa)? 
Check if the specified host path exists and is the expected type
```

---

## Solution

### Option 1: Create the Missing File (Recommended)

```bash
# Create ohif-config directory
mkdir -p ohif-config

# Create app-config.js file
cat > ohif-config/app-config.js << 'EOF'
window.config = {
  routerBasename: '/',
  extensions: [],
  modes: [],
  showStudyList: true,
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Orthanc DICOM Server',
        name: 'Orthanc',
        wadoUriRoot: 'http://localhost:8042/wado',
        qidoRoot: 'http://localhost:8042/dicom-web',
        wadoRoot: 'http://localhost:8042/dicom-web',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'bulkdata,video',
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
      },
    },
  ],
  defaultDataSourceName: 'dicomweb',
};
EOF

# Set proper permissions
chmod 644 ohif-config/app-config.js
```

### Option 2: Comment Out OHIF Viewer (If Not Needed)

Edit `docker-compose.pacs.yml`:

```yaml
# Comment out the entire ohif-viewer service
# ============================================================================
# OHIF Viewer (Optional - Medical Image Viewer)
# ============================================================================
# ohif-viewer:
#   image: ohif/viewer:latest
#   container_name: ohif-viewer
#   restart: unless-stopped
#   ports:
#     - "3001:80"
#   environment:
#     - PACS_URL=http://pacs-service:8003
#     - ORTHANC_URL=http://orthanc:8042
#     - APP_CONFIG=/usr/share/nginx/html/app-config.js
#   volumes:
#     - ./ohif-config/app-config.js:/usr/share/nginx/html/app-config.js:ro
#   networks:
#     - pacs-network
#   depends_on:
#     - pacs-service
#     - orthanc
#   labels:
#     - "com.pacs.service=ohif-viewer"
#     - "com.pacs.description=Medical Image Viewer"
```

### Option 3: Remove Volume Mount (Use Default Config)

Edit `docker-compose.pacs.yml`:

```yaml
ohif-viewer:
  image: ohif/viewer:latest
  container_name: ohif-viewer
  restart: unless-stopped
  ports:
    - "3001:80"
  environment:
    - PACS_URL=http://pacs-service:8003
    - ORTHANC_URL=http://orthanc:8042
    # Remove APP_CONFIG line
  # Remove volumes section entirely
  networks:
    - pacs-network
  depends_on:
    - pacs-service
    - orthanc
  labels:
    - "com.pacs.service=ohif-viewer"
    - "com.pacs.description=Medical Image Viewer"
```

---

## Complete Setup Instructions

### Step 1: Create Required Directories

```bash
# Navigate to project root
cd /home/apps/full-pacs

# Create all required directories
mkdir -p data/orthanc-storage
mkdir -p data/pacs-storage
mkdir -p logs/orthanc
mkdir -p logs/pacs-service
mkdir -p orthanc-config
mkdir -p ohif-config

# Verify directories created
ls -la data/
ls -la logs/
ls -la ohif-config/
```

### Step 2: Create OHIF Configuration

```bash
# Create app-config.js
cat > ohif-config/app-config.js << 'EOF'
window.config = {
  routerBasename: '/',
  extensions: [],
  modes: [],
  showStudyList: true,
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Orthanc DICOM Server',
        name: 'Orthanc',
        wadoUriRoot: 'http://localhost:8042/wado',
        qidoRoot: 'http://localhost:8042/dicom-web',
        wadoRoot: 'http://localhost:8042/dicom-web',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'bulkdata,video',
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
      },
    },
  ],
  defaultDataSourceName: 'dicomweb',
};
EOF

# Set permissions
chmod 644 ohif-config/app-config.js

# Verify file created
cat ohif-config/app-config.js
```

### Step 3: Verify .env File

```bash
# Check if .env exists
cat .env

# Should contain:
# POSTGRES_PASSWORD=your_password
# ORTHANC_PASSWORD=your_password
# JWT_SECRET=your_secret
```

### Step 4: Start Docker Services

```bash
# Start services
docker-compose -f docker-compose.pacs.yml up -d

# Check status
docker-compose -f docker-compose.pacs.yml ps

# View logs
docker-compose -f docker-compose.pacs.yml logs -f
```

---

## Troubleshooting

### Issue: File Still Not Found

```bash
# Check if file exists
ls -la ohif-config/app-config.js

# Check file permissions
stat ohif-config/app-config.js

# Check file content
cat ohif-config/app-config.js
```

### Issue: Permission Denied

```bash
# Fix permissions
sudo chown $USER:$USER ohif-config/app-config.js
chmod 644 ohif-config/app-config.js
```

### Issue: Directory Not Found

```bash
# Create directory
mkdir -p ohif-config

# Verify
ls -la | grep ohif-config
```

### Issue: Docker Can't Access File

```bash
# Check Docker has access to directory
ls -la ohif-config/

# If using SELinux, add label
sudo chcon -Rt svirt_sandbox_file_t ohif-config/

# Or disable SELinux temporarily (not recommended for production)
sudo setenforce 0
```

---

## Alternative: Use Docker Volume Instead of Bind Mount

Edit `docker-compose.pacs.yml`:

```yaml
ohif-viewer:
  image: ohif/viewer:latest
  container_name: ohif-viewer
  restart: unless-stopped
  ports:
    - "3001:80"
  environment:
    - PACS_URL=http://pacs-service:8003
    - ORTHANC_URL=http://orthanc:8042
  # Remove volumes section or use named volume
  volumes:
    - ohif-config:/usr/share/nginx/html/config:ro
  networks:
    - pacs-network
  depends_on:
    - pacs-service
    - orthanc

# Add to volumes section
volumes:
  ohif-config:
    driver: local
```

Then copy config into volume:

```bash
# Create container with volume
docker-compose -f docker-compose.pacs.yml up -d ohif-viewer

# Copy config into volume
docker cp ohif-config/app-config.js ohif-viewer:/usr/share/nginx/html/app-config.js

# Restart container
docker-compose -f docker-compose.pacs.yml restart ohif-viewer
```

---

## Verification

### Check OHIF Viewer

```bash
# Check if container is running
docker ps | grep ohif-viewer

# Check logs
docker logs ohif-viewer

# Test access
curl http://localhost:3001

# Open in browser
# http://localhost:3001
```

### Check File Inside Container

```bash
# Enter container
docker exec -it ohif-viewer sh

# Check file exists
ls -la /usr/share/nginx/html/app-config.js

# View content
cat /usr/share/nginx/html/app-config.js

# Exit
exit
```

---

## Summary

**Root Cause**: File `ohif-config/app-config.js` doesn't exist on host

**Solution**: Create the file before starting Docker

**Commands**:
```bash
mkdir -p ohif-config
cat > ohif-config/app-config.js << 'EOF'
window.config = { /* config here */ };
EOF
docker-compose -f docker-compose.pacs.yml up -d
```

**Alternative**: Comment out OHIF viewer if not needed

---

**Date**: November 16, 2025  
**Status**: Ready to apply
