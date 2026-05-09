#!/bin/bash
#
# End-to-End Test for RBAC (Role-Based Access Control) API
#
# This script validates the full lifecycle of roles and permissions:
# 1. Login as admin to get a JWT token.
# 2. Create a new custom permission.
# 3. Create a new custom role.
# 4. Assign the new permission to the new role.
# 5. Verify the assignment.
# 6. Revoke the permission from the role.
# 7. Verify the revocation.
# 8. Clean up by deleting the created role and permission.
#

set -e
set -o pipefail

# --- Configuration ---
API_URL="http://localhost:8888"
ADMIN_USER="admin"
ADMIN_PASS="Admin@12345"

# Resources to be created and destroyed
TEST_ROLE_NAME="FINANCE_TEST_ROLE"
TEST_PERMISSION_NAME="billing:read:test"
TEST_PERMISSION_CATEGORY="billing_test"

# --- Helper Functions ---
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] - INFO - $1"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] - ERROR - $1" >&2
}

cleanup() {
    log "--- Starting Cleanup ---"
    if [ -n "$ADMIN_TOKEN" ]; then
        if [ -n "$TEST_ROLE_ID" ]; then
            log "Deleting test role ID: $TEST_ROLE_ID"
            curl -s -X DELETE "$API_URL/auth/roles/$TEST_ROLE_ID" -H "Authorization: Bearer $ADMIN_TOKEN" || log_error "Failed to delete role $TEST_ROLE_ID"
        fi
        if [ -n "$TEST_PERMISSION_ID" ]; then
            log "Deleting test permission ID: $TEST_PERMISSION_ID"
            curl -s -X DELETE "$API_URL/auth/permissions/$TEST_PERMISSION_ID" -H "Authorization: Bearer $ADMIN_TOKEN" || log_error "Failed to delete permission $TEST_PERMISSION_ID"
        fi
    else
        log_error "No admin token, cannot perform cleanup."
    fi
    log "--- Cleanup Complete ---"
}

# Ensure cleanup runs on script exit
trap cleanup EXIT

# --- Test Execution ---

# 1. Login as Admin
log "1. Logging in as admin to get JWT token..."
LOGIN_PAYLOAD=$(printf '{"username": "%s", "password": "%s"}' "$ADMIN_USER" "$ADMIN_PASS")
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" -H "Content-Type: application/json" -d "$LOGIN_PAYLOAD")

ADMIN_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r .access_token)
if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" == "null" ]; then
    log_error "Failed to get admin token. Response: $LOGIN_RESPONSE"
    exit 1
fi
log "Successfully obtained admin token."

# 2. Create a new Permission
log "2. Creating a new permission: $TEST_PERMISSION_NAME"
PERMISSION_PAYLOAD=$(printf '{"name": "%s", "description": "Test permission for billing", "category": "%s"}' "$TEST_PERMISSION_NAME" "$TEST_PERMISSION_CATEGORY")
PERMISSION_RESPONSE=$(curl -s -X POST "$API_URL/auth/permissions" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d "$PERMISSION_PAYLOAD")

TEST_PERMISSION_ID=$(echo "$PERMISSION_RESPONSE" | jq -r .permission.id)
if [ -z "$TEST_PERMISSION_ID" ] || [ "$TEST_PERMISSION_ID" == "null" ]; then
    log_error "Failed to create permission. Response: $PERMISSION_RESPONSE"
    exit 1
fi
log "Permission created with ID: $TEST_PERMISSION_ID"

# 3. Create a new Role
log "3. Creating a new role: $TEST_ROLE_NAME"
ROLE_PAYLOAD=$(printf '{"name": "%s", "description": "Test role for finance department"}' "$TEST_ROLE_NAME")
ROLE_RESPONSE=$(curl -s -X POST "$API_URL/auth/roles" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d "$ROLE_PAYLOAD")

TEST_ROLE_ID=$(echo "$ROLE_RESPONSE" | jq -r .role.id)
if [ -z "$TEST_ROLE_ID" ] || [ "$TEST_ROLE_ID" == "null" ]; then
    log_error "Failed to create role. Response: $ROLE_RESPONSE"
    exit 1
fi
log "Role created with ID: $TEST_ROLE_ID"

# 4. Assign Permission to Role
log "4. Assigning permission $TEST_PERMISSION_ID to role $TEST_ROLE_ID"
ASSIGN_PAYLOAD=$(printf '{"permission_id": "%s"}' "$TEST_PERMISSION_ID")
curl -s -f -X POST "$API_URL/auth/roles/$TEST_ROLE_ID/permissions" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d "$ASSIGN_PAYLOAD" > /dev/null
log "Assignment request sent."

# 5. Verify Assignment
log "5. Verifying assignment..."
ROLE_PERMISSIONS=$(curl -s -X GET "$API_URL/auth/roles/$TEST_ROLE_ID/permissions" -H "Authorization: Bearer $ADMIN_TOKEN")
PERMISSION_FOUND=$(echo "$ROLE_PERMISSIONS" | jq -r --arg PERM_ID "$TEST_PERMISSION_ID" '.permissions[] | select(.id == $PERM_ID) | .id')

if [ "$PERMISSION_FOUND" == "$TEST_PERMISSION_ID" ]; then
    log "SUCCESS: Permission correctly assigned to role."
else
    log_error "FAILURE: Permission was not found in role."
    log_error "API Response: $ROLE_PERMISSIONS"
    exit 1
fi

# 6. Revoke Permission from Role
log "6. Revoking permission $TEST_PERMISSION_ID from role $TEST_ROLE_ID"
curl -s -f -X DELETE "$API_URL/auth/roles/$TEST_ROLE_ID/permissions/$TEST_PERMISSION_ID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
log "Revocation request sent."

# 7. Verify Revocation
log "7. Verifying revocation..."
ROLE_PERMISSIONS_AFTER_DELETE=$(curl -s -X GET "$API_URL/auth/roles/$TEST_ROLE_ID/permissions" -H "Authorization: Bearer $ADMIN_TOKEN")
PERMISSION_FOUND_AFTER_DELETE=$(echo "$ROLE_PERMISSIONS_AFTER_DELETE" | jq -r --arg PERM_ID "$TEST_PERMISSION_ID" '.permissions[] | select(.id == $PERM_ID) | .id')

if [ -z "$PERMISSION_FOUND_AFTER_DELETE" ]; then
    log "SUCCESS: Permission correctly revoked from role."
else
    log_error "FAILURE: Permission was still found in role after deletion."
    log_error "API Response: $ROLE_PERMISSIONS_AFTER_DELETE"
    exit 1
fi

log "All RBAC API tests passed successfully!"
# The cleanup function will run automatically on exit.
