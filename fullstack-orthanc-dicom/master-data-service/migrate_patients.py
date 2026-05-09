"""
Patient Data Migration Script
Migrates existing patient data from various services to the Master Data Service
"""
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import requests
import json
from datetime import datetime

# Database configuration for source (existing database)
SOURCE_DB_CONFIG = {
    'host': os.getenv('SOURCE_POSTGRES_HOST', 'postgres'),
    'database': os.getenv('SOURCE_POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('SOURCE_POSTGRES_USER', 'dicom'),
    'password': os.getenv('SOURCE_POSTGRES_PASSWORD', 'dicom123'),
    'port': 5432
}

# Master Data Service configuration
MASTER_DATA_SERVICE_URL = os.getenv('MASTER_DATA_SERVICE_URL', 'http://master-data-service:8002')
MASTER_DATA_SERVICE_TOKEN = os.getenv('MASTER_DATA_SERVICE_TOKEN', '')

def get_db_connection(config):
    """Get database connection"""
    return psycopg2.connect(**config)

def fetch_patients_from_source():
    """Fetch all unique patients from source database tables"""
    patients = {}
    
    try:
        with get_db_connection(SOURCE_DB_CONFIG) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Fetch patients from orders table
            cursor.execute("""
                SELECT DISTINCT 
                    patient_national_id, medical_record_number, patient_name, 
                    gender, birth_date, ihs_number
                FROM orders 
                WHERE patient_national_id IS NOT NULL
            """)
            orders_patients = cursor.fetchall()
            
            # Fetch patients from accessions table
            cursor.execute("""
                SELECT DISTINCT 
                    patient_national_id, medical_record_number, patient_name, 
                    gender, birth_date, ihs_number
                FROM accessions 
                WHERE patient_national_id IS NOT NULL
            """)
            accessions_patients = cursor.fetchall()
            
            # Fetch patients from worklists table
            cursor.execute("""
                SELECT DISTINCT 
                    patient_id as patient_national_id, patient_name,
                    patient_sex as gender, 
                    CASE 
                        WHEN patient_birth_date IS NOT NULL AND LENGTH(patient_birth_date) = 8 
                        THEN TO_DATE(patient_birth_date, 'YYYYMMDD')
                        ELSE NULL
                    END as birth_date
                FROM worklists 
                WHERE patient_id IS NOT NULL
            """)
            worklists_patients = cursor.fetchall()
            
            # Combine all patients, prioritizing more complete records
            for patient in orders_patients + accessions_patients + worklists_patients:
                nik = patient.get('patient_national_id')
                mrn = patient.get('medical_record_number')
                
                # Use NIK as primary key if available
                if nik:
                    key = f"nik_{nik}"
                elif mrn:
                    key = f"mrn_{mrn}"
                else:
                    continue
                
                # If we don't have this patient or this record is more complete, update it
                if key not in patients or is_more_complete(patient, patients[key]):
                    patients[key] = {
                        'patient_national_id': patient.get('patient_national_id') or '',
                        'medical_record_number': patient.get('medical_record_number') or '',
                        'patient_name': patient.get('patient_name') or '',
                        'gender': patient.get('gender') or '',
                        'birth_date': patient.get('birth_date'),
                        'ihs_number': patient.get('ihs_number') or ''
                    }
            
        print(f"Found {len(patients)} unique patients to migrate")
        return list(patients.values())
        
    except Exception as e:
        print(f"Error fetching patients: {str(e)}")
        return []

def is_more_complete(patient1, patient2):
    """Determine if patient1 has more complete data than patient2"""
    # Count non-null fields
    count1 = sum(1 for k, v in patient1.items() if v not in (None, '', 'NULL'))
    count2 = sum(1 for k, v in patient2.items() if v not in (None, '', 'NULL'))
    return count1 > count2

def migrate_patient_to_master_service(patient):
    """Migrate a single patient to the master data service"""
    try:
        # Skip if essential fields are missing
        if not patient.get('patient_national_id') or not patient.get('medical_record_number'):
            print(f"Skipping patient: missing essential fields (NIK: {patient.get('patient_national_id')}, MRN: {patient.get('medical_record_number')})")
            return False
            
        # Prepare patient data
        patient_data = {
            'patient_national_id': patient['patient_national_id'],
            'medical_record_number': patient['medical_record_number'],
            'patient_name': patient['patient_name'] or 'Unknown',
            'gender': patient['gender'] or 'unknown',
            'birth_date': patient['birth_date'].strftime('%Y-%m-%d') if isinstance(patient['birth_date'], datetime) else str(patient['birth_date']) if patient['birth_date'] else '1900-01-01',
            'ihs_number': patient['ihs_number'] or ''
        }
        
        # Validate gender
        if patient_data['gender'] not in ['male', 'female']:
            patient_data['gender'] = 'unknown'
        
        # Make API call to master data service
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {MASTER_DATA_SERVICE_TOKEN}'
        }
        
        response = requests.post(
            f"{MASTER_DATA_SERVICE_URL}/patients",
            json=patient_data,
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 201:
            print(f"Successfully migrated patient: {patient['patient_national_id']}")
            return True
        elif response.status_code == 409:
            print(f"Patient already exists: {patient['patient_national_id']}")
            return True
        else:
            print(f"Failed to migrate patient {patient['patient_national_id']}: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"Error migrating patient {patient.get('patient_national_id')}: {str(e)}")
        return False

def migrate_all_patients():
    """Migrate all patients from source to master data service"""
    print("Starting patient migration...")
    
    # Fetch patients from source
    patients = fetch_patients_from_source()
    
    if not patients:
        print("No patients found to migrate")
        return
    
    # Migrate each patient
    success_count = 0
    fail_count = 0
    
    for i, patient in enumerate(patients):
        print(f"Migrating patient {i+1}/{len(patients)}: {patient.get('patient_national_id', 'Unknown')}")
        if migrate_patient_to_master_service(patient):
            success_count += 1
        else:
            fail_count += 1
    
    print(f"Migration complete. Success: {success_count}, Failed: {fail_count}")

if __name__ == '__main__':
    migrate_all_patients()