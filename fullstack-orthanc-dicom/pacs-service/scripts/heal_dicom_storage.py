#!/usr/bin/env python3
"""
Heal inconsistent DICOM storage.

This script scans every active storage location and performs two repairs:
1. For DICOM files that still reside under `dicom/` but no longer have a database record
   (including duplicate copies not mapped in DB), clean them up: hard-delete on local
   storage, archive to `deleted/<YYYYMMDD>/...` for remote storage.
2. For database records already marked as archived/deleted, ensure their files have been moved
   to the deleted prefix as well.

Usage:
  python scripts/heal_dicom_storage.py [--base-prefix dicom] [--dry-run]

Run inside the pacs-service container/venv so app modules and env vars are available.
"""

import argparse
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Set, Tuple
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

VENV_DIR = PROJECT_ROOT / ".venv"
VENV_SITE = VENV_DIR / "lib/python3.11/site-packages"
if VENV_SITE.exists() and str(VENV_SITE) not in sys.path:
    sys.path.insert(0, str(VENV_SITE))

from app.database import SessionLocal
from app.models.dicom_file import DicomFile
from app.models.storage_location import StorageLocation
from app.services.storage_adapter_manager import get_storage_adapter_manager
from app.services.dicom_storage_service_v2 import get_dicom_storage_service_v2


def log(msg: str) -> None:
    print(f"[heal] {msg}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-prefix",
        default="dicom/",
        help="Storage prefix to inspect for unsynchronized objects (default: dicom/).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List actions without modifying storage or database.",
    )
    parser.add_argument(
        "--skip-archived-records",
        action="store_true",
        help="Skip reprocessing database records already marked archived/deleted.",
    )
    parser.add_argument(
        "--max-keys",
        type=int,
        default=0,
        help="Optional cap on number of objects to scan per storage location (0 = no cap).",
    )
    return parser.parse_args()


def parse_storage_key(key: str) -> Optional[Tuple[str, str, str]]:
    """
    Extract (study_id, series_id, instance_id) from storage key.
    """
    if not key.startswith("dicom/"):
        return None
    parts = key.split("/")
    if len(parts) < 4:
        return None
    filename = parts[-1]
    if not filename.endswith(".dcm"):
        return None
    instance_id = filename[:-4]
    study_id = parts[1]
    series_id = parts[2]
    return study_id, series_id, instance_id


def normalize_key(key: str) -> str:
    """
    Normalize a storage key for comparisons (strip leading slash).
    """
    return key.lstrip("/")


def collect_expected_keys(
    db,
    base_prefix: str,
) -> Tuple[Set[str], Set[str]]:
    """
    Gather expected storage keys and known instance_ids from DB.
    Only considers non-archived/non-deleted records under base_prefix.
    """
    normalized_prefix = base_prefix.lstrip("/")
    if normalized_prefix and not normalized_prefix.endswith("/"):
        normalized_prefix += "/"

    expected_keys: Set[str] = set()
    known_instances: Set[str] = set()

    rows = db.query(
        DicomFile.file_path,
        DicomFile.instance_id,
        DicomFile.dicom_metadata,
        DicomFile.status,
    ).all()

    for file_path, instance_id, metadata, status in rows:
        known_instances.add(instance_id)
        if status in ("archived", "deleted"):
            continue

        candidates = []
        if file_path:
            candidates.append(file_path)
        sync_key = (metadata or {}).get("synchronized_storage_key")
        if sync_key:
            candidates.append(sync_key)

        for candidate in candidates:
            normalized = normalize_key(candidate)
            if normalized.startswith(normalized_prefix):
                expected_keys.add(normalized)

    return expected_keys, known_instances


async def list_all_keys(adapter, base_prefix: str, max_keys: int) -> List[str]:
    """
    Collect every key under base_prefix for the provided adapter.
    """
    adapter_type = adapter.get_adapter_type()

    if adapter_type == "local":
        base_path = Path(getattr(adapter, "base_path", "/var/lib/pacs/storage"))
        start_dir = base_path / base_prefix
        keys: List[str] = []
        if not start_dir.exists():
            return []
        for path in start_dir.rglob("*.dcm"):
            relative = path.relative_to(base_path).as_posix()
            keys.append(relative)
            if max_keys and len(keys) >= max_keys:
                break
        return keys

    if hasattr(adapter, "s3_client"):
        def _collect() -> List[str]:
            paginator = adapter.s3_client.get_paginator("list_objects_v2")
            kwargs = {"Bucket": adapter.bucket_name, "Prefix": base_prefix}
            keys: List[str] = []
            for page in paginator.paginate(**kwargs):
                for obj in page.get("Contents", []):
                    keys.append(obj["Key"])
                    if max_keys and len(keys) >= max_keys:
                        return keys
            return keys

        return await asyncio.to_thread(_collect)

    # Fallback: use adapter's list_files implementation
    limit = max_keys or 1_000_000
    return await adapter.list_files(prefix=base_prefix, limit=limit)


