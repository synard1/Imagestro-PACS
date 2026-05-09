#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Script: create-ui-settings-user.sh
# Tujuan:
#   - Membuat permission "setting:read" (jika belum ada)
#   - Membuat role "SETTINGS_CLIENT" (jika belum ada) di tabel roles
#   - Assign permission "setting:read" ke role "SETTINGS_CLIENT"
#   - Membuat user "ui-settings" dengan role dasar VIEWER
#   - Assign role "SETTINGS_CLIENT" ke user tersebut melalui mapping user_roles
#
# Catatan:
#   - Menggunakan API Gateway sebagai entry point
#   - Membutuhkan jq ter-install
#   - Asumsi default admin: superadmin / SuperAdmin@12345 (bisa override via env)
# ============================================================================

GATEWAY_BASE="${GATEWAY_BASE:-http://localhost:8888}"
ADMIN_USER="${ADMIN_USER:-superadmin}"
ADMIN_PASS="${ADMIN_PASS:-SuperAdmin@12345}"

UI_SETTINGS_USERNAME="${UI_SETTINGS_USERNAME:-ui-settings}"
UI_SETTINGS_EMAIL="${UI_SETTINGS_EMAIL:-ui-settings@system.local}"
UI_SETTINGS_PASSWORD="${UI_SETTINGS_PASSWORD:-UiSettings!2025}"
UI_SETTINGS_ROLE_NAME="${UI_SETTINGS_ROLE_NAME:-SETTINGS_CLIENT}"
UI_SETTINGS_PERMISSION_NAME="${UI_SETTINGS_PERMISSION_NAME:-setting:read}"

BASE_FALLBACK_ROLE="VIEWER"  # harus salah satu dari ROLES di auth_service.py

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: 'jq' is required but not installed. Please install jq and retry."
  exit 1
fi

echo "=== 1) Login as admin to obtain access token ==="

ADMIN_LOGIN_RESP=$(curl -sS -X POST "${GATEWAY_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"${ADMIN_USER}\",
    \"password\": \"${ADMIN_PASS}\"
  }")

if echo "$ADMIN_LOGIN_RESP" | jq -e '.status == "success"' >/dev/null 2>&1; then
  ADMIN_TOKEN=$(echo "$ADMIN_LOGIN_RESP" | jq -r '.access_token')
  echo "Admin login success. Token acquired."
else
  echo "ERROR: Admin login failed:"
  echo "$ADMIN_LOGIN_RESP"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer ${ADMIN_TOKEN}"

echo
echo "=== 2) Ensure permission '${UI_SETTINGS_PERMISSION_NAME}' exists ==="

PERMISSIONS_RESP=$(curl -sS -X GET "${GATEWAY_BASE}/auth/permissions" \
  -H "${AUTH_HEADER}" || true)

PERMISSION_ID=$(echo "$PERMISSIONS_RESP" \
  | jq -r --arg NAME "${UI_SETTINGS_PERMISSION_NAME}" '.permissions.all[]? | select(.name == $NAME) | .id' || true)

if [ -n "${PERMISSION_ID}" ] && [ "${PERMISSION_ID}" != "null" ]; then
  echo "Permission '${UI_SETTINGS_PERMISSION_NAME}' already exists with id=${PERMISSION_ID}"
else
  echo "Creating permission '${UI_SETTINGS_PERMISSION_NAME}'..."
  CREATE_PERM_RESP=$(curl -sS -X POST "${GATEWAY_BASE}/auth/permissions" \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${UI_SETTINGS_PERMISSION_NAME}\",
      \"description\": \"Read application settings for UI\",
      \"category\": \"setting\"
    }")

  if echo "$CREATE_PERM_RESP" | jq -e '.status == "success"' >/dev/null 2>&1; then
    PERMISSION_ID=$(echo "$CREATE_PERM_RESP" | jq -r '.permission.id')
    echo "Permission created with id=${PERMISSION_ID}"
  else
    echo "ERROR: Failed to create permission:"
    echo "$CREATE_PERM_RESP"
    exit 1
  fi
fi

echo
echo "=== 3) Ensure role '${UI_SETTINGS_ROLE_NAME}' exists ==="

ROLES_RESP=$(curl -sS -X GET "${GATEWAY_BASE}/auth/roles" \
  -H "${AUTH_HEADER}" || true)

