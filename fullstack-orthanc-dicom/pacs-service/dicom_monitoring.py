"""
DICOM-Specific Metrics & Pipeline Tracking
Monitor DICOM workflows, processing stages, modality-specific metrics

Features:
- Track DICOM studies by modality (CT, MR, XR, US, etc)
- Monitor processing pipeline stages
- Study size analysis and tracking
- Modality-specific performance metrics
- DICOM compliance and validation metrics
"""

import time
import logging
from datetime import datetime
from typing import Optional, Dict, List
from enum import Enum
from collections import defaultdict

from prometheus_client import Counter, Histogram, Gauge

logger = logging.getLogger(__name__)

# ============================================================================
# DICOM MODALITY TYPES
# ============================================================================

class DIOMModality(str, Enum):
    """DICOM Modalities"""
    CT = "CT"      # Computed Tomography
    MR = "MR"      # Magnetic Resonance
    XR = "XR"      # X-Ray / Radiography
    US = "US"      # Ultrasound
    DX = "DX"      # Digital Radiography
    MG = "MG"      # Mammography
    PT = "PT"      # Positron Emission Tomography
    NM = "NM"      # Nuclear Medicine
    OT = "OT"      # Other
    UNKNOWN = "UNKNOWN"

class ProcessingStage(str, Enum):
    """DICOM Processing Pipeline Stages"""
    RECEIVED = "received"
    VALIDATED = "validated"
    INDEXED = "indexed"
    STORED = "stored"
    ARCHIVED = "archived"
    FAILED = "failed"

# ============================================================================
# DICOM METRICS
# ============================================================================

# Study processing metrics
dicom_studies_received_total = Counter(
    'dicom_studies_received_total',
    'Total DICOM studies received',
    ['modality', 'source', 'service']
)

dicom_studies_processed_total = Counter(
    'dicom_studies_processed_total',
    'Total DICOM studies successfully processed',
    ['modality', 'status', 'service']
)

dicom_studies_failed_total = Counter(
    'dicom_studies_failed_total',
    'Total DICOM studies failed processing',
    ['modality', 'failure_reason', 'service']
)

dicom_processing_stage_duration_seconds = Histogram(
    'dicom_processing_stage_duration_seconds',
    'Duration of each DICOM processing stage',
    ['modality', 'stage', 'service'],
    buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 25.0, 50.0, 100.0)
)

# Study size metrics
dicom_study_size_bytes = Histogram(
    'dicom_study_size_bytes',
    'Size of DICOM studies',
    ['modality', 'service'],
    buckets=(1000000, 10000000, 50000000, 100000000, 500000000, 1000000000)  # 1MB to 1GB
)

dicom_series_per_study = Histogram(
    'dicom_series_per_study',
    'Number of series per study',
    ['modality', 'service'],
    buckets=(1, 5, 10, 20, 50, 100)
)

dicom_instances_per_series = Histogram(
    'dicom_instances_per_series',
    'Number of instances per series',
    ['modality', 'service'],
    buckets=(1, 10, 50, 100, 500, 1000)
)

# Performance metrics by modality
dicom_processing_speed_instances_per_second = Gauge(
    'dicom_processing_speed_instances_per_second',
    'Processing speed (instances per second)',
    ['modality', 'service']
)

dicom_modality_avg_latency_seconds = Gauge(
    'dicom_modality_avg_latency_seconds',
    'Average latency per modality',
    ['modality', 'service']
)

# Storage metrics
dicom_storage_usage_bytes = Gauge(
    'dicom_storage_usage_bytes',
    'Total DICOM storage usage',
    ['modality', 'service']
)

dicom_storage_available_bytes = Gauge(
    'dicom_storage_available_bytes',
    'Available DICOM storage',
    ['service']
)

dicom_compression_ratio = Gauge(
    'dicom_compression_ratio',
    'Compression ratio for DICOM storage',
    ['modality', 'service']
)

# Quality metrics
dicom_validation_failures_total = Counter(
    'dicom_validation_failures_total',
    'DICOM validation failures',
    ['modality', 'failure_type', 'service']
)

dicom_pixel_data_issues_total = Counter(
    'dicom_pixel_data_issues_total',
    'Issues with DICOM pixel data',
    ['modality', 'issue_type', 'service']
)

# Transfer metrics
dicom_network_transfer_bytes = Counter(
    'dicom_network_transfer_bytes',
    'Total bytes transferred (DICOM)',
    ['modality', 'direction', 'service']  # direction: 'inbound', 'outbound'
)

dicom_transfer_errors_total = Counter(
    'dicom_transfer_errors_total',
    'DICOM transfer errors',
    ['modality', 'error_type', 'service']
)

# ============================================================================
# DICOM PROCESSING TRACKER
# ============================================================================

