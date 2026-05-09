#!/bin/bash
set -euo pipefail

LOG_FILE="/var/log/restore.log"
S3_PATH="s3://${S3_BUCKET}/orthanc-backups/"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

list_backups() {
    log "Available backups in S3:"
    aws s3 ls "${S3_PATH}" --recursive | grep "orthanc_backup_" | sort -r
}

restore_backup() {
    local BACKUP_FILE="${1}"
    local RESTORE_PATH="/tmp/backups/${BACKUP_FILE}"

    if [[ -z "${BACKUP_FILE}" ]]; then
        log "ERROR: Backup file not specified"
        log "Available backups:"
        list_backups
        exit 1
    fi

    log "Starting restore process for: ${BACKUP_FILE}"

    log "Downloading backup from S3"
    if ! aws s3 cp "${S3_PATH}${BACKUP_FILE}" "${RESTORE_PATH}"; then
        log "ERROR: Failed to download backup from S3"
        exit 1
    fi

    if [[ ! -f "${RESTORE_PATH}" ]]; then
        log "ERROR: Backup file not found after download"
        exit 1
    fi

    BACKUP_SIZE=$(stat -c%s "${RESTORE_PATH}")
    log "Downloaded backup file (${BACKUP_SIZE} bytes)"

    until pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}"; do
        log "Waiting for PostgreSQL to be ready..."
        sleep 5
    done

    CURRENT_BACKUP="orthanc_pre_restore_$(date +%Y%m%d_%H%M%S).sql"
    log "Creating backup of current database: ${CURRENT_BACKUP}"
    PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --format=custom \
        --compress=9 \
        --file="/tmp/backups/${CURRENT_BACKUP}"

    aws s3 cp "/tmp/backups/${CURRENT_BACKUP}" "${S3_PATH}pre-restore/${CURRENT_BACKUP}"

    log "Terminating active connections to database"
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d postgres \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();"

    log "Dropping and recreating database"
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d postgres \
        -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};"

    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d postgres \
        -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};"

    log "Restoring database from backup"
    PGPASSWORD="${POSTGRES_PASSWORD}" pg_restore \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --verbose \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        "${RESTORE_PATH}"

    log "Verifying restore"
    TABLE_COUNT=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')

    if [[ ${TABLE_COUNT} -gt 0 ]]; then
        log "Restore completed successfully. Found ${TABLE_COUNT} tables."
        rm -f "${RESTORE_PATH}"
        log "Local restore file cleaned up"
    else
        log "ERROR: Restore verification failed. No tables found."
        exit 1
    fi
}

get_latest_backup() {
    aws s3 ls "${S3_PATH}" | grep "orthanc_backup_" | sort -k4 -r | head -n1 | awk '{print $4}'
}

case "${1:-list}" in
    "list")
        list_backups
        ;;
    "latest")
        LATEST_BACKUP=$(get_latest_backup)
        if [[ -n "${LATEST_BACKUP}" ]]; then
            restore_backup "${LATEST_BACKUP}"
        else
            log "ERROR: No backups found"
            exit 1
        fi
        ;;
    "restore")
        if [[ -n "${2:-}" ]]; then
            restore_backup "${2}"
        else
            log "ERROR: Please specify backup file name"
            log "Usage: $0 restore <backup_filename>"
            list_backups
            exit 1
        fi
        ;;
    *)
        log "Usage: $0 {list|latest|restore <backup_filename>}"
        exit 1
        ;;
esac
