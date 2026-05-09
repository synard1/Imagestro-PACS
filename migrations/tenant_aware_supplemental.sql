-- ============================================================================
-- Tenant-Aware Migration - SUPLEMENTAL (Remaining Tables)
-- ============================================================================

-- Audit & Logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);

ALTER TABLE auth_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_tenant ON auth_audit_log(tenant_id);

ALTER TABLE doctor_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_audit_log_tenant ON doctor_audit_log(tenant_id);

ALTER TABLE patient_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_audit_log_tenant ON patient_audit_log(tenant_id);

ALTER TABLE procedure_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_audit_log_tenant ON procedure_audit_log(tenant_id);

ALTER TABLE procedure_mapping_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_mapping_audit_log_tenant ON procedure_mapping_audit_log(tenant_id);

ALTER TABLE integration_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_integration_audit_log_tenant ON integration_audit_log(tenant_id);

ALTER TABLE notification_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_notification_audit_log_tenant ON notification_audit_log(tenant_id);

ALTER TABLE nurse_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_nurse_audit_log_tenant ON nurse_audit_log(tenant_id);

ALTER TABLE signature_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_signature_audit_log_tenant ON signature_audit_log(tenant_id);

ALTER TABLE system_health_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_system_health_log_tenant ON system_health_log(tenant_id);

-- Permissions
ALTER TABLE roles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);

ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant ON role_permissions(tenant_id);

ALTER TABLE permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_permissions_tenant ON permissions(tenant_id);

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_roles(tenant_id);

ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant ON user_permissions(tenant_id);

-- API
ALTER TABLE api_credentials ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_api_credentials_tenant ON api_credentials(tenant_id);

ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON api_tokens(tenant_id);

-- Accessions
ALTER TABLE accessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_accessions_tenant ON accessions(tenant_id);

ALTER TABLE accession_counters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_accession_counters_tenant ON accession_counters(tenant_id);

-- Doctor Mappings
ALTER TABLE doctor_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_mappings_tenant ON doctor_mappings(tenant_id);

ALTER TABLE doctor_qualifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_qualifications_tenant ON doctor_qualifications(tenant_id);

ALTER TABLE doctor_schedules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_tenant ON doctor_schedules(tenant_id);

-- Cache
ALTER TABLE cache_dokter ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_dokter_tenant ON cache_dokter(tenant_id);

ALTER TABLE cache_hasil_radiologi ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_hasil_radiologi_tenant ON cache_hasil_radiologi(tenant_id);

ALTER TABLE cache_pasien ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_pasien_tenant ON cache_pasien(tenant_id);

ALTER TABLE cache_permintaan_radiologi ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_permintaan_radiologi_tenant ON cache_permintaan_radiologi(tenant_id);

ALTER TABLE cache_permintaan_pemeriksaan_radiologi ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_permintaan_pemeriksaan_radiologi_tenant ON cache_permintaan_pemeriksaan_radiologi(tenant_id);

ALTER TABLE cache_reg_periksa ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_reg_periksa_tenant ON cache_reg_periksa(tenant_id);

-- Patient Related
ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_tenant ON patient_allergies(tenant_id);

ALTER TABLE patient_family_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_family_history_tenant ON patient_family_history(tenant_id);

ALTER TABLE patient_medical_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_medical_history_tenant ON patient_medical_history(tenant_id);

ALTER TABLE patient_medications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_tenant ON patient_medications(tenant_id);

-- Procedure
ALTER TABLE procedure_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_mappings_tenant ON procedure_mappings(tenant_id);

ALTER TABLE procedure_contraindications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_contraindications_tenant ON procedure_contraindications(tenant_id);

ALTER TABLE procedure_equipment ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_equipment_tenant ON procedure_equipment(tenant_id);

ALTER TABLE procedure_modalities ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_modalities_tenant ON procedure_modalities(tenant_id);

ALTER TABLE procedure_protocols ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_protocols_tenant ON procedure_protocols(tenant_id);

ALTER TABLE procedure_mapping_usage ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_mapping_usage_tenant ON procedure_mapping_usage(tenant_id);

-- Storage
ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_locations_tenant ON storage_locations(tenant_id);

ALTER TABLE storage_stats ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_stats_tenant ON storage_stats(tenant_id);

ALTER TABLE storage_backend_health ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_backend_health_tenant ON storage_backend_health(tenant_id);