ROLE_ID=$(echo "$ROLES_RESP" \
  | jq -r --arg NAME "${UI_SETTINGS_ROLE_NAME}" '.roles[]? | select(.name == $NAME) | .id' || true)

if [ -n "${ROLE_ID}" ] && [ "${ROLE_ID}" != "null" ]; then
  echo "Role '${UI_SETTINGS_ROLE_NAME}' already exists with id=${ROLE_ID}"
else
  echo "Creating role '${UI_SETTINGS_ROLE_NAME}'..."
  CREATE_ROLE_RESP=$(curl -sS -X POST "${GATEWAY_BASE}/auth/roles" \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${UI_SETTINGS_ROLE_NAME}\",
      \"description\": \"Read-only access to application settings for UI configuration\"
    }")

  if echo "$CREATE_ROLE_RESP" | jq -e '.status == "success"' >/dev/null 2>&1; then
    ROLE_ID=$(echo "$CREATE_ROLE_RESP" | jq -r '.role.id')
    echo "Role created with id=${ROLE_ID}"
  else
    echo "ERROR: Failed to create role:"
    echo "$CREATE_ROLE_RESP"
    exit 1
  fi
fi

echo
echo "=== 4) Assign permission '${UI_SETTINGS_PERMISSION_NAME}' to role '${UI_SETTINGS_ROLE_NAME}' ==="

ROLES_RESP=$(curl -sS -X GET "${GATEWAY_BASE}/auth/roles" -H "${AUTH_HEADER}")
ROLE_ID=$(echo "$ROLES_RESP" \
  | jq -r --arg NAME "${UI_SETTINGS_ROLE_NAME}" '.roles[]? | select(.name == $NAME) | .id')

PERMISSIONS_RESP=$(curl -sS -X GET "${GATEWAY_BASE}/auth/permissions" -H "${AUTH_HEADER}")
PERMISSION_ID=$(echo "$PERMISSIONS_RESP" \
  | jq -r --arg NAME "${UI_SETTINGS_PERMISSION_NAME}" '.permissions.all[]? | select(.name == $NAME) | .id')

if [ -z "${ROLE_ID}" ] || [ "${ROLE_ID}" = "null" ]; then
  echo "ERROR: Role ID not found for '${UI_SETTINGS_ROLE_NAME}'."
  exit 1
fi

if [ -z "${PERMISSION_ID}" ] || [ "${PERMISSION_ID}" = "null" ]; then
  echo "ERROR: Permission ID not found for '${UI_SETTINGS_PERMISSION_NAME}'."
  exit 1
fi

ROLE_PERMS_RESP=$(curl -sS -X GET "${GATEWAY_BASE}/auth/roles/${ROLE_ID}/permissions" \
  -H "${AUTH_HEADER}" || true)

HAS_PERMISSION_IN_ROLE=$(
  echo "$ROLE_PERMS_RESP" \
    | jq -e --arg PID "${PERMISSION_ID}" '.permissions[]? | select(.id == $PID)' >/dev/null 2>&1 \
    && echo "yes" || echo "no"
)

if [ "$HAS_PERMISSION_IN_ROLE" = "yes" ]; then
  echo "Permission already assigned to role."
else
  echo "Assigning permission to role..."
  ASSIGN_PERM_RESP=$(curl -sS -X POST "${GATEWAY_BASE}/auth/roles/${ROLE_ID}/permissions" \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d "{
      \"permission_id\": \"${PERMISSION_ID}\"
    }")

  if echo "$ASSIGN_PERM_RESP" | jq -e '.status == "success"' >/dev/null 2>&1; then
    echo "Permission assigned to role successfully."
  else
    echo "WARNING: Failed to assign permission (may already exist):"
    echo "$ASSIGN_PERM_RESP"
  fi
fi

echo
echo "=== 5) Ensure user '${UI_SETTINGS_USERNAME}' exists and has role '${UI_SETTINGS_ROLE_NAME}' ==="

USERS_RESP=$(curl -sS -X GET "${GATEWAY_BASE}/auth/users?search=${UI_SETTINGS_USERNAME}&limit=100" \
  -H "${AUTH_HEADER}" || true)

EXISTING_USER_ID=$(echo "$USERS_RESP" \
  | jq -r --arg UN "${UI_SETTINGS_USERNAME}" '.data.users[]? | select(.username == $UN) | .id' || true)

