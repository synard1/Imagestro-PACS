"""
Prometheus Metrics API
Exposes storage and PACS metrics for monitoring
"""

import logging
from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from prometheus_client import (
    Counter, Gauge, Histogram, Info,
    generate_latest, CONTENT_TYPE_LATEST, CollectorRegistry
)

from app.database import get_db
from app.models.dicom_file import DicomFile
from app.models.storage_location import StorageLocation
from app.services.storage_adapter_manager import get_storage_adapter_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/metrics", tags=["Metrics"])

# Create custom registry
registry = CollectorRegistry()

# ============================================================================
# Prometheus Metrics Definitions
# ============================================================================

# Storage Metrics
storage_total_size_gb = Gauge(
    'pacs_storage_total_size_gb',
    'Total storage size in GB',
    ['location_name', 'tier', 'adapter_type'],
    registry=registry
)

storage_used_size_gb = Gauge(
    'pacs_storage_used_size_gb',
    'Used storage size in GB',
    ['location_name', 'tier', 'adapter_type'],
    registry=registry
)

storage_usage_percentage = Gauge(
    'pacs_storage_usage_percentage',
    'Storage usage percentage',
    ['location_name', 'tier', 'adapter_type'],
    registry=registry
)

storage_file_count = Gauge(
    'pacs_storage_file_count',
    'Number of files in storage',
    ['location_name', 'tier', 'adapter_type'],
    registry=registry
)

storage_health_status = Gauge(
    'pacs_storage_health_status',
    'Storage health status (1=healthy, 0=unhealthy)',
    ['location_name', 'tier'],
    registry=registry
)

# DICOM File Metrics
dicom_files_total = Gauge(
    'pacs_dicom_files_total',
    'Total number of DICOM files',
    ['status', 'tier', 'modality'],
    registry=registry
)

dicom_files_size_bytes = Gauge(
    'pacs_dicom_files_size_bytes',
    'Total size of DICOM files in bytes',
    ['status', 'tier', 'modality'],
    registry=registry
)

dicom_upload_total = Counter(
    'pacs_dicom_upload_total',
    'Total DICOM uploads',
    ['tier', 'status'],
    registry=registry
)

dicom_download_total = Counter(
    'pacs_dicom_download_total',
    'Total DICOM downloads',
    ['tier'],
    registry=registry
)

dicom_compression_ratio = Gauge(
    'pacs_dicom_compression_ratio',
    'Average compression ratio',
    ['modality'],
    registry=registry
)

dicom_deduplication_saves_bytes = Counter(
    'pacs_dicom_deduplication_saves_bytes',
    'Bytes saved by deduplication',
    registry=registry
)

# Study Metrics
studies_total = Gauge(
    'pacs_studies_total',
    'Total number of studies',
    ['status'],
    registry=registry
)

studies_size_bytes = Gauge(
    'pacs_studies_size_bytes',
    'Total size of studies in bytes',
    registry=registry
)

# Performance Metrics
storage_operation_duration = Histogram(
    'pacs_storage_operation_duration_seconds',
    'Storage operation duration',
    ['operation', 'adapter_type'],
    registry=registry
)

# System Info
pacs_info = Info(
    'pacs_system',
    'PACS system information',
    registry=registry
)


# ============================================================================
# Metrics Collection Functions
# ============================================================================

def collect_storage_metrics(db: Session):
    """Collect storage location metrics"""
    try:
        locations = db.query(StorageLocation).all()

        for location in locations:
            labels = {
                'location_name': location.name,
                'tier': location.tier,
                'adapter_type': location.adapter_type or 'local'
            }

            # Total size
            if location.max_size_gb:
                storage_total_size_gb.labels(**labels).set(location.max_size_gb)

            # Used size
            storage_used_size_gb.labels(**labels).set(location.current_size_gb or 0)

            # Usage percentage
            storage_usage_percentage.labels(**labels).set(location.usage_percentage)

            # File count
            storage_file_count.labels(**labels).set(location.current_files or 0)

            # Health status
            health_labels = {
                'location_name': location.name,
                'tier': location.tier
            }
            storage_health_status.labels(**health_labels).set(
                1 if location.is_online else 0
            )

    except Exception as e:
        logger.error(f"Error collecting storage metrics: {e}")


def collect_dicom_file_metrics(db: Session):
    """Collect DICOM file metrics"""
    try:
        # Group by status, tier, modality
        results = db.query(
            DicomFile.status,
            DicomFile.storage_tier,
            DicomFile.modality,
            func.count(DicomFile.id).label('count'),
            func.sum(DicomFile.file_size).label('total_size')
        ).group_by(
            DicomFile.status,
            DicomFile.storage_tier,
            DicomFile.modality
        ).all()

        for result in results:
            status = result.status or 'unknown'
            tier = result.storage_tier or 'unknown'
            modality = result.modality or 'unknown'

            labels = {
                'status': status,
                'tier': tier,
                'modality': modality
            }

            dicom_files_total.labels(**labels).set(result.count)
            dicom_files_size_bytes.labels(**labels).set(result.total_size or 0)

        # Compression ratio by modality
        compression_stats = db.query(
            DicomFile.modality,
            func.avg(DicomFile.compression_ratio).label('avg_ratio')
        ).filter(
            DicomFile.is_compressed == True,
            DicomFile.compression_ratio.isnot(None)
        ).group_by(DicomFile.modality).all()

        for stat in compression_stats:
            modality = stat.modality or 'unknown'
            dicom_compression_ratio.labels(modality=modality).set(stat.avg_ratio or 1.0)

    except Exception as e:
        logger.error(f"Error collecting DICOM file metrics: {e}")


