"""
Doctor Data Seeder
Seeds doctor master data from docs/doctors.json into the database
Can be run standalone or imported as a module
"""
import os
import sys
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': int(os.getenv('POSTGRES_PORT', '5432'))
}

class DoctorSeeder:
    """Seeder class for doctor master data"""

    def __init__(self, json_file_path=None):
        """
        Initialize seeder

        Args:
            json_file_path: Path to doctors.json file. If None, uses default location.
        """
        if json_file_path is None:
            # Default path relative to this script
            base_dir = os.path.dirname(os.path.abspath(__file__))
            json_file_path = os.path.join(base_dir, '..', 'docs', 'doctors.json')

        self.json_file_path = json_file_path
        self.conn = None
        self.cursor = None

        # Statistics
        self.stats = {
            'total': 0,
            'created': 0,
            'skipped': 0,
            'errors': 0,
            'error_details': []
        }

    def connect_db(self):
        """Establish database connection"""
        try:
            self.conn = psycopg2.connect(**DB_CONFIG)
            self.cursor = self.conn.cursor(cursor_factory=RealDictCursor)
            logger.info(f"✓ Connected to database: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
            return True
        except psycopg2.Error as e:
            logger.error(f"✗ Database connection failed: {str(e)}")
            return False

    def close_db(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        logger.info("Database connection closed")

    def load_doctors_json(self):
        """
        Load doctors from JSON file

        Returns:
            list: List of doctor dictionaries
        """
        if not os.path.exists(self.json_file_path):
            logger.error(f"✗ JSON file not found: {self.json_file_path}")
            return None

        try:
            with open(self.json_file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Filter out metadata object (has _meta key)
            doctors = [item for item in data if '_meta' not in item]

            self.stats['total'] = len(doctors)
            logger.info(f"✓ Loaded {len(doctors)} doctors from {self.json_file_path}")

            return doctors
        except json.JSONDecodeError as e:
            logger.error(f"✗ Invalid JSON format: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"✗ Error reading JSON file: {str(e)}")
            return None

    def doctor_exists(self, doctor_data):
        """
        Check if doctor already exists in database

        Args:
            doctor_data: Dictionary containing doctor information

        Returns:
            tuple: (exists: bool, doctor_id: str or None)
        """
        ihs_number = doctor_data.get('ihs_number')  # Was 'practitioner_id'
        national_id = doctor_data.get('national_id')  # Was 'nik'
        license_num = doctor_data.get('license')

        # Build query to check for duplicates
        conditions = []
        params = []

        if ihs_number:
            conditions.append("ihs_number = %s")
            params.append(ihs_number)
        if national_id:
            conditions.append("national_id = %s")
            params.append(national_id)
        if license_num:
            conditions.append("license = %s")
            params.append(license_num)

        if not conditions:
            return False, None

        query = f"SELECT id, name FROM doctors WHERE {' OR '.join(conditions)}"

        try:
            self.cursor.execute(query, params)
            result = self.cursor.fetchone()

            if result:
                return True, result['id']
            return False, None
        except Exception as e:
            logger.error(f"Error checking existence: {str(e)}")
            return False, None

    def insert_doctor(self, doctor_data):
        """
        Insert doctor into database

        Args:
            doctor_data: Dictionary containing doctor information

        Returns:
            str: Doctor ID if successful, None otherwise
        """
        try:
            # Map JSON fields to database fields (matching doctors.json format)
            insert_data = {
                'ihs_number': doctor_data.get('ihs_number'),  # Was 'practitioner_id'
                'national_id': doctor_data.get('national_id'),  # Was 'nik'
                'name': doctor_data.get('name'),
                'license': doctor_data.get('license'),
                'specialty': doctor_data.get('specialty'),
                'phone': doctor_data.get('phone'),
                'email': doctor_data.get('email', ''),  # Add email field
                'birth_date': doctor_data.get('birth_date'),
                'gender': doctor_data.get('gender'),
                'active': True
            }

            # Validate required fields
            if not insert_data['name']:
                raise ValueError("Name is required")

            # Insert query
            self.cursor.execute("""
                INSERT INTO doctors (
                    ihs_number, national_id, name, license, specialty,
                    phone, email, birth_date, gender, active
                ) VALUES (
                    %(ihs_number)s, %(national_id)s, %(name)s, %(license)s, %(specialty)s,
                    %(phone)s, %(email)s, %(birth_date)s, %(gender)s, %(active)s
                ) RETURNING id
            """, insert_data)

            result = self.cursor.fetchone()
            return result['id']

        except Exception as e:
            logger.error(f"Error inserting doctor {doctor_data.get('name', 'Unknown')}: {str(e)}")
            raise

    def seed_doctor(self, doctor_data):
        """
        Seed a single doctor

        Args:
            doctor_data: Dictionary containing doctor information

        Returns:
            dict: Result of seeding operation
        """
        name = doctor_data.get('name', 'Unknown')

        try:
            # Check if doctor already exists
            exists, existing_id = self.doctor_exists(doctor_data)

            if exists:
                logger.info(f"⊗ Skipped: {name} (already exists - ID: {existing_id})")
                self.stats['skipped'] += 1
                return {
                    'status': 'skipped',
                    'name': name,
                    'id': existing_id,
                    'reason': 'already_exists'
                }

            # Insert new doctor
            doctor_id = self.insert_doctor(doctor_data)
            logger.info(f"✓ Created: {name} (ID: {doctor_id})")
            self.stats['created'] += 1

            return {
                'status': 'created',
                'name': name,
                'id': doctor_id
            }

        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed: {name} - {error_msg}")
            self.stats['errors'] += 1
            self.stats['error_details'].append({
                'name': name,
                'error': error_msg
            })

            return {
                'status': 'error',
                'name': name,
                'error': error_msg
            }

    def seed_all(self):
        """
        Seed all doctors from JSON file

        Returns:
            dict: Statistics of seeding operation
        """
        logger.info("=" * 70)
        logger.info("DOCTOR DATA SEEDER")
        logger.info("=" * 70)

        # Load doctors from JSON
        doctors = self.load_doctors_json()
        if doctors is None:
            logger.error("Failed to load doctors from JSON")
            return self.stats

        # Connect to database
        if not self.connect_db():
            logger.error("Failed to connect to database")
            return self.stats

        try:
            logger.info("")
            logger.info("Starting seeding process...")
            logger.info("-" * 70)

            # Process each doctor
            for i, doctor_data in enumerate(doctors, 1):
                logger.info(f"[{i}/{self.stats['total']}] Processing...")
                self.seed_doctor(doctor_data)

            # Commit all changes
            self.conn.commit()
            logger.info("-" * 70)
            logger.info("✓ All changes committed to database")

        except Exception as e:
            # Rollback on error
            if self.conn:
                self.conn.rollback()
            logger.error(f"✗ Error during seeding, rolled back: {str(e)}")

        finally:
            self.close_db()

        # Print summary
        self.print_summary()

        return self.stats

    def print_summary(self):
        """Print seeding summary"""
        logger.info("")
        logger.info("=" * 70)
        logger.info("SEEDING SUMMARY")
        logger.info("=" * 70)
        logger.info(f"Total doctors processed: {self.stats['total']}")
        logger.info(f"✓ Successfully created:  {self.stats['created']}")
        logger.info(f"⊗ Skipped (duplicates):  {self.stats['skipped']}")
        logger.info(f"✗ Errors:                {self.stats['errors']}")

        if self.stats['error_details']:
            logger.info("")
            logger.info("Error Details:")
            for error in self.stats['error_details']:
                logger.info(f"  - {error['name']}: {error['error']}")

        logger.info("=" * 70)

        # Success rate
        if self.stats['total'] > 0:
            success_rate = ((self.stats['created'] + self.stats['skipped']) / self.stats['total']) * 100
            logger.info(f"Success Rate: {success_rate:.1f}%")

        logger.info("")

def main():
    """Main function for standalone execution"""
    # Check for custom JSON file path from command line
    json_file = sys.argv[1] if len(sys.argv) > 1 else None

    # Create seeder and run
    seeder = DoctorSeeder(json_file_path=json_file)
    stats = seeder.seed_all()

    # Exit with appropriate code
    if stats['errors'] > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == '__main__':
    main()