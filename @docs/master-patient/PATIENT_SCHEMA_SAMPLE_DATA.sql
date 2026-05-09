-- Sample data insertion for testing
-- These queries can be run after verifying the schema was created successfully

-- Insert a sample patient
INSERT INTO patients (patient_national_id, medical_record_number, patient_name, gender, birth_date) 
VALUES ('1234567890123456', 'MRN001', 'John Doe', 'male', '1990-01-01');

-- Insert sample patient allergy data
INSERT INTO patient_allergies (patient_id, allergen, reaction, severity) 
SELECT id, 'Penicillin', 'Skin rash', 'moderate' FROM patients WHERE patient_national_id = '1234567890123456';

-- Retrieve patient with allergies
SELECT p.patient_name, p.patient_national_id, pa.allergen, pa.reaction, pa.severity
FROM patients p
LEFT JOIN patient_allergies pa ON p.id = pa.patient_id
WHERE p.patient_national_id = '1234567890123456';