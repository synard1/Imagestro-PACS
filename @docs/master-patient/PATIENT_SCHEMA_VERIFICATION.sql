-- Verification queries to ensure everything is set up correctly
-- These can be run to verify the schema was created successfully

-- Check that the patients table exists with correct columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'patients' 
ORDER BY ordinal_position;

-- Check that all related tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('patients', 'patient_allergies', 'patient_medical_history', 'patient_family_history', 'patient_medications', 'patient_audit_log')
AND table_schema = 'public';

-- Check that indexes were created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('patients', 'patient_allergies', 'patient_medical_history', 'patient_family_history', 'patient_medications', 'patient_audit_log')
AND schemaname = 'public';