ALTER TABLE files ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_files_tenant ON files(tenant_id);

-- Object Storage
ALTER TABLE object_stores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_stores_tenant ON object_stores(tenant_id);

ALTER TABLE object_objects ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_objects_tenant ON object_objects(tenant_id);

ALTER TABLE object_replicas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_replicas_tenant ON object_replicas(tenant_id);

ALTER TABLE object_restore_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_restore_requests_tenant ON object_restore_requests(tenant_id);

ALTER TABLE object_retention ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_retention_tenant ON object_retention(tenant_id);

-- HL7
ALTER TABLE hl7_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hl7_config_tenant ON hl7_config(tenant_id);

ALTER TABLE hl7_messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hl7_messages_tenant ON hl7_messages(tenant_id);

ALTER TABLE hl7_processing_queue ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hl7_processing_queue_tenant ON hl7_processing_queue(tenant_id);

-- Settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON settings(tenant_id);

ALTER TABLE system_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_system_config_tenant ON system_config(tenant_id);

-- PACS Tables
ALTER TABLE pacs_series ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_series_tenant ON pacs_series(tenant_id);

ALTER TABLE pacs_instances ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_instances_tenant ON pacs_instances(tenant_id);

ALTER TABLE pacs_measurements ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_measurements_tenant ON pacs_measurements(tenant_id);

ALTER TABLE pacs_measurement_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_measurement_history_tenant ON pacs_measurement_history(tenant_id);

ALTER TABLE pacs_reports ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_reports_tenant ON pacs_reports(tenant_id);

ALTER TABLE pacs_migrations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_migrations_tenant ON pacs_migrations(tenant_id);

ALTER TABLE pacs_dicom_nodes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_dicom_nodes_tenant ON pacs_dicom_nodes(tenant_id);

ALTER TABLE pacs_dicom_operations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_dicom_operations_tenant ON pacs_dicom_operations(tenant_id);

ALTER TABLE pacs_dicom_associations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_dicom_associations_tenant ON pacs_dicom_associations(tenant_id);

ALTER TABLE pacs_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_audit_log_tenant ON pacs_audit_log(tenant_id);

ALTER TABLE pacs_storage_stats ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_storage_stats_tenant ON pacs_storage_stats(tenant_id);

ALTER TABLE pacs_storage_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_storage_history_tenant ON pacs_storage_history(tenant_id);

ALTER TABLE pacs_storage_by_modality ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_storage_by_modality_tenant ON pacs_storage_by_modality(tenant_id);

ALTER TABLE pacs_storage_alerts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_storage_alerts_tenant ON pacs_storage_alerts(tenant_id);

ALTER TABLE study_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_study_jobs_tenant ON study_jobs(tenant_id);

-- Unified Mappings
ALTER TABLE unified_doctor_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_doctor_mappings_tenant ON unified_doctor_mappings(tenant_id);

ALTER TABLE unified_import_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_import_history_tenant ON unified_import_history(tenant_id);

ALTER TABLE unified_operator_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_operator_mappings_tenant ON unified_operator_mappings(tenant_id);

ALTER TABLE unified_procedure_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_procedure_mappings_tenant ON unified_procedure_mappings(tenant_id);

-- Service & Misc
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_service_requests_tenant ON service_requests(tenant_id);

ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_tenant ON schedule_slots(tenant_id);

ALTER TABLE sim_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_sim_orders_tenant ON sim_orders(tenant_id);

ALTER TABLE retry_queue ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_retry_queue_tenant ON retry_queue(tenant_id);

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant ON refresh_tokens(tenant_id);

ALTER TABLE transmission_queue ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_transmission_queue_tenant ON transmission_queue(tenant_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);

ALTER TABLE nurses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_nurses_tenant ON nurses(tenant_id);

ALTER TABLE operator_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_operator_mappings_tenant ON operator_mappings(tenant_id);

ALTER TABLE notification_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_notification_config_tenant ON notification_config(tenant_id);

ALTER TABLE integration_modules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_integration_modules_tenant ON integration_modules(tenant_id);

ALTER TABLE impersonate_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_impersonate_sessions_tenant ON impersonate_sessions(tenant_id);

ALTER TABLE error_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_error_events_tenant ON error_events(tenant_id);

-- Verify
-- SELECT COUNT(DISTINCT table_name) FROM information_schema.columns WHERE column_name = 'tenant_id' AND table_schema = 'public';