if [ -n "${EXISTING_USER_ID}" ] && [ "${EXISTING_USER_ID}" != "null" ]; then
  echo "User '${UI_SETTINGS_USERNAME}' already exists with id=${EXISTING_USER_ID}"
else
  echo "Creating user '${UI_SETTINGS_USERNAME}' with base role '${BASE_FALLBACK_ROLE}'..."
  CREATE_USER_RESP=$(curl -sS -X POST "${GATEWAY_BASE}/auth/users" \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"${UI_SETTINGS_USERNAME}\",
      \"email\": \"${UI_SETTINGS_EMAIL}\",
      \"password\": \"${UI_SETTINGS_PASSWORD}\",
      \"full_name\": \"UI Settings Client\",
      \"role\": \"${BASE_FALLBACK_ROLE}\",
      \"is_active\": true
    }")

  if echo "$CREATE_USER_RESP" | jq -e '.status == "success"' >/dev/null 2>&1; then
    EXISTING_USER_ID=$(echo "$CREATE_USER_RESP" | jq -r '.user.id')
    echo "User created with id=${EXISTING_USER_ID}"
  else
    echo "ERROR: Failed to create user:"
    echo "$CREATE_USER_RESP"
    exit 1
  fi
fi

echo
echo "Assigning role '${UI_SETTINGS_ROLE_NAME}' to user '${UI_SETTINGS_USERNAME}' (if not already)..."

USER_ROLES_RESP=$(curl -sS -X GET "${GATEWAY_BASE}/auth/users/${EXISTING_USER_ID}/roles" \
  -H "${AUTH_HEADER}" || true)

HAS_UI_ROLE=$(
  echo "$USER_ROLES_RESP" \
    | jq -e --arg RID "${ROLE_ID}" '.roles[]? | select(.id == $RID)' >/dev/null 2>&1 \
    && echo "yes" || echo "no"
)

if [ "$HAS_UI_ROLE" = "yes" ]; then
  echo "User already has role '${UI_SETTINGS_ROLE_NAME}'."
else
  ASSIGN_ROLE_RESP=$(curl -sS -X POST "${GATEWAY_BASE}/auth/users/${EXISTING_USER_ID}/roles" \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d "{
      \"role_id\": \"${ROLE_ID}\"
    }")

  if echo "$ASSIGN_ROLE_RESP" | jq -e '.status == "success"' >/dev/null 2>&1; then
    echo "Role '${UI_SETTINGS_ROLE_NAME}' assigned to user successfully."
  else
    echo "ERROR: Failed to assign role to user:"
    echo "$ASSIGN_ROLE_RESP"
    exit 1
  fi
fi

echo
echo "=== 6) Summary ==="
echo "Gateway Base URL      : ${GATEWAY_BASE}"
echo "Admin User            : ${ADMIN_USER}"
echo "Settings Permission   : ${UI_SETTINGS_PERMISSION_NAME} (id=${PERMISSION_ID})"
echo "Settings Role (DB)    : ${UI_SETTINGS_ROLE_NAME} (id=${ROLE_ID})"
echo "Base Role (legacy)    : ${BASE_FALLBACK_ROLE}"
echo "Settings User         : ${UI_SETTINGS_USERNAME}"
echo "Settings User Email   : ${UI_SETTINGS_EMAIL}"
echo "Settings User Password: ${UI_SETTINGS_PASSWORD}"
echo
echo "User '${UI_SETTINGS_USERNAME}' sekarang:"
echo "- Memiliki role legacy '${BASE_FALLBACK_ROLE}' di kolom users.role"
echo "- Memiliki role tambahan '${UI_SETTINGS_ROLE_NAME}' di tabel user_roles"
echo "- Mendapat permission 'setting:read' melalui role '${UI_SETTINGS_ROLE_NAME}'"
echo
echo "Contoh login:"
echo "  curl -X POST ${GATEWAY_BASE}/auth/login \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"username\":\"${UI_SETTINGS_USERNAME}\",\"password\":\"${UI_SETTINGS_PASSWORD}\"}'"
echo
echo "Gunakan access_token hasil login tersebut untuk GET:"
echo "  curl -H \"Authorization: Bearer <token>\" ${GATEWAY_BASE}/settings"
echo
echo "Selesai."
