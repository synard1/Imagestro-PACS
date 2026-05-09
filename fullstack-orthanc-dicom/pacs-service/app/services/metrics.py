"""
Metrics Collection Service
Track system metrics and statistics for monitoring
"""

import logging
from datetime import datetime, timedelta
from typing import Dict
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class MetricsService:
    """System metrics collection and reporting"""
    
    def get_system_metrics(self, db: Session) -> Dict:
        """
        Get comprehensive system metrics
        
        Returns:
            dict with system metrics
        """
        try:
            metrics = {
                "timestamp": datetime.now().isoformat(),
                "storage": self._get_storage_metrics(db),
                "dicom": self._get_dicom_metrics(db),
                "performance": self._get_performance_metrics(db)
            }
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error collecting metrics: {e}", exc_info=True)
            return {
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    def _get_storage_metrics(self, db: Session) -> Dict:
        """Get storage-related metrics"""
        try:
            metrics = {}
            
            # Total DICOM files
            try:
                result = db.execute(text("SELECT COUNT(*) FROM dicom_files"))
                metrics["total_files"] = result.scalar() or 0
            except:
                metrics["total_files"] = 0
            
            # Total storage size
            try:
                result = db.execute(text("SELECT SUM(file_size) FROM dicom_files"))
                total_bytes = result.scalar() or 0
                metrics["total_size_gb"] = round(total_bytes / (1024**3), 2)
            except:
                metrics["total_size_gb"] = 0
            
            # Files by modality
            try:
                result = db.execute(text("""
                    SELECT modality, COUNT(*) as count
                    FROM dicom_files
                    GROUP BY modality
                    ORDER BY count DESC
                    LIMIT 10
                """))
                metrics["by_modality"] = [
                    {"modality": row[0] or "Unknown", "count": row[1]}
                    for row in result
                ]
            except:
                metrics["by_modality"] = []
            
            # Recent uploads (last 24h)
            try:
                result = db.execute(text("""
                    SELECT COUNT(*)
                    FROM dicom_files
                    WHERE created_at > NOW() - INTERVAL '24 hours'
                """))
                metrics["uploads_24h"] = result.scalar() or 0
            except:
                metrics["uploads_24h"] = 0
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error getting storage metrics: {e}")
            return {"error": str(e)}
    
    def _get_dicom_metrics(self, db: Session) -> Dict:
        """Get DICOM operation metrics"""
        try:
            metrics = {}
            
            # Total nodes
            try:
                result = db.execute(text("SELECT COUNT(*) FROM dicom_nodes"))
                metrics["total_nodes"] = result.scalar() or 0
            except:
                metrics["total_nodes"] = 0
            
            # Active nodes
            try:
                result = db.execute(text("""
                    SELECT COUNT(*)
                    FROM dicom_nodes
                    WHERE is_active = TRUE
                """))
                metrics["active_nodes"] = result.scalar() or 0
            except:
                metrics["active_nodes"] = 0
            
            # Online nodes
            try:
                result = db.execute(text("""
                    SELECT COUNT(*)
                    FROM dicom_nodes
                    WHERE is_online = TRUE
                """))
                metrics["online_nodes"] = result.scalar() or 0
            except:
                metrics["online_nodes"] = 0
            
            # Operations (if table exists)
            try:
                result = db.execute(text("""
                    SELECT COUNT(*)
                    FROM dicom_operations
                    WHERE created_at > NOW() - INTERVAL '24 hours'
                """))
                metrics["operations_24h"] = result.scalar() or 0
            except:
                metrics["operations_24h"] = 0
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error getting DICOM metrics: {e}")
            return {"error": str(e)}
    
    def _get_performance_metrics(self, db: Session) -> Dict:
        """Get performance metrics"""
        try:
            metrics = {}
            
            # Average file size
            try:
                result = db.execute(text("""
                    SELECT AVG(file_size)
                    FROM dicom_files
                    WHERE file_size > 0
                """))
                avg_bytes = result.scalar() or 0
                metrics["avg_file_size_mb"] = round(avg_bytes / (1024**2), 2)
            except:
                metrics["avg_file_size_mb"] = 0
            
            # Files per patient (top 10)
            try:
                result = db.execute(text("""
                    SELECT patient_id, COUNT(*) as count
                    FROM dicom_files
                    WHERE patient_id IS NOT NULL
                    GROUP BY patient_id
                    ORDER BY count DESC
                    LIMIT 10
                """))
                metrics["top_patients"] = [
                    {"patient_id": row[0], "file_count": row[1]}
                    for row in result
                ]
            except:
                metrics["top_patients"] = []
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error getting performance metrics: {e}")
            return {"error": str(e)}


# Singleton instance
_metrics_service = None

def get_metrics_service() -> MetricsService:
    """Get singleton metrics service instance"""
    global _metrics_service
    if _metrics_service is None:
        _metrics_service = MetricsService()
    return _metrics_service
