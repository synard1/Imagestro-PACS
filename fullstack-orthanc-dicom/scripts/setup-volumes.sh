#!/bin/bash
# ==============================================================================
# Docker Volumes Setup Script
# Creates all required directories for bind mounts
# ==============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================================================"
echo -e "${BLUE}Docker Volumes Setup${NC}"
echo "========================================================================"
echo ""

# Get current directory
CURRENT_DIR=$(pwd)
echo "Current directory: $CURRENT_DIR"
echo ""

# ==============================================================================
# Create Data Directories
# ==============================================================================

echo -e "${BLUE}Creating data directories...${NC}"

mkdir -p data/postgres
echo -e "${GREEN}✓${NC} Created: data/postgres"

mkdir -p data/orthanc
echo -e "${GREEN}✓${NC} Created: data/orthanc"

mkdir -p data/worklists
echo -e "${GREEN}✓${NC} Created: data/worklists"

echo ""

# ==============================================================================
# Create Log Directories
# ==============================================================================

echo -e "${BLUE}Creating log directories...${NC}"

mkdir -p logs/auth
echo -e "${GREEN}✓${NC} Created: logs/auth"

mkdir -p logs/gateway
echo -e "${GREEN}✓${NC} Created: logs/gateway"

mkdir -p logs/mwl
echo -e "${GREEN}✓${NC} Created: logs/mwl"

echo ""

# ==============================================================================
# Create Init Script Directory
# ==============================================================================

echo -e "${BLUE}Creating init script directory...${NC}"

mkdir -p postgres-init
echo -e "${GREEN}✓${NC} Created: postgres-init"

echo ""

# ==============================================================================
# Create Application Directories
# ==============================================================================

echo -e "${BLUE}Creating application directories...${NC}"

mkdir -p auth-service
echo -e "${GREEN}✓${NC} Created: auth-service"

mkdir -p api-gateway
echo -e "${GREEN}✓${NC} Created: api-gateway"

mkdir -p orthanc-proxy
echo -e "${GREEN}✓${NC} Created: orthanc-proxy"

mkdir -p mwl-writer
echo -e "${GREEN}✓${NC} Created: mwl-writer"

mkdir -p orthanc-config
echo -e "${GREEN}✓${NC} Created: orthanc-config"

echo ""

# ==============================================================================
# Set Permissions
# ==============================================================================

echo -e "${BLUE}Setting permissions...${NC}"

chmod 755 data
chmod 755 data/*
echo -e "${GREEN}✓${NC} Set permissions: data/"

chmod 755 logs
chmod 755 logs/*
echo -e "${GREEN}✓${NC} Set permissions: logs/"

chmod 755 postgres-init
echo -e "${GREEN}✓${NC} Set permissions: postgres-init/"

if [ -f postgres-init/01-init-databases.sh ]; then
    chmod +x postgres-init/01-init-databases.sh
    echo -e "${GREEN}✓${NC} Made executable: postgres-init/01-init-databases.sh"
fi

echo ""

# ==============================================================================
# Create .gitignore
# ==============================================================================

echo -e "${BLUE}Creating .gitignore...${NC}"

cat > .gitignore <<'EOF'
# Environment files
.env
*.env
!.env.example

# Credentials
CREDENTIALS.txt
*.key
*.pem
*.p12

# Data directories
data/
logs/
*.log

# Backups
*.sql
*.dump
*.gz

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/

# Docker
docker-compose.override.yml

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
EOF

echo -e "${GREEN}✓${NC} Created: .gitignore"
echo ""

# ==============================================================================
# Verify Structure
# ==============================================================================

echo "========================================================================"
echo -e "${GREEN}Directory structure created successfully!${NC}"
echo "========================================================================"
echo ""

echo "Directory tree:"
echo ""

if command -v tree &> /dev/null; then
    tree -L 2 -d .
else
    echo "Current structure:"
    find . -maxdepth 2 -type d | sort
fi

echo ""
echo "========================================================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "========================================================================"
echo ""
echo "Required directories for bind mounts:"
echo "  ✓ data/postgres    - PostgreSQL database files"
echo "  ✓ data/orthanc     - Orthanc DICOM storage"
echo "  ✓ data/worklists   - DICOM worklist files"
echo ""
echo "Application directories:"
echo "  ✓ auth-service     - Authentication service code"
echo "  ✓ api-gateway      - API gateway code"
echo "  ✓ orthanc-proxy    - Orthanc proxy code"
echo "  ✓ mwl-writer       - MWL writer code"
echo "  ✓ postgres-init    - Database init scripts"
echo ""
echo "Log directories:"
echo "  ✓ logs/auth        - Auth service logs"
echo "  ✓ logs/gateway     - API gateway logs"
echo "  ✓ logs/mwl         - MWL writer logs"
echo ""
echo "Next steps:"
echo "  1. Place your Python files in respective directories"
echo "  2. Place 01-init-databases.sh in postgres-init/"
echo "  3. Copy .env.example to .env and configure"
echo "  4. Run: docker-compose up -d postgres"
echo ""
echo "========================================================================"
