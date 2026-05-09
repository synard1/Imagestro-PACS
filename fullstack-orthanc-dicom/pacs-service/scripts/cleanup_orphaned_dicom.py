#!/usr/bin/env python3
"""
DICOM Cleanup Script
Menghapus DICOM files, studies, dan file fisik yang tidak terhubung ke worklist manapun

Usage:
    python cleanup_orphaned_dicom.py --dry-run          # Preview apa yang akan dihapus
    python cleanup_orphaned_dicom.py --execute          # Hapus data (PERMANENT!)
    python cleanup_orphaned_dicom.py --execute --force  # Hapus tanpa konfirmasi
"""

import os
import sys
import argparse
import psycopg2
from datetime import datetime
from typing import List, Dict, Tuple

# Database Configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'worklist_db'),
    'user': os.getenv('DB_USER', 'dicom'),
    'password': os.getenv('DB_PASSWORD', 'dicom2024!@#')
}

# Storage paths (container paths)
STORAGE_PATHS = [
    '/var/lib/pacs/storage/dicom/uploads',
    '/var/lib/pacs/storage/hot',
    '/var/lib/pacs/storage/warm',
    '/var/lib/pacs/storage/cold'
]


class DicomCleanup:
    """DICOM Cleanup Manager"""

    def __init__(self, dry_run: bool = True):
        self.dry_run = dry_run
        self.conn = None
        self.stats = {
            'dicom_files_found': 0,
            'dicom_files_deleted': 0,
            'studies_found': 0,
            'studies_deleted': 0,
            'physical_files_found': 0,
            'physical_files_deleted': 0,
            'physical_files_failed': 0,
            'errors': []
        }

    def connect_db(self):
        """Connect to PostgreSQL database"""
        try:
            self.conn = psycopg2.connect(**DB_CONFIG)
            print(f"✓ Connected to database: {DB_CONFIG['database']}")
            return True
        except Exception as e:
            print(f"✗ Database connection failed: {e}")
            return False

    def close_db(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("✓ Database connection closed")

    def find_orphaned_dicom_files(self) -> List[Dict]:
        """
        Find DICOM files yang tidak terhubung ke worklist

        Returns:
            List of orphaned dicom_files records
        """
        query = """
        SELECT
            df.id,
            df.file_path,
            df.sop_instance_uid,
            df.study_id,
            df.patient_name,
            df.file_size,
            df.created_at
        FROM dicom_files df
        LEFT JOIN worklist_items wi ON wi.study_instance_uid = df.study_id
        WHERE wi.id IS NULL  -- Tidak ada worklist yang terhubung
        ORDER BY df.created_at DESC;
        """

        try:
            cursor = self.conn.cursor()
            cursor.execute(query)
            rows = cursor.fetchall()

            orphaned_files = []
            for row in rows:
                orphaned_files.append({
                    'id': str(row[0]),
                    'file_path': row[1],
                    'sop_instance_uid': row[2],
                    'study_id': row[3],
                    'patient_name': row[4] or '(no name)',
                    'file_size': row[5],
                    'created_at': row[6]
                })

            self.stats['dicom_files_found'] = len(orphaned_files)
            cursor.close()
            return orphaned_files

        except Exception as e:
            self.stats['errors'].append(f"Error finding orphaned dicom_files: {e}")
            return []

    def find_orphaned_studies(self) -> List[Dict]:
        """
        Find studies yang tidak terhubung ke worklist

        Returns:
            List of orphaned pacs_studies records
        """
        query = """
        SELECT
            ps.study_instance_uid,
            ps.patient_name,
            ps.study_date,
            ps.modality,
            ps.number_of_series,
            ps.number_of_instances,
            ps.created_at
        FROM pacs_studies ps
        LEFT JOIN worklist_items wi ON wi.study_instance_uid = ps.study_instance_uid
        WHERE wi.id IS NULL  -- Tidak ada worklist yang terhubung
          AND ps.deleted_at IS NULL  -- Tidak termasuk soft-deleted
        ORDER BY ps.created_at DESC;
        """

        try:
            cursor = self.conn.cursor()
            cursor.execute(query)
            rows = cursor.fetchall()

            orphaned_studies = []
            for row in rows:
                orphaned_studies.append({
                    'study_instance_uid': row[0],
                    'patient_name': row[1] or '(no name)',
                    'study_date': row[2],
                    'modality': row[3],
                    'number_of_series': row[4],
                    'number_of_instances': row[5],
                    'created_at': row[6]
                })

            self.stats['studies_found'] = len(orphaned_studies)
            cursor.close()
            return orphaned_studies

        except Exception as e:
            self.stats['errors'].append(f"Error finding orphaned studies: {e}")
            return []

    def delete_physical_file(self, file_path: str) -> bool:
        """
        Delete physical DICOM file from filesystem

        Args:
            file_path: Path to file

        Returns:
            True if deleted successfully
        """
        if not file_path or not os.path.exists(file_path):
            return False

        try:
            if self.dry_run:
                print(f"    [DRY-RUN] Would delete: {file_path}")
                return True
            else:
                os.remove(file_path)
                print(f"    ✓ Deleted file: {file_path}")
                return True
        except Exception as e:
            print(f"    ✗ Failed to delete {file_path}: {e}")
            self.stats['physical_files_failed'] += 1
            return False

    def delete_dicom_files(self, orphaned_files: List[Dict]) -> int:
        """
        Delete orphaned DICOM files from database and filesystem

        Returns:
            Number of files deleted
        """
        deleted_count = 0

        for file_info in orphaned_files:
            file_id = file_info['id']
            file_path = file_info['file_path']

            try:
                # Delete from database
                if self.dry_run:
                    print(f"  [DRY-RUN] Would delete dicom_file: {file_id}")
                else:
                    cursor = self.conn.cursor()
                    cursor.execute("DELETE FROM dicom_files WHERE id = %s", (file_id,))
                    self.conn.commit()
                    cursor.close()
                    print(f"  ✓ Deleted from DB: {file_id}")

                # Delete physical file
                if file_path:
                    if self.delete_physical_file(file_path):
                        self.stats['physical_files_deleted'] += 1
                        self.stats['physical_files_found'] += 1

                deleted_count += 1

            except Exception as e:
                self.stats['errors'].append(f"Error deleting dicom_file {file_id}: {e}")
                if not self.dry_run:
                    self.conn.rollback()

        self.stats['dicom_files_deleted'] = deleted_count
        return deleted_count

    def delete_studies(self, orphaned_studies: List[Dict]) -> int:
        """
        Delete orphaned studies from database

        Deletes from pacs_studies table, which will CASCADE delete to:
        - pacs_series (via FK constraint)
        - pacs_instances (via FK constraint)

        Returns:
            Number of studies deleted
        """
        deleted_count = 0

        for study_info in orphaned_studies:
            study_uid = study_info['study_instance_uid']

            try:
                if self.dry_run:
                    print(f"  [DRY-RUN] Would delete study: {study_uid}")
                else:
                    cursor = self.conn.cursor()
                    # Delete from pacs_studies (CASCADE will delete related pacs_series and pacs_instances)
                    cursor.execute("DELETE FROM pacs_studies WHERE study_instance_uid = %s", (study_uid,))
                    rows_deleted = cursor.rowcount
                    self.conn.commit()
                    cursor.close()

                    if rows_deleted > 0:
                        print(f"  ✓ Deleted study: {study_uid} (cascade to series & instances)")
                    else:
                        print(f"  ⚠ Study not found: {study_uid}")

                deleted_count += 1

            except Exception as e:
                self.stats['errors'].append(f"Error deleting study {study_uid}: {e}")
                if not self.dry_run:
                    self.conn.rollback()

        self.stats['studies_deleted'] = deleted_count
        return deleted_count

    def print_summary(self, orphaned_files: List[Dict], orphaned_studies: List[Dict]):
        """Print summary of orphaned data"""
        print("\n" + "="*80)
        print("ORPHANED DICOM DATA SUMMARY")
        print("="*80)

        print(f"\n📁 DICOM Files (not linked to any worklist): {len(orphaned_files)}")
        if orphaned_files:
            print("\nSample (first 10):")
            for i, f in enumerate(orphaned_files[:10], 1):
                size_mb = f['file_size'] / (1024*1024) if f['file_size'] else 0
                print(f"  {i}. Patient: {f['patient_name']:<20} | Size: {size_mb:.2f} MB | Created: {f['created_at']}")
                print(f"     Path: {f['file_path']}")

        print(f"\n📊 Studies (not linked to any worklist): {len(orphaned_studies)}")
        if orphaned_studies:
            print("\nSample (first 10):")
            for i, s in enumerate(orphaned_studies[:10], 1):
                print(f"  {i}. Patient: {s['patient_name']:<20} | Modality: {s['modality']:<5} | Date: {s['study_date']} | Created: {s['created_at']}")

        # Calculate total size
        total_size = sum(f['file_size'] or 0 for f in orphaned_files)
        print(f"\n💾 Total orphaned file size: {total_size / (1024*1024):.2f} MB ({total_size / (1024*1024*1024):.2f} GB)")
        print("="*80)

    def run(self):
        """Run cleanup process"""
        print("\n" + "="*80)
        print(f"DICOM CLEANUP SCRIPT - {'DRY RUN MODE' if self.dry_run else 'EXECUTE MODE'}")
        print("="*80)
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

        # Connect to database
        if not self.connect_db():
            return False

        try:
            # Step 1: Find orphaned data
            print("\n[1/3] Finding orphaned DICOM files...")
            orphaned_files = self.find_orphaned_dicom_files()
            print(f"      Found {len(orphaned_files)} orphaned DICOM files")

            print("\n[2/3] Finding orphaned studies...")
            orphaned_studies = self.find_orphaned_studies()
            print(f"      Found {len(orphaned_studies)} orphaned studies")

            # Print summary
            self.print_summary(orphaned_files, orphaned_studies)

            # Step 2: Confirm deletion (if not dry-run and not force)
            if not self.dry_run:
                total_items = len(orphaned_files) + len(orphaned_studies)
                if total_items == 0:
                    print("\n✓ No orphaned data found. Nothing to delete.")
                    return True

                print(f"\n⚠️  WARNING: About to DELETE {total_items} items (PERMANENT!)")
                print("   - This action CANNOT be undone")
                print("   - Physical files will be removed from disk")

                response = input("\nType 'DELETE' to confirm: ")
                if response != 'DELETE':
                    print("\n✗ Deletion cancelled by user")
                    return False

            # Step 3: Delete orphaned data
            if orphaned_files:
                print(f"\n[3/3] Deleting {len(orphaned_files)} orphaned DICOM files...")
                deleted = self.delete_dicom_files(orphaned_files)
                print(f"      {'Would delete' if self.dry_run else 'Deleted'} {deleted} DICOM files")

            if orphaned_studies:
                print(f"\n[3/3] Deleting {len(orphaned_studies)} orphaned studies...")
                deleted = self.delete_studies(orphaned_studies)
                print(f"      {'Would delete' if self.dry_run else 'Deleted'} {deleted} studies")

            # Print final stats
            print("\n" + "="*80)
            print("CLEANUP STATISTICS")
            print("="*80)
            print(f"DICOM Files:        {self.stats['dicom_files_found']} found, {self.stats['dicom_files_deleted']} deleted")
            print(f"Studies:            {self.stats['studies_found']} found, {self.stats['studies_deleted']} deleted")
            print(f"Physical Files:     {self.stats['physical_files_found']} found, {self.stats['physical_files_deleted']} deleted, {self.stats['physical_files_failed']} failed")
            print(f"Errors:             {len(self.stats['errors'])}")

            if self.stats['errors']:
                print("\nErrors encountered:")
                for err in self.stats['errors']:
                    print(f"  - {err}")

            print("="*80)
            print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

            if self.dry_run:
                print("\n💡 This was a DRY RUN. No data was actually deleted.")
                print("   Run with --execute to perform actual deletion.")
            else:
                print("\n✓ Cleanup completed successfully!")

            return True

        finally:
            self.close_db()


def main():
    parser = argparse.ArgumentParser(
        description='Cleanup orphaned DICOM files and studies',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Preview what would be deleted
  python cleanup_orphaned_dicom.py --dry-run

  # Delete orphaned data (with confirmation)
  python cleanup_orphaned_dicom.py --execute

  # Delete without confirmation (DANGEROUS!)
  python cleanup_orphaned_dicom.py --execute --force
        """
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--dry-run', action='store_true',
                      help='Preview what would be deleted without actually deleting')
    group.add_argument('--execute', action='store_true',
                      help='Actually delete orphaned data (PERMANENT!)')

    parser.add_argument('--force', action='store_true',
                       help='Skip confirmation prompt (use with --execute)')

    args = parser.parse_args()

    # Validate force flag
    if args.force and not args.execute:
        parser.error("--force can only be used with --execute")

    # Create and run cleanup
    dry_run = not args.execute
    cleanup = DicomCleanup(dry_run=dry_run)

    # Override confirmation if force is used
    if args.force and args.execute:
        print("\n⚠️  FORCE MODE: Skipping confirmation!\n")
        # Monkey patch to skip confirmation
        original_run = cleanup.run
        def run_without_confirm():
            cleanup.dry_run = False
            return original_run()
        cleanup.run = run_without_confirm

    success = cleanup.run()
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
