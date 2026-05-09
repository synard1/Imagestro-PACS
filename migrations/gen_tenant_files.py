#!/usr/bin/env python3
"""
Generate 1-file-1-table tenant migration files
"""

tables = [
    "audit_logs", "auth_audit_log", "doctor_audit_log", "patient_audit_log",
    "procedure_audit_log", "procedure_mapping_audit_log", "integration_audit_log",
    "notification_audit_log", "nurse_audit_log", "signature_audit_log", "system_health_log",
    "roles", "role_permissions", "permissions", "user_roles", "user_permissions",
    "api_credentials", "api_tokens", "accessions", "accession_counters",
    "doctor_mappings", "doctor_qualifications", "doctor_schedules",
    "cache_dokter", "cache_hasil_radiologi", "cache_pasien",
    "cache_permintaan_radiologi", "cache_permintaan_pemeriksaan_radiologi",
    "cache_reg_periksa", "patient_allergies", "patient_family_history",
    "patient_medical_history", "patient_medications", "procedure_mappings",
    "procedure_contraindications", "procedure_equipment", "procedure_modalities",
    "procedure_protocols", "procedure_mapping_usage", "storage_locations",
    "storage_stats", "storage_backend_health", "files", "object_stores",
    "object_objects", "object_replicas", "object_restore_requests", "object_retention",
    "hl7_config", "hl7_messages", "hl7_processing_queue", "settings", "system_config",
    "pacs_series", "pacs_instances", "pacs_measurements", "pacs_measurement_history",
    "pacs_reports", "pacs_migrations", "pacs_dicom_nodes", "pacs_dicom_operations",
    "pacs_dicom_associations", "pacs_audit_log", "pacs_storage_stats",
    "pacs_storage_history", "pacs_storage_by_modality", "pacs_storage_alerts",
    "study_jobs", "unified_doctor_mappings", "unified_import_history",
    "unified_operator_mappings", "unified_procedure_mappings", "service_requests",
    "schedule_slots", "sim_orders", "retry_queue", "refresh_tokens",
    "transmission_queue", "products", "nurses", "operator_mappings",
    "notification_config", "integration_modules", "impersonate_sessions", "error_events"
]

for table in tables:
    filename = f"20260429_{table}_tenant.sql"
    content = f"""-- ============================================================================
-- Tenant-Aware Migration - {table}
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE {table} ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_{table}_tenant ON {table}(tenant_id);
"""
    with open(f"C:/Users/synar/.baton/worktrees/mwl-pacs-ui/slim-rim/migrations/{filename}", "w") as f:
        f.write(content)

print(f"Generated {len(tables)} migration files")