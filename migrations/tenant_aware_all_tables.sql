-- ============================================================================
-- Tenant-Aware Migration for All Tables
-- Generated: 2026-04-29
-- Source: tenants (master data)
-- Total Tables: 129
-- ============================================================================

-- Migration: Add tenant_id to tables without tenant_id

-- ===== DICOM Related (5) =====
ALTER TABLE dicom_series ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_dicom_series_tenant ON dicom_series(tenant_id);

ALTER TABLE dicom_metadata ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_dicom_metadata_tenant ON dicom_metadata(tenant_id);

ALTER TABLE dicom_nodes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_dicom_nodes_tenant ON dicom_nodes(tenant_id);

ALTER TABLE dicom_operations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_dicom_operations_tenant ON dicom_operations(tenant_id);

ALTER TABLE dicom_tag_audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_dicom_tag_audit_logs_tenant ON dicom_tag_audit_logs(tenant_id);

-- ===== Orders & Worklist (7) =====
ALTER TABLE order_files ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_order_files_tenant ON order_files(tenant_id);

ALTER TABLE order_procedures ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_order_procedures_tenant ON order_procedures(tenant_id);

ALTER TABLE order_counters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_order_counters_tenant ON order_counters(tenant_id);

ALTER TABLE worklist_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_worklist_items_tenant ON worklist_items(tenant_id);

ALTER TABLE worklists ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_worklists_tenant ON worklists(tenant_id);

ALTER TABLE worklist_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_worklist_history_tenant ON worklist_history(tenant_id);

ALTER TABLE worklist_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_worklist_audit_log_tenant ON worklist_audit_log(tenant_id);

-- ===== Integrations - SatuSehat (9) =====
ALTER TABLE satusehat_encounters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satusehat_encounters_tenant ON satusehat_encounters(tenant_id);

ALTER TABLE satusehat_imaging_studies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satusehat_imaging_studies_tenant ON satusehat_imaging_studies(tenant_id);

ALTER TABLE satusehat_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satusehat_tokens_tenant ON satusehat_tokens(tenant_id);

ALTER TABLE satusehat_service_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satusehat_service_requests_tenant ON satusehat_service_requests(tenant_id);

ALTER TABLE satusehat_orgs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satusehat_orgs_tenant ON satusehat_orgs(tenant_id);

ALTER TABLE satusehat_router_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satusehat_router_logs_tenant ON satusehat_router_logs(tenant_id);

ALTER TABLE satusehat_http_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satusehat_http_logs_tenant ON satusehat_http_logs(tenant_id);

ALTER TABLE satusehat_transmission_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satusehat_transmission_log_tenant ON satusehat_transmission_log(tenant_id);

ALTER TABLE satu_sehat_encounter ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satu_sehat_encounter_tenant ON satu_sehat_encounter(tenant_id);

ALTER TABLE satu_sehat_service_request ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satu_sehat_service_request_tenant ON satu_sehat_service_request(tenant_id);

-- ===== Integrations - Khanza (7) =====
ALTER TABLE khanza_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_khanza_config_tenant ON khanza_config(tenant_id);

ALTER TABLE khanza_doctor_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_khanza_doctor_mappings_tenant ON khanza_doctor_mappings(tenant_id);

ALTER TABLE khanza_import_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_khanza_import_history_tenant ON khanza_import_history(tenant_id);

ALTER TABLE khanza_operator_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_khanza_operator_mappings_tenant ON khanza_operator_mappings(tenant_id);

ALTER TABLE khanza_procedure_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_khanza_procedure_mappings_tenant ON khanza_procedure_mappings(tenant_id);

ALTER TABLE khanza_unmapped_procedures ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_khanza_unmapped_procedures_tenant ON khanza_unmapped_procedures(tenant_id);

-- ===== Integrations - FHIR (5) =====
ALTER TABLE fhir_resources ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_fhir_resources_tenant ON fhir_resources(tenant_id);

