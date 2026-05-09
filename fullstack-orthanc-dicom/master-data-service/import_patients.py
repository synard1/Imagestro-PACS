import os
import json
import uuid
import psycopg2

DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': int(os.getenv('POSTGRES_PORT', 5432)),
}

PATIENTS_JSON_PATH = os.path.join(os.path.dirname(__file__), 'patients.json')

PROTECTED_PATIENT_IDS = {
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "c3d4e5f6-a7b8-9012-cdef-345678901234",
    "d4e5f6a7-b8c9-0123-def0-456789012345",
    "e5f6a7b8-c9d0-1234-ef01-567890123456",
    "f6a7b8c9-d0e1-2345-f012-678901234567",
    "07b8c9d0-e1f2-3456-0123-789012345678",
    "18c9d0e1-f2a3-4567-1234-890123456789",
    "29d0e1f2-a3b4-5678-2345-901234567890",
    "3ae1f2a3-b4c5-6789-3456-012345678901",
}


def map_gender(g):
    if not g:
        return None
    g = g.upper()
    if g == 'M':
        return 'male'
    if g == 'F':
        return 'female'
    return None


def import_patients():
    if not os.path.exists(PATIENTS_JSON_PATH):
        print(f"patients.json not found at {PATIENTS_JSON_PATH}")
        return

    with open(PATIENTS_JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Filter out meta entries
    patients = [p for p in data if isinstance(p, dict) and 'id' in p]

    conn = psycopg2.connect(**DB_CONFIG)
    try:
        cur = conn.cursor()

        for p in patients:
            pid = p.get('id')
            if not pid:
                continue

            try:
                # Validate UUID format
                uuid_obj = uuid.UUID(pid)
            except ValueError:
                print(f"Skipping patient with invalid UUID id: {pid}")
                continue

            patient_nik = p.get('patient_national_id')
            ihs = p.get('ihs_number')
            mrn = p.get('medical_record_number')
            name = p.get('name') or p.get('patient_name')
            birth_date = p.get('birth_date')
            gender = map_gender(p.get('gender'))
            phone = p.get('phone')

            if not (mrn and name and birth_date and gender):
                print(f"Skipping {pid}: missing required fields")
                continue

            # Check if patient with this id already exists
            cur.execute("SELECT 1 FROM patients WHERE id = %s::uuid", (pid,))
            exists = cur.fetchone()

            if exists:
                print(f"Patient {pid} already exists, skipping")
                continue

            # Insert patient
            cur.execute("""
                INSERT INTO patients (
                    id,
                    patient_national_id,
                    ihs_number,
                    medical_record_number,
                    patient_name,
                    gender,
                    birth_date,
                    phone,
                    active
                ) VALUES (
                    %s::uuid,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    TRUE
                )
            """, (
                pid,
                patient_nik,
                ihs,
                mrn,
                name,
                gender,
                birth_date,
                phone
            ))

            print(f"Inserted protected SATUSEHAT patient: {pid} - {name}")

        conn.commit()
        print("Import completed.")
    except Exception as e:
        conn.rollback()
        print(f"Error importing patients: {e}")
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    import_patients()
