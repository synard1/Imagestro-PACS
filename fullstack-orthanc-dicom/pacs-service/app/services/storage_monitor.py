"""
Storage Monitor Service - Complete Version
Real-time storage monitoring with alerts and historical tracking
Requirements: 1.1, 1.2, 1.3, 1.5
"""

import os
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func, text, desc

from app.models.storage_stats import StorageStats, StorageHistory, StorageByModality, StorageAlert
from app.models.study import Study
from app.models.series import Series
from app.models.instance import Instance
from app.models.dicom_file import DicomFile

logger = logging.getLogger(__name__)

# Alert thresholds
WARNING_THRESHOLD = Decimal("80.00")
CRITICAL_THRESHOLD = Decimal("90.00")


class StorageMonitorService:
    """
    Service for monitoring storage usage, generating alerts, and tracking history.
    
    Implements Requirements:
    - 1.1: Display storage usage dashboard
    - 1.2: Warning alert at 80%
    - 1.3: Critical notification at 90%
    - 1.4: Store history for trend analysis
    - 1.5: Storage usage per modality and time period
    """
    
    def __init__(self, db: Session):
        """
        Initialize storage monitor service
        
        Args:
            db: Database session
        """
        self.db = db
        self.storage_path = os.getenv('STORAGE_PATH', '/var/lib/pacs/storage')
    
    def get_storage_stats(self) -> Dict[str, Any]:
        """
        Get current storage statistics.
        Calculates total, used, and available space.
        
        Returns:
            Dictionary with storage statistics including:
            - total_bytes: Total storage capacity
            - used_bytes: Used storage
            - available_bytes: Available storage
            - usage_percentage: Usage as percentage
            - total_studies, total_series, total_instances: Counts
        
        Validates: Requirements 1.1
        """
        try:
            # Get filesystem stats
            if os.path.exists(self.storage_path):
                stat = os.statvfs(self.storage_path)
                total_bytes = stat.f_blocks * stat.f_frsize
                available_bytes = stat.f_bavail * stat.f_frsize
                used_bytes = total_bytes - available_bytes
            else:
                # Fallback: calculate from database
                total_bytes = int(os.getenv('STORAGE_TOTAL_BYTES', 1099511627776))  # 1TB default
                used_bytes = self._get_used_bytes_from_db()
                available_bytes = total_bytes - used_bytes
            
            # Calculate usage percentage
            if total_bytes > 0:
                usage_percentage = Decimal(str((used_bytes / total_bytes) * 100)).quantize(Decimal("0.01"))
            else:
                usage_percentage = Decimal("0.00")
            
            # Get counts from database
            total_studies = self.db.query(func.count(Study.study_instance_uid)).filter(
                Study.deleted_at.is_(None)
            ).scalar() or 0
            
            total_series = self.db.query(func.count(Series.series_instance_uid)).scalar() or 0
            total_instances = self.db.query(func.count(Instance.sop_instance_uid)).scalar() or 0
            
            stats = {
                "total_bytes": total_bytes,
                "used_bytes": used_bytes,
                "available_bytes": available_bytes,
                "usage_percentage": float(usage_percentage),
                "total_studies": total_studies,
                "total_series": total_series,
                "total_instances": total_instances,
                "last_updated": datetime.utcnow().isoformat()
            }
            
            logger.info(f"Storage stats: {usage_percentage}% used ({used_bytes}/{total_bytes} bytes)")
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get storage stats: {str(e)}")
            raise
    
    def _get_used_bytes_from_db(self) -> int:
        """Calculate used bytes from database records"""
        try:
            result = self.db.query(func.sum(Study.storage_size)).filter(
                Study.deleted_at.is_(None)
            ).scalar()
            return result or 0
        except Exception:
            return 0
    
    def get_storage_history(self, days: int = 30) -> List[Dict[str, Any]]:
        """
        Get historical storage data for trend analysis.
        
        Args:
            days: Number of days of history to retrieve (default: 30)
            
        Returns:
            List of historical storage records
            
        Validates: Requirements 1.4
        """
        try:
            start_date = datetime.utcnow() - timedelta(days=days)
            
            history = self.db.query(StorageHistory).filter(
                StorageHistory.recorded_at >= start_date
            ).order_by(desc(StorageHistory.recorded_at)).all()
            
            return [record.to_dict() for record in history]
            
        except Exception as e:
            logger.error(f"Failed to get storage history: {str(e)}")
            raise
    
    def get_storage_by_modality(self) -> Dict[str, Dict[str, Any]]:
        """
        Get storage usage breakdown by modality.
        
        Returns:
            Dictionary with modality as key and usage stats as value
            
        Validates: Requirements 1.5
        """
        try:
            # Method 1: Try direct SQL query first (most reliable)
            try:
                query = text("""
                    SELECT 
                        s.modality,
                        COUNT(DISTINCT s.study_instance_uid) as study_count,
                        COUNT(DISTINCT ser.series_instance_uid) as series_count,
                        COUNT(DISTINCT df.id) as instance_count,
                        COALESCE(SUM(df.file_size), 0) as total_size_bytes
                    FROM pacs_studies s
                    LEFT JOIN pacs_series ser ON ser.study_instance_uid = s.study_instance_uid
                    LEFT JOIN dicom_files df ON df.study_id = s.study_instance_uid
                    WHERE s.deleted_at IS NULL
                    AND s.modality IS NOT NULL
                    GROUP BY s.modality
                    ORDER BY s.modality
                """)
                
                result = self.db.execute(query).fetchall()
                
                if result:
                    modality_stats = {}
                    for row in result:
                        modality = row[0] or 'UNKNOWN'
                        total_size_bytes = int(row[4] or 0)
                        
                        modality_stats[modality] = {
                            "modality": modality,
                            "study_count": int(row[1] or 0),
                            "series_count": int(row[2] or 0),
                            "instance_count": int(row[3] or 0),
                            "total_size_bytes": total_size_bytes,
                            "total_size_mb": total_size_bytes / (1024 * 1024),
                            "total_size_gb": total_size_bytes / (1024 * 1024 * 1024)
                        }
                    return modality_stats
                    
            except Exception as e:
                logger.warning(f"Direct SQL query failed, trying alternative method: {e}")
            
            # Method 2: Try aggregation from Study table
            try:
                results = self.db.query(
                    Study.modality,
                    func.count(Study.study_instance_uid).label('study_count'),
                    func.sum(Study.number_of_series).label('series_count'),
                    func.sum(Study.number_of_instances).label('instance_count'),
                    func.sum(Study.storage_size).label('total_size_bytes')
                ).filter(
                    Study.deleted_at.is_(None),
                    Study.modality.isnot(None)
                ).group_by(Study.modality).all()
                
                if results:
                    modality_stats = {}
                    for row in results:
                        modality = row.modality or 'UNKNOWN'
                        modality_stats[modality] = {
                            "modality": modality,
                            "study_count": row.study_count or 0,
                            "series_count": row.series_count or 0,
                            "instance_count": row.instance_count or 0,
                            "total_size_bytes": row.total_size_bytes or 0,
                            "total_size_mb": (row.total_size_bytes or 0) / (1024 * 1024),
                            "total_size_gb": (row.total_size_bytes or 0) / (1024 * 1024 * 1024)
                        }
                    return modality_stats
                    
            except Exception as e:
                logger.warning(f"Study aggregation failed, trying file system method: {e}")
            
            # Method 3: Calculate from file system as fallback
            results = self.db.query(
                Study.modality,
                func.count(Study.study_instance_uid).label('study_count'),
                func.count(Series.series_instance_uid).label('series_count'),
                func.count(Instance.sop_instance_uid).label('instance_count')
            ).outerjoin(
                Series
            ).outerjoin(
                Instance
            ).filter(
                Study.deleted_at.is_(None),
                Study.modality.isnot(None)
            ).group_by(Study.modality).all()
            
            # Calculate actual file sizes from file system
            modality_stats = {}
            
            for row in results:
                modality = row.modality or 'UNKNOWN'
                
                # Get file paths for instances in this modality
                instance_paths = self.db.query(Instance.file_path).join(
                    Series
                ).join(
                    Study
                ).filter(
                    Study.deleted_at.is_(None),
                    Study.modality == modality,
                    Instance.file_path.isnot(None)
                ).all()
                
                # Calculate actual file sizes
                total_size_bytes = 0
                actual_file_count = 0
                
                for path_result in instance_paths:
                    file_path = path_result.file_path
                    if file_path:
                        # Convert relative path to absolute if needed
                        if not file_path.startswith('/'):
                            file_path = f"{self.storage_path}/{file_path}"
                        
                        if os.path.exists(file_path):
                            try:
                                file_size = os.path.getsize(file_path)
                                total_size_bytes += file_size
                                actual_file_count += 1
                            except OSError as e:
                                logger.warning(f"Could not get file size for {file_path}: {e}")
                
                modality_stats[modality] = {
                    "modality": modality,
                    "study_count": row.study_count or 0,
                    "series_count": row.series_count or 0,
                    "instance_count": row.instance_count or 0,
                    "total_size_bytes": total_size_bytes,
                    "total_size_mb": total_size_bytes / (1024 * 1024),
                    "total_size_gb": total_size_bytes / (1024 * 1024 * 1024)
                }
            
            return modality_stats
            
        except Exception as e:
            logger.error(f"Failed to get storage by modality: {str(e)}")
            raise
    
    def check_thresholds(self) -> List[Dict[str, Any]]:
        """
        Check storage thresholds and return active alerts.
        Creates new alerts if thresholds are exceeded.
        
        Returns:
            List of active alerts (warning at 80%, critical at 90%)
            
        Validates: Requirements 1.2, 1.3
        """
        try:
            stats = self.get_storage_stats()
            usage_percentage = Decimal(str(stats["usage_percentage"]))
            alerts = []
            
            # Check critical threshold (90%)
            if usage_percentage >= CRITICAL_THRESHOLD:
                alert = self._create_or_get_alert(
                    alert_type="critical",
                    threshold=CRITICAL_THRESHOLD,
                    current=usage_percentage,
                    message=f"CRITICAL: Storage usage at {usage_percentage}%. Immediate action required!"
                )
                if alert:
                    alerts.append(alert)
            
            # Check warning threshold (80%)
            elif usage_percentage >= WARNING_THRESHOLD:
                alert = self._create_or_get_alert(
                    alert_type="warning",
                    threshold=WARNING_THRESHOLD,
                    current=usage_percentage,
                    message=f"WARNING: Storage usage at {usage_percentage}%. Consider cleanup or expansion."
                )
                if alert:
                    alerts.append(alert)
            else:
                # Deactivate any existing alerts if usage is below thresholds
                self._deactivate_alerts()
            
            # Also return any existing active alerts
            active_alerts = self.db.query(StorageAlert).filter(
                StorageAlert.is_active == True
            ).order_by(desc(StorageAlert.created_at)).all()
            
            return [alert.to_dict() for alert in active_alerts]
            
        except Exception as e:
            logger.error(f"Failed to check thresholds: {str(e)}")
            raise
    
    def _create_or_get_alert(
        self, 
        alert_type: str, 
        threshold: Decimal, 
        current: Decimal, 
        message: str
    ) -> Optional[StorageAlert]:
        """Create a new alert or return existing active alert"""
        try:
            # Check if there's already an active alert of this type
            existing = self.db.query(StorageAlert).filter(
                StorageAlert.alert_type == alert_type,
                StorageAlert.is_active == True
            ).first()
            
            if existing:
                # Update current percentage
                existing.current_percentage = current
                self.db.commit()
                return existing
            
            # Create new alert
            alert = StorageAlert(
                alert_type=alert_type,
                threshold_percentage=threshold,
                current_percentage=current,
                message=message,
                is_active=True
            )
            self.db.add(alert)
            self.db.commit()
            
            logger.warning(f"Storage alert created: {alert_type} at {current}%")
            return alert
            
        except Exception as e:
            logger.error(f"Failed to create alert: {str(e)}")
            self.db.rollback()
            return None
    
    def _deactivate_alerts(self):
        """Deactivate all active alerts when usage is below thresholds"""
        try:
            self.db.query(StorageAlert).filter(
                StorageAlert.is_active == True
            ).update({"is_active": False})
            self.db.commit()
        except Exception as e:
            logger.error(f"Failed to deactivate alerts: {str(e)}")
            self.db.rollback()
    
    def record_storage_snapshot(self) -> StorageHistory:
        """
        Record current storage stats to history table.
        Should be called periodically (e.g., hourly via cron).
        
        Returns:
            Created StorageHistory record
            
        Validates: Requirements 1.4
        """
        try:
            stats = self.get_storage_stats()
            
            history = StorageHistory(
                total_bytes=stats["total_bytes"],
                used_bytes=stats["used_bytes"],
                available_bytes=stats["available_bytes"],
                usage_percentage=Decimal(str(stats["usage_percentage"])),
                total_studies=stats["total_studies"],
                total_series=stats["total_series"],
                total_instances=stats["total_instances"]
            )
            
            self.db.add(history)
            self.db.commit()
            
            logger.info(f"Storage snapshot recorded: {stats['usage_percentage']}% used")
            return history
            
        except Exception as e:
            logger.error(f"Failed to record storage snapshot: {str(e)}")
            self.db.rollback()
            raise
    
    def acknowledge_alert(self, alert_id: str, acknowledged_by: str) -> Optional[Dict[str, Any]]:
        """
        Acknowledge a storage alert.
        
        Args:
            alert_id: UUID of the alert
            acknowledged_by: Username who acknowledged
            
        Returns:
            Updated alert or None if not found
        """
        try:
            alert = self.db.query(StorageAlert).filter(
                StorageAlert.id == alert_id
            ).first()
            
            if not alert:
                return None
            
            alert.acknowledged_at = datetime.utcnow()
            alert.acknowledged_by = acknowledged_by
            self.db.commit()
            
            logger.info(f"Alert {alert_id} acknowledged by {acknowledged_by}")
            return alert.to_dict()
            
        except Exception as e:
            logger.error(f"Failed to acknowledge alert: {str(e)}")
            self.db.rollback()
            raise
    
    def generate_sample_history(self, days: int = 30) -> int:
        """
        Generate sample historical data for the past N days.
        This is useful for initial setup or testing.
        
        Args:
            days: Number of days of history to generate
            
        Returns:
            Number of records created
        """
        try:
            # Check if history already exists
            existing_count = self.db.query(StorageHistory).count()
            if existing_count > 0:
                logger.info(f"History already exists ({existing_count} records), skipping generation")
                return 0
            
            # Get current stats as baseline
            current_stats = self.get_storage_stats()
            records_created = 0
            
            # Generate historical data going backwards
            for day_offset in range(days, 0, -1):
                # Calculate timestamp for this historical point
                timestamp = datetime.utcnow() - timedelta(days=day_offset)
                
                # Simulate gradual growth (80% to 100% of current usage)
                growth_factor = 0.8 + (0.2 * (days - day_offset) / days)
                
                history = StorageHistory(
                    total_bytes=current_stats["total_bytes"],
                    used_bytes=int(current_stats["used_bytes"] * growth_factor),
                    available_bytes=int(current_stats["available_bytes"] + 
                                      (current_stats["used_bytes"] * (1 - growth_factor))),
                    usage_percentage=Decimal(str(current_stats["usage_percentage"] * growth_factor)),
                    total_studies=max(0, int(current_stats["total_studies"] * growth_factor)),
                    total_series=max(0, int(current_stats["total_series"] * growth_factor)),
                    total_instances=max(0, int(current_stats["total_instances"] * growth_factor)),
                    recorded_at=timestamp
                )
                
                self.db.add(history)
                records_created += 1
            
            # Add current snapshot
            self.record_storage_snapshot()
            records_created += 1
            
            self.db.commit()
            logger.info(f"Generated {records_created} historical storage records")
            return records_created
            
        except Exception as e:
            logger.error(f"Failed to generate sample history: {str(e)}")
            self.db.rollback()
            raise


# Factory function for dependency injection
def get_storage_monitor_service(db: Session) -> StorageMonitorService:
    """Get storage monitor service instance"""
    return StorageMonitorService(db)