ALTER TABLE fhir_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_fhir_transactions_tenant ON fhir_transactions(tenant_id);

ALTER TABLE fhir_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_fhir_config_tenant ON fhir_config(tenant_id);

ALTER TABLE fhir_search_params ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_fhir_search_params_tenant ON fhir_search_params(tenant_id);

ALTER TABLE fhir_resource_links ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_fhir_resource_links_tenant ON fhir_resource_links(tenant_id);

-- ===== Master Data (4) =====
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hospitals_tenant ON hospitals(tenant_id);

ALTER TABLE facilities ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_facilities_tenant ON facilities(tenant_id);

ALTER TABLE loinc_codes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_loinc_codes_tenant ON loinc_codes(tenant_id);

ALTER TABLE nidr_uploads ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_nidr_uploads_tenant ON nidr_uploads(tenant_id);

-- ===== Reports (4) =====
ALTER TABLE reports ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id);

ALTER TABLE report_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_report_history_tenant ON report_history(tenant_id);

ALTER TABLE report_attachments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_report_attachments_tenant ON report_attachments(tenant_id);

ALTER TABLE report_signatures ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_report_signatures_tenant ON report_signatures(tenant_id);

-- ===== Storage (6) =====
ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_locations_tenant ON storage_locations(tenant_id);

ALTER TABLE storage_stats ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_stats_tenant ON storage_stats(tenant_id);

ALTER TABLE storage_backend_health ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_backend_health_tenant ON storage_backend_health(tenant_id);

ALTER TABLE files ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_files_tenant ON files(tenant_id);

ALTER TABLE object_stores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_stores_tenant ON object_stores(tenant_id);

ALTER TABLE object_objects ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_objects_tenant ON object_objects(tenant_id);

-- ===== PACS Clinical (9) =====
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

-- ===== Storage Stats PACS (4) =====
ALTER TABLE pacs_storage_stats ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_storage_stats_tenant ON pacs_storage_stats(tenant_id);

ALTER TABLE pacs_storage_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_storage_history_tenant ON pacs_storage_history(tenant_id);

ALTER TABLE pacs_storage_by_modality ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_storage_by_modality_tenant ON pacs_storage_by_modality(tenant_id);

ALTER TABLE pacs_storage_alerts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_storage_alerts_tenant ON pacs_storage_alerts(tenant_id);

-- ===== Audit & Logs (11) =====
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

ALTER TABLE error_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_error_events_tenant ON error_events(tenant_id);

ALTER TABLE integration_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_integration_audit_log_tenant ON integration_audit_log(tenant_id);

ALTER TABLE signature_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_signature_audit_log_tenant ON signature_audit_log(tenant_id);

ALTER TABLE system_health_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_system_health_log_tenant ON system_health_log(tenant_id);

ALTER TABLE notification_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_notification_audit_log_tenant ON notification_audit_log(tenant_id);

-- ===== Permissions (5) =====
ALTER TABLE roles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);

ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant ON role_permissions(tenant_id);

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_roles(tenant_id);

ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant ON user_permissions(tenant_id);

ALTER TABLE permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_permissions_tenant ON permissions(tenant_id);

-- ===== Cache Tables (7) =====
ALTER TABLE cache_dokter ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_dokter_tenant ON cache_dokter(tenant_id);

ALTER TABLE cache_hasil_radiologi ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_hasil_radiologi_tenant ON cache_hasil_radiologi(tenant_id);

ALTER TABLE cache_pasien ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_pasien_tenant ON cache_pasien(tenant_id);

ALTER TABLE cache_permintaan_pemeriksaan_radiologi ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_permintaan_pemeriksaan_radiologi_tenant ON cache_permintaan_pemeriksaan_radiologi(tenant_id);

ALTER TABLE cache_permintaan_radiologi ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_permintaan_radiologi_tenant ON cache_permintaan_radiologi(tenant_id);

