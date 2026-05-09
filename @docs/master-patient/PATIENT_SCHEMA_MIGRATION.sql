-- Migration script to update patient table schema
-- This script renames the 'sex' column to 'gender' and updates the check constraint

-- Rename the column from 'sex' to 'gender'
ALTER TABLE patients RENAME COLUMN sex TO gender;

-- Drop the old check constraint (if it exists)
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_sex_check;

-- Add the new check constraint for gender with only 'male' and 'female' options
ALTER TABLE patients ADD CONSTRAINT patients_gender_check CHECK (gender IN ('male', 'female'));

-- Update any existing data that might not conform to the new constraint
-- This is a safety measure to ensure data integrity
UPDATE patients SET gender = 'male' WHERE gender NOT IN ('male', 'female') AND gender IS NOT NULL;

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'patients' AND column_name = 'gender'
ORDER BY ordinal_position;