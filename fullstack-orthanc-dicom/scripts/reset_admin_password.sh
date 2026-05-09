#!/bin/bash
# Debugging: Add a very early echo to see if the script even starts
echo "DEBUG: Script started." >&2 # Force to stderr just in case stdout is weirdly buffered/redirected

set -euo pipefail

# --- Configuration ---
# Path to the .env file
ENV_FILE="/home/apps/fullstack-orthanc-dicom/.env"
AUTH_SERVICE_CONTAINER_NAME="auth-service" # Name of the auth-service container

# --- Helper Functions ---
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] - INFO - $1"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] - ERROR - $1"
    exit 1
}

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    log_error "Error: .env file not found at $ENV_FILE. Please ensure it exists."
fi

# Using source to load .env variables, which is more robust than grep/cut for complex .env files
# Temporarily unset -u to allow sourcing potentially unset variables in .env
set +u
source "$ENV_FILE"
set -u

ADMIN_EMAIL=${ADMIN_EMAIL:-"admin@hospital.local"}
# DB_HOST, DB_NAME, DB_USER, DB_PASSWORD are now read by the internal script from container's env

# --- Main Script ---
log "--- Admin Password Reset Script (Shell) ---"
log "This script will auto-generate a new password for the admin user and update it directly in the PostgreSQL database."
log "It will execute the password reset logic inside the '$AUTH_SERVICE_CONTAINER_NAME' Docker container."
log "Target Admin Email: $ADMIN_EMAIL"

echo ""
echo "WARNING: This script will directly update the database."
echo "Ensure you have a backup of your database before proceeding."
read -p "Type 'yes' to confirm and proceed with the password reset: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
    log "Password reset cancelled by user."
    exit 0
fi

# 1. Check if Docker is running
if ! command -v docker &> /dev/null; then
    log_error "Docker command not found. Please ensure Docker is installed and running."
fi

# 2. Check if the auth-service container is running
if [ "$(docker ps -q -f name="$AUTH_SERVICE_CONTAINER_NAME")" == "" ]; then
    log_error "Auth service container '$AUTH_SERVICE_CONTAINER_NAME' is not running. Please start your Docker Compose services."
fi

# 3. Generate a new strong password
if ! command -v openssl &> /dev/null; then
    log_error "openssl command not found. Please install openssl."
fi
NEW_PASSWORD=$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-16) # 16 chars, alphanumeric
log "Generated new password: $NEW_PASSWORD"

# 4. Execute the password reset inside the auth-service container
log "Executing password reset inside '$AUTH_SERVICE_CONTAINER_NAME' container..."
# We need to escape the new_password for shell execution inside docker exec
ESCAPED_NEW_PASSWORD=$(printf %q "$NEW_PASSWORD")

# The internal script expects admin_email and new_password as arguments
docker exec "$AUTH_SERVICE_CONTAINER_NAME" python /app/reset_password_internal.py "$ADMIN_EMAIL" "$ESCAPED_NEW_PASSWORD"

if [ $? -eq 0 ]; then
    log "Successfully reset password for '$ADMIN_EMAIL'."
    echo ""
    echo "=========================================================================="
    echo "Admin Password Reset Complete!"
    echo "User: $ADMIN_EMAIL"
    echo "New Password: $NEW_PASSWORD"
    echo "=========================================================================="
else
    log_error "Failed to update password in the database via Docker container."
fi

log "Script finished."