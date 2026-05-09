#!/bin/bash
set -e

echo "=========================================="
echo "Master Data Service - Starting Up"
echo "=========================================="

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
while ! pg_isready -h ${POSTGRES_HOST:-postgres} -p ${POSTGRES_PORT:-5432} -U ${POSTGRES_USER:-dicom} > /dev/null 2>&1; do
    echo "PostgreSQL is unavailable - sleeping"
    sleep 2
done

echo "PostgreSQL is up - initializing database..."

# Run database initialization
python3 /app/init_db.py

# Check if initialization was successful
if [ $? -eq 0 ]; then
    echo "✓ Database initialized successfully"
else
    echo "✗ Database initialization failed"
    exit 1
fi

echo "Starting gunicorn..."
echo "=========================================="

# Start gunicorn
exec gunicorn --bind 0.0.0.0:8002 --workers 4 --chdir /app --access-logfile - --error-logfile - main:app
