"""
Health Monitoring Service
Comprehensive system health checks for production monitoring
"""

import logging
import psutil
import os
from datetime import datetime, timedelta
from typing import Dict, List
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class HealthMonitor:
    """System health monitoring service"""
    
    def __init__(self):
        self.start_time = datetime.now()
    
    def get_comprehensive_health(self, db: Session) -> Dict:
        """
        Get comprehensive system health status
        
        Returns:
            dict with detailed health information
        """
        try:
            health = {
                "status": "healthy",
                "timestamp": datetime.now().isoformat(),
                "uptime_seconds": (datetime.now() - self.start_time).total_seconds(),
                "components": {}
            }
            
            # Database health
            health["components"]["database"] = self._check_database(db)
            
            # Disk space
            health["components"]["disk"] = self._check_disk_space()
            
            # Memory
            health["components"]["memory"] = self._check_memory()
            
            # DICOM services
            health["components"]["dicom_scp"] = self._check_dicom_scp()
            
            # Recent errors
            health["components"]["errors"] = self._check_recent_errors(db)
            
            # Determine overall status
            component_statuses = [c.get("status", "unknown") for c in health["components"].values()]
            if "critical" in component_statuses:
                health["status"] = "critical"
            elif "warning" in component_statuses:
                health["status"] = "warning"
            else:
                health["status"] = "healthy"
            
            return health
            
        except Exception as e:
            logger.error(f"Error getting health status: {e}", exc_info=True)
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    def _check_database(self, db: Session) -> Dict:
        """Check database health"""
        try:
            # Test connection
            result = db.execute(text("SELECT 1"))
            result.scalar()
            
            # Get table counts
            tables = {}
            try:
                result = db.execute(text("SELECT COUNT(*) FROM dicom_files"))
                tables["dicom_files"] = result.scalar()
            except:
                tables["dicom_files"] = 0
            
            try:
                result = db.execute(text("SELECT COUNT(*) FROM dicom_nodes"))
                tables["dicom_nodes"] = result.scalar()
            except:
                tables["dicom_nodes"] = 0
            
            return {
                "status": "healthy",
                "connected": True,
                "tables": tables,
                "response_time_ms": 0  # Could measure actual time
            }
            
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return {
                "status": "critical",
                "connected": False,
                "error": str(e)
            }
    
    def _check_disk_space(self) -> Dict:
        """Check disk space"""
        try:
            # Get disk usage for storage path
            storage_path = os.getenv("DICOM_STORAGE_PATH", "/var/lib/pacs/dicom-storage")
            
            if os.path.exists(storage_path):
                disk = psutil.disk_usage(storage_path)
                percent_used = disk.percent
                
                status = "healthy"
                if percent_used > 90:
                    status = "critical"
                elif percent_used > 80:
                    status = "warning"
                
                return {
                    "status": status,
                    "path": storage_path,
                    "total_gb": round(disk.total / (1024**3), 2),
                    "used_gb": round(disk.used / (1024**3), 2),
                    "free_gb": round(disk.free / (1024**3), 2),
                    "percent_used": percent_used
                }
            else:
                return {
                    "status": "warning",
                    "message": "Storage path not found",
                    "path": storage_path
                }
                
        except Exception as e:
            logger.error(f"Disk space check failed: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    def _check_memory(self) -> Dict:
        """Check memory usage"""
        try:
            memory = psutil.virtual_memory()
            percent_used = memory.percent
            
            status = "healthy"
            if percent_used > 90:
                status = "critical"
            elif percent_used > 80:
                status = "warning"
            
            return {
                "status": status,
                "total_gb": round(memory.total / (1024**3), 2),
                "used_gb": round(memory.used / (1024**3), 2),
                "available_gb": round(memory.available / (1024**3), 2),
                "percent_used": percent_used
            }
            
        except Exception as e:
            logger.error(f"Memory check failed: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    def _check_dicom_scp(self) -> Dict:
        """Check DICOM SCP daemon status"""
        try:
            # Method 1: Check for process by name/cmdline
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    cmdline = proc.info.get('cmdline', [])
                    if cmdline:
                        cmdline_str = ' '.join(cmdline)
                        # Check for various ways daemon might be running
                        if any(pattern in cmdline_str for pattern in [
                            'dicom_scp_daemon.py',
                            'dicom_scp_daemon',
                            'start_scp_daemon'
                        ]):
                            return {
                                "status": "healthy",
                                "running": True,
                                "pid": proc.info['pid'],
                                "method": "process_detection"
                            }
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            # Method 2: Check if port is listening
            port = int(os.getenv("DICOM_SCP_PORT", "11112"))
            for conn in psutil.net_connections(kind='inet'):
                if conn.laddr.port == port and conn.status == 'LISTEN':
                    return {
                        "status": "healthy",
                        "running": True,
                        "port": port,
                        "method": "port_detection",
                        "message": f"DICOM SCP listening on port {port}"
                    }
            
            # Method 3: Check PID file if exists
            pid_file = Path("/var/run/dicom_scp.pid")
            if pid_file.exists():
                try:
                    pid = int(pid_file.read_text().strip())
                    if psutil.pid_exists(pid):
                        return {
                            "status": "healthy",
                            "running": True,
                            "pid": pid,
                            "method": "pid_file"
                        }
                except:
                    pass
            
            return {
                "status": "warning",
                "running": False,
                "message": "DICOM SCP daemon not detected",
                "hint": f"Expected on port {port} or process 'dicom_scp_daemon.py'"
            }
            
        except Exception as e:
            logger.error(f"DICOM SCP check failed: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    def _check_recent_errors(self, db: Session) -> Dict:
        """Check for recent errors in logs"""
        try:
            # This would check error logs or database error table
            # For now, return placeholder
            return {
                "status": "healthy",
                "count_24h": 0,
                "count_1h": 0
            }
            
        except Exception as e:
            logger.error(f"Error check failed: {e}")
            return {
                "status": "error",
                "error": str(e)
            }


# Singleton instance
_health_monitor = None

def get_health_monitor() -> HealthMonitor:
    """Get singleton health monitor instance"""
    global _health_monitor
    if _health_monitor is None:
        _health_monitor = HealthMonitor()
    return _health_monitor
