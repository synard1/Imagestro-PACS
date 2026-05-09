import os

# Configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': int(os.getenv('POSTGRES_PORT', 5432))
}

JWT_SECRET = os.getenv('JWT_SECRET', 'change-this-secret-key-in-production')
JWT_ALGORITHM = 'HS256'

# Permission definitions
REQUIRED_PERMISSIONS = {
    'read_patient': ['patient:read', '*'],
    'create_patient': ['patient:create', '*'],
    'update_patient': ['patient:update', '*'],
    'delete_patient': ['patient:delete', '*'],
    'search_patient': ['patient:search', '*'],
    'read_doctor': ['doctor:read', 'practitioner:read', '*'],
    'create_doctor': ['doctor:create', 'practitioner:create', '*'],
    'update_doctor': ['doctor:update', 'practitioner:update', '*'],
    'delete_doctor': ['doctor:delete', 'practitioner:delete', '*'],
    'search_doctor': ['doctor:search', 'practitioner:search', '*'],
    'read_procedure': ['procedure:read', '*'],
    'create_procedure': ['procedure:create', '*'],
    'update_procedure': ['procedure:update', '*'],
    'delete_procedure': ['procedure:delete', '*'],
    'search_procedure': ['procedure:search', '*'],
    'read_setting': ['setting:read', '*'],
    'write_setting': ['setting:write', '*'],
    'read_mapping': ['mapping:read', '*'],
    'create_mapping': ['mapping:create', '*'],
    'update_mapping': ['mapping:update', '*'],
    'delete_mapping': ['mapping:delete', '*'],
    'read_external_system': ['external_system:read', '*'],
    'manage_external_system': ['external_system:manage', 'system:admin', '*']
}

# Protected SATUSEHAT test patients (read-only, cannot be updated or deleted)
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
    "3ae1f2a3-b4c5-6789-3456-012345678901"
}