ALTER TABLE cache_reg_periksa ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_reg_periksa_tenant ON cache_reg_periksa(tenant_id);

-- ===== Patient Related (5) =====
ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_tenant ON patient_allergies(tenant_id);

ALTER TABLE patient_family_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_family_history_tenant ON patient_family_history(tenant_id);

ALTER TABLE patient_medical_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_medical_history_tenant ON patient_medical_history(tenant_id);

ALTER TABLE patient_medications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_tenant ON patient_medications(tenant_id);

-- ===== API & Settings (4) =====
ALTER TABLE api_credentials ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_api_credentials_tenant ON api_credentials(tenant_id);

ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON api_tokens(tenant_id);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON settings(tenant_id);

ALTER TABLE system_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_system_config_tenant ON system_config(tenant_id);

-- ===== Doctor Mappings (4) =====
ALTER TABLE doctor_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_mappings_tenant ON doctor_mappings(tenant_id);

ALTER TABLE doctor_qualifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_qualifications_tenant ON doctor_qualifications(tenant_id);

ALTER TABLE doctor_schedules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_tenant ON doctor_schedules(tenant_id);

-- ===== Procedure Related (6) =====
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

-- ===== Other Tables (15) =====
ALTER TABLE accessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_accessions_tenant ON accessions(tenant_id);

ALTER TABLE accession_counters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_accession_counters_tenant ON accession_counters(tenant_id);

ALTER TABLE impersonate_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_impersonate_sessions_tenant ON impersonate_sessions(tenant_id);

ALTER TABLE integration_modules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_integration_modules_tenant ON integration_modules(tenant_id);

ALTER TABLE notification_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_notification_config_tenant ON notification_config(tenant_id);

ALTER TABLE nurses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_nurses_tenant ON nurses(tenant_id);

ALTER TABLE operator_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_operator_mappings_tenant ON operator_mappings(tenant_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant ON refresh_tokens(tenant_id);

ALTER TABLE retry_queue ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_retry_queue_tenant ON retry_queue(tenant_id);

ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_tenant ON schedule_slots(tenant_id);

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_service_requests_tenant ON service_requests(tenant_id);

ALTER TABLE sim_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_sim_orders_tenant ON sim_orders(tenant_id);

ALTER TABLE transmission_queue ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_transmission_queue_tenant ON transmission_queue(tenant_id);

-- ===== Unified Mappings (4) =====
ALTER TABLE unified_doctor_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_doctor_mappings_tenant ON unified_doctor_mappings(tenant_id);

ALTER TABLE unified_import_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_import_history_tenant ON unified_import_history(tenant_id);

ALTER TABLE unified_operator_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_operator_mappings_tenant ON unified_operator_mappings(tenant_id);

ALTER TABLE unified_procedure_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_procedure_mappings_tenant ON unified_procedure_mappings(tenant_id);

-- ===== Object Storage Related (3) =====
ALTER TABLE object_replicas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_replicas_tenant ON object_replicas(tenant_id);

ALTER TABLE object_restore_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_restore_requests_tenant ON object_restore_requests(tenant_id);

ALTER TABLE object_retention ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_retention_tenant ON object_retention(tenant_id);

-- ===== HL7 Related (3) =====
ALTER TABLE hl7_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hl7_config_tenant ON hl7_config(tenant_id);

ALTER TABLE hl7_messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hl7_messages_tenant ON hl7_messages(tenant_id);

ALTER TABLE hl7_processing_queue ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hl7_processing_queue_tenant ON hl7_processing_queue(tenant_id);

-- ===== Study Jobs =====
ALTER TABLE study_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_study_jobs_tenant ON study_jobs(tenant_id);

-- ===== Pacs Audit =====
ALTER TABLE pacs_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_audit_log_tenant ON pacs_audit_log(tenant_id);

-- ===== Verify =====
-- SELECT COUNT(*) as tables_with_tenant FROM information_schema.columns WHERE column_name = 'tenant_id' AND table_schema = 'public';