class DIOMProcessingTracker:
    """Track DICOM studies through processing pipeline"""
    
    def __init__(self):
        self.studies: Dict[str, dict] = {}
        self.modality_stats: Dict[str, dict] = defaultdict(lambda: {
            'received': 0,
            'processed': 0,
            'failed': 0,
            'total_duration': 0.0,
            'durations': [],
            'total_size': 0,
            'sizes': [],
        })
    
    def start_study(self, study_id: str, modality: str, source: str = 'PACS'):
        """Mark study as received"""
        self.studies[study_id] = {
            'study_id': study_id,
            'modality': modality,
            'source': source,
            'received_at': time.time(),
            'stages': {},
            'size_bytes': 0,
            'series_count': 0,
            'instance_count': 0,
            'status': 'received',
        }
        
        self.modality_stats[modality]['received'] += 1
        
        logger.info(f"DICOM study started: {study_id} ({modality})")
    
    def record_stage(self, study_id: str, stage: str, duration: float, success: bool = True):
        """Record completion of processing stage"""
        
        if study_id not in self.studies:
            return
        
        study = self.studies[study_id]
        study['stages'][stage] = {
            'duration': duration,
            'completed_at': datetime.utcnow().isoformat(),
            'success': success,
        }
        
        if success:
            study['status'] = stage
            
            dicom_processing_stage_duration_seconds.labels(
                modality=study['modality'],
                stage=stage,
                service='pacs-service'
            ).observe(duration)
    
    def complete_study(self, study_id: str, size_bytes: int, series_count: int, instance_count: int, status: str = 'stored'):
        """Mark study as complete"""
        
        if study_id not in self.studies:
            return
        
        study = self.studies[study_id]
        total_duration = time.time() - study['received_at']
        
        study['size_bytes'] = size_bytes
        study['series_count'] = series_count
        study['instance_count'] = instance_count
        study['status'] = status
        study['total_duration'] = total_duration
        
        # Update statistics
        modality = study['modality']
        stats = self.modality_stats[modality]
        stats['processed'] += 1
        stats['total_duration'] += total_duration
        stats['durations'].append(total_duration)
        stats['total_size'] += size_bytes
        stats['sizes'].append(size_bytes)
        
        # Record metrics
        dicom_studies_processed_total.labels(
            modality=modality,
            status=status,
            service='pacs-service'
        ).inc()
        
        dicom_study_size_bytes.labels(
            modality=modality,
            service='pacs-service'
        ).observe(size_bytes)
        
        dicom_series_per_study.labels(
            modality=modality,
            service='pacs-service'
        ).observe(series_count)
        
        dicom_instances_per_series.labels(
            modality=modality,
            service='pacs-service'
        ).observe(instance_count // max(series_count, 1))
        
        logger.info(
            f"DICOM study completed: {study_id} ({modality}) - {size_bytes/1e6:.1f}MB, {instance_count} instances, {total_duration:.2f}s"
        )
    
    def fail_study(self, study_id: str, reason: str):
        """Mark study as failed"""
        
        if study_id not in self.studies:
            return
        
        study = self.studies[study_id]
        modality = study['modality']
        
        self.modality_stats[modality]['failed'] += 1
        study['status'] = 'failed'
        study['failure_reason'] = reason
        
        dicom_studies_failed_total.labels(
            modality=modality,
            failure_reason=reason,
            service='pacs-service'
        ).inc()
        
        logger.error(f"DICOM study failed: {study_id} ({modality}) - {reason}")
    
    def get_modality_stats(self) -> Dict[str, dict]:
        """Get statistics by modality"""
        
        result = {}
        for modality, stats in self.modality_stats.items():
            durations = stats['durations']
            durations_sorted = sorted(durations) if durations else []
            
            result[modality] = {
                'total_received': stats['received'],
                'total_processed': stats['processed'],
                'total_failed': stats['failed'],
                'success_rate_percent': (stats['processed'] / stats['received'] * 100) if stats['received'] > 0 else 0,
                'avg_processing_duration_seconds': (stats['total_duration'] / stats['processed']) if stats['processed'] > 0 else 0,
                'avg_study_size_mb': (stats['total_size'] / stats['processed'] / 1e6) if stats['processed'] > 0 else 0,
                'p95_duration_seconds': durations_sorted[int(len(durations_sorted) * 0.95)] if len(durations_sorted) > 0 else 0,
                'p99_duration_seconds': durations_sorted[int(len(durations_sorted) * 0.99)] if len(durations_sorted) > 0 else 0,
            }
        
        return result

# Global tracker
dicom_tracker = DIOMProcessingTracker()

# ============================================================================
# DIAGNOSTIC ENDPOINTS
# ============================================================================

def setup_dicom_diagnostics(app):
    """Add DICOM diagnostic endpoints"""
    
    @app.get("/api/diagnostics/dicom/modality-stats", tags=["monitoring", "dicom"])
    async def dicom_modality_stats():
        """Get DICOM statistics by modality"""
        
        stats = dicom_tracker.get_modality_stats()
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'by_modality': stats
        }
    
    @app.get("/api/diagnostics/dicom/studies/{study_id}", tags=["monitoring", "dicom"])
    async def dicom_study_details(study_id: str):
        """Get details of specific study"""
        
        if study_id not in dicom_tracker.studies:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail=f"Study {study_id} not found")
        
        study = dicom_tracker.studies[study_id]
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'study': study
        }
    
    @app.get("/api/diagnostics/dicom/performance", tags=["monitoring", "dicom"])
    async def dicom_performance():
        """Get DICOM processing performance metrics"""
        
        stats = dicom_tracker.get_modality_stats()
        
        performance = {}
        for modality, stat in stats.items():
            if stat['avg_processing_duration_seconds'] > 0:
                instances_per_study = 100  # Example, should be calculated
                speed = instances_per_study / stat['avg_processing_duration_seconds']
                performance[modality] = {
                    'avg_duration_seconds': stat['avg_processing_duration_seconds'],
                    'estimated_instances_per_second': speed,
                    'success_rate_percent': stat['success_rate_percent'],
                }
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'modality_performance': performance
        }
    
    logger.info("DICOM diagnostics endpoints registered")
