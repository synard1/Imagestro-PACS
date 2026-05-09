#!/bin/sh
set -e

# Function to handle shutdown gracefully
shutdown() {
    echo "Received shutdown signal, stopping auth service..."
    if [ -n "$child" ]; then
        kill -TERM "$child" 2>/dev/null || true
        wait "$child" 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap 'shutdown' TERM INT

echo "Starting Authentication Service..."
echo "Environment: $(env | grep -E '^(POSTGRES_|JWT_|LOG_)' | sort)"

# Pre-start: ensure DB is initialized and default admin seeded
echo "Initializing authentication database (tables, indexes, default admin)..."
python -u - <<'PY'
from auth_service import wait_for_database, init_database
try:
    wait_for_database()
    init_database()
    print("Auth DB initialized successfully.")
except Exception as e:
    print(f"[WARN] Auth DB init failed: {e}")
PY

# Check if we're in development mode
if [ "$FLASK_ENV" = "development" ]; then
    echo "Starting in development mode..."
    python auth_service.py &
    child=$!
else
    echo "Starting in production mode with gunicorn..."
    gunicorn --config gunicorn.conf.py auth_service:app &
    child=$!
fi

# Wait for the application to finish
wait "$child"