async def heal_db_archived_records(db, storage_service, dry_run: bool) -> int:
    """
    Ensure DB records already archived/deleted have their files moved accordingly.
    """
    archive_date = datetime.utcnow()
    records = db.query(DicomFile).filter(
        DicomFile.status.in_(["archived", "deleted"])
    ).all()

    repaired = 0
    for record in records:
        metadata = record.dicom_metadata or {}
        storage_key = metadata.get("synchronized_storage_key", record.file_path or "")
        if not storage_key or storage_key.startswith("deleted/"):
            continue

        if dry_run:
            log(f"[dry-run] would archive DB record {record.sop_instance_uid} (key={storage_key})")
            repaired += 1
            continue

        result = await storage_service.archive_dicom_file(
            record,
            archive_date,
            reason="heal_db_archived"
        )
        if result:
            repaired += 1

    return repaired


async def heal_orphan_files(
    db,
    storage_service,
    base_prefix: str,
    dry_run: bool,
    max_keys: int
) -> int:
    """
    Find storage objects not referenced by DB (including duplicates) and remove them.
    Local storage is hard-deleted; remote storage is archived under deleted/.
    """
    archive_date = datetime.utcnow()
    adapter_manager = get_storage_adapter_manager(db)
    locations = db.query(StorageLocation).filter(
        StorageLocation.is_active == True
    ).all()  # noqa: E712

    normalized_prefix = base_prefix.lstrip("/")
    if normalized_prefix and not normalized_prefix.endswith("/"):
        normalized_prefix += "/"

    expected_keys, known_instances = collect_expected_keys(db, normalized_prefix)
    moved = 0

    for location in locations:
        adapter = await adapter_manager.get_adapter(str(location.id))
        if not adapter:
            log(f"Skipping storage location {location.name}: adapter unavailable")
            continue

        keys = await list_all_keys(adapter, base_prefix, max_keys)
        log(f"Scanning {len(keys)} keys on {location.name} ({adapter.get_adapter_type()})")

        for key in keys:
            # Skip already archived or audit prefixes
            if key.startswith("deleted/") or "/audit/" in key:
                continue

            normalized_key = normalize_key(key)
            if normalized_prefix and not normalized_key.startswith(normalized_prefix):
                continue

            if normalized_key in expected_keys:
                continue

            parsed = parse_storage_key(key)
            reason = "no DB reference"
            instance_id = None
            if parsed:
                _, _, instance_id = parsed
                if instance_id in known_instances:
                    reason = "duplicate instance not mapped in DB"
            else:
                reason = "unrecognized path under base prefix"

            if dry_run:
                log(f"[dry-run] would delete orphan key {key} ({reason})")
                moved += 1
                continue

            adapter_type = adapter.get_adapter_type()
            if adapter_type == "local":
                # Hard delete for local orphan files
                deleted = await adapter.delete(key) # Direct deletion
                if deleted:
                    log(f"Deleted orphan {key} ({reason})")
                    moved += 1
                else:
                    log(f"Failed to delete orphan {key} ({reason})")
            else:
                # For remote, continue with archiving as before
                archive_key = f"deleted/{archive_date.strftime('%Y%m%d')}/{normalized_key}"
                result = await storage_service._archive_remote_file(adapter, key, archive_key)
                if result:
                    log(f"Archived orphan {key} -> {result} ({reason})")
                    moved += 1
                else:
                    log(f"Failed to archive orphan {key} ({reason})")

    return moved


async def main_async():
    args = parse_args()
    db = SessionLocal()
    try:
        storage_service = get_dicom_storage_service_v2(db)
        if not args.skip_archived_records:
            healed = await heal_db_archived_records(db, storage_service, args.dry_run)
            log(f"Archived {healed} database records marked as archived/deleted")
        orphaned = await heal_orphan_files(
            db,
            storage_service,
            args.base_prefix,
            args.dry_run,
            args.max_keys,
        )
        log(f"Removed {orphaned} orphaned storage objects (deleted local, archived remote)")
        if args.dry_run:
            log("Dry-run complete (no changes applied)")
    finally:
        db.close()


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
