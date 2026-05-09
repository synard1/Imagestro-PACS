
#!/bin/bash
# Orthanc DICOM Server - Quick Start Script
set -euo pipefail

echo "🏥 Orthanc DICOM Server - Quick Start"
echo "===================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker compose is available
if ! command -v docker-compose > /dev/null 2>&1 && ! docker compose version > /dev/null 2>&1; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

echo "✅ Docker is running"

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating environment file from template..."
    cp .env.template .env
    echo "⚠️  Please edit .env file with your configuration before proceeding."
    echo "   Especially AWS credentials for S3 backup and secure passwords."
    read -p "Press Enter after editing .env file to continue..."
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p logs data backups ssl monitoring/{prometheus,grafana} init-scripts

# Set permissions
chmod +x backup-scripts/*.sh 2>/dev/null || true

# Pull latest images
echo "📥 Pulling Docker images..."
docker compose pull

# Start services
echo "🚀 Starting services..."
docker compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Check service status
echo "🔍 Checking service status..."
docker compose ps

# Show service URLs
echo ""
echo "🌐 Your Orthanc DICOM Server is ready!"
echo "=================================="
echo "📊 Orthanc Web Interface: http://localhost:8042"
echo "🔗 HAProxy Stats: http://localhost:8404/stats (admin/admin123)"
echo "📈 Prometheus: http://localhost:9090"
echo "📊 Grafana: http://localhost:3000 (admin/admin123)"
echo ""
echo "📡 DICOM Server is listening on port 4242"
echo ""
echo "🔑 Default Orthanc credentials: orthanc/orthanc"
echo "⚠️  Please change default passwords for production use!"
echo ""
echo "📖 For more information, see README.md"
echo "🆘 For logs: docker compose logs -f"