def collect_study_metrics(db: Session):
    """Collect study metrics"""
    try:
        # Import here to avoid circular dependency
        from app.models.study import Study

        # Total studies (without grouping by status as it doesn't exist)
        total_count = db.query(func.count(Study.study_instance_uid)).scalar()
        studies_total.labels(status='active').set(total_count or 0)

        # Total studies size
        total_size = db.query(
            func.sum(Study.storage_size)
        ).scalar()

        if total_size:
            studies_size_bytes.set(total_size)

    except Exception as e:
        logger.error(f"Error collecting study metrics: {e}")


def collect_system_info():
    """Collect system information"""
    try:
        import psutil
        import platform

        pacs_info.info({
            'version': '1.0.0',
            'python_version': platform.python_version(),
            'platform': platform.platform(),
            'cpu_count': str(psutil.cpu_count()),
            'total_memory_gb': str(round(psutil.virtual_memory().total / (1024**3), 2))
        })

    except Exception as e:
        logger.error(f"Error collecting system info: {e}")


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("")
async def get_prometheus_metrics(db: Session = Depends(get_db)):
    """
    Get Prometheus metrics in exposition format

    Returns:
        Prometheus metrics
    """
    try:
        # Collect all metrics
        collect_storage_metrics(db)
        collect_dicom_file_metrics(db)
        collect_study_metrics(db)
        collect_system_info()

        # Generate metrics output
        metrics_output = generate_latest(registry)

        return Response(
            content=metrics_output,
            media_type=CONTENT_TYPE_LATEST
        )

    except Exception as e:
        logger.error(f"Error generating metrics: {e}", exc_info=True)
        return Response(
            content=f"# Error generating metrics: {str(e)}",
            media_type=CONTENT_TYPE_LATEST
        )


@router.get("/json")
async def get_metrics_json(db: Session = Depends(get_db)):
    """
    Get metrics in JSON format

    Returns:
        Metrics as JSON
    """
    try:
        metrics = {
            'storage': {},
            'dicom_files': {},
            'studies': {},
            'system': {},
            'timestamp': datetime.now().isoformat()
        }

        # Storage metrics
        locations = db.query(StorageLocation).all()
        metrics['storage']['locations'] = []

        for location in locations:
            metrics['storage']['locations'].append({
                'name': location.name,
                'tier': location.tier,
                'adapter_type': location.adapter_type,
                'total_size_gb': location.max_size_gb,
                'used_size_gb': location.current_size_gb,
                'usage_percentage': location.usage_percentage,
                'file_count': location.current_files,
                'is_online': location.is_online,
                'is_active': location.is_active
            })

        # DICOM file metrics
        file_stats = db.query(
            DicomFile.status,
            DicomFile.storage_tier,
            func.count(DicomFile.id).label('count'),
            func.sum(DicomFile.file_size).label('total_size')
        ).group_by(
            DicomFile.status,
            DicomFile.storage_tier
        ).all()

        metrics['dicom_files']['by_status_tier'] = [
            {
                'status': stat.status,
                'tier': stat.storage_tier,
                'count': stat.count,
                'total_size_bytes': stat.total_size or 0
            }
            for stat in file_stats
        ]

        # Modality distribution
        modality_stats = db.query(
            DicomFile.modality,
            func.count(DicomFile.id).label('count'),
            func.sum(DicomFile.file_size).label('total_size')
        ).filter(
            DicomFile.status == 'active'
        ).group_by(DicomFile.modality).all()

        metrics['dicom_files']['by_modality'] = [
            {
                'modality': stat.modality,
                'count': stat.count,
                'total_size_bytes': stat.total_size or 0
            }
            for stat in modality_stats
        ]

        # Compression stats
        compression_stats = db.query(
            func.count(DicomFile.id).label('compressed_count'),
            func.avg(DicomFile.compression_ratio).label('avg_ratio'),
            func.sum(DicomFile.original_size - DicomFile.file_size).label('space_saved')
        ).filter(
            DicomFile.is_compressed == True,
            DicomFile.status == 'active'
        ).first()

        if compression_stats:
            metrics['dicom_files']['compression'] = {
                'compressed_files': compression_stats.compressed_count or 0,
                'average_ratio': float(compression_stats.avg_ratio or 1.0),
                'space_saved_bytes': compression_stats.space_saved or 0
            }

        # Study metrics
        try:
            from app.models.study import Study

            study_count = db.query(func.count(Study.id)).scalar()
            total_study_size = db.query(func.sum(Study.storage_size)).scalar()

            metrics['studies'] = {
                'total_count': study_count or 0,
                'total_size_bytes': total_study_size or 0
            }
        except Exception:
            pass

        # System metrics
        try:
            import psutil

            metrics['system'] = {
                'cpu_percent': psutil.cpu_percent(interval=1),
                'memory_percent': psutil.virtual_memory().percent,
                'disk_usage_percent': psutil.disk_usage('/').percent
            }
        except Exception:
            pass

        return metrics

    except Exception as e:
        logger.error(f"Error generating JSON metrics: {e}", exc_info=True)
        return {'error': str(e)}


@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint

    Returns:
        Health status
    """
    try:
        # Check database
        db.execute("SELECT 1")

        # Check storage locations
        locations = db.query(StorageLocation).filter(
            StorageLocation.is_active == True
        ).all()

        healthy_locations = sum(1 for loc in locations if loc.is_online)
        total_locations = len(locations)

        return {
            'status': 'healthy' if healthy_locations > 0 else 'degraded',
            'database': 'connected',
            'storage_locations': {
                'total': total_locations,
                'healthy': healthy_locations,
                'unhealthy': total_locations - healthy_locations
            },
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return {
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }
