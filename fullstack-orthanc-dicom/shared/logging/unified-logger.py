"""
Unified Logging System for DICOM Order Management
Provides comprehensive logging for data changes and operations across services
"""

import logging
import json
import time
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass, asdict
from enum import Enum
import uuid
import sqlite3
import threading
from pathlib import Path
import traceback
from contextlib import contextmanager

class LogLevel(Enum):
    """Log levels"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

class LogCategory(Enum):
    """Log categories for better organization"""
    VALIDATION = "validation"
    SYNC = "sync"
    API = "api"
    DATABASE = "database"
    SECURITY = "security"
    PERFORMANCE = "performance"
    BUSINESS = "business"
    SYSTEM = "system"

@dataclass
class LogEntry:
    """Structured log entry"""
    id: str
    timestamp: datetime
    level: LogLevel
    category: LogCategory
    service: str
    operation: str
    message: str
    data: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    duration_ms: Optional[float] = None
    error_details: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        if isinstance(self.timestamp, str):
            self.timestamp = datetime.fromisoformat(self.timestamp)

class UnifiedLogger:
    """
    Unified logging system for DICOM order management
    Provides structured logging with database storage and querying capabilities
    """
    
    def __init__(self, 
                 service_name: str,
                 db_path: str = "unified_logs.db",
                 log_to_file: bool = True,
                 log_file_path: Optional[str] = None,
                 max_log_size_mb: int = 100):
        """
        Initialize unified logger
        
        Args:
            service_name: Name of the service using this logger
            db_path: Path to SQLite database for log storage
            log_to_file: Whether to also log to file
            log_file_path: Custom log file path
            max_log_size_mb: Maximum log file size in MB
        """
        self.service_name = service_name
        self.db_path = db_path
        self.log_to_file = log_to_file
        self.max_log_size_mb = max_log_size_mb
        
        # Initialize database
        self._init_database()
        
        # Setup file logging if enabled
        if log_to_file:
            if log_file_path is None:
                log_file_path = f"{service_name}_unified.log"
            self._setup_file_logging(log_file_path)
        
        # Thread-local storage for context
        self._local = threading.local()
        
        # Performance tracking
        self._operation_timers: Dict[str, float] = {}
        
        self.logger = logging.getLogger(f"unified.{service_name}")
        self.logger.info(f"UnifiedLogger initialized for service: {service_name}")

    def _init_database(self):
        """Initialize SQLite database for log storage"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS log_entries (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    level TEXT NOT NULL,
                    category TEXT NOT NULL,
                    service TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    message TEXT NOT NULL,
                    data TEXT,
                    user_id TEXT,
                    session_id TEXT,
                    request_id TEXT,
                    duration_ms REAL,
                    error_details TEXT,
                    metadata TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create indexes for better query performance
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_log_timestamp ON log_entries(timestamp)",
                "CREATE INDEX IF NOT EXISTS idx_log_level ON log_entries(level)",
                "CREATE INDEX IF NOT EXISTS idx_log_category ON log_entries(category)",
                "CREATE INDEX IF NOT EXISTS idx_log_service ON log_entries(service)",
                "CREATE INDEX IF NOT EXISTS idx_log_operation ON log_entries(operation)",
                "CREATE INDEX IF NOT EXISTS idx_log_user_id ON log_entries(user_id)",
                "CREATE INDEX IF NOT EXISTS idx_log_request_id ON log_entries(request_id)"
            ]
            
            for index_sql in indexes:
                conn.execute(index_sql)
            
            conn.commit()

    def _setup_file_logging(self, log_file_path: str):
        """Setup file logging with rotation"""
        from logging.handlers import RotatingFileHandler
        
        # Create log directory if it doesn't exist
        log_path = Path(log_file_path)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Setup rotating file handler
        max_bytes = self.max_log_size_mb * 1024 * 1024
        file_handler = RotatingFileHandler(
            log_file_path,
            maxBytes=max_bytes,
            backupCount=5
        )
        
        # Setup formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(formatter)
        
        # Add handler to logger
        logger = logging.getLogger(f"unified.{self.service_name}")
        logger.addHandler(file_handler)
        logger.setLevel(logging.INFO)

    def set_context(self, 
                   user_id: Optional[str] = None,
                   session_id: Optional[str] = None,
                   request_id: Optional[str] = None):
        """
        Set logging context for current thread
        
        Args:
            user_id: User ID for this context
            session_id: Session ID for this context
            request_id: Request ID for this context
        """
        self._local.user_id = user_id
        self._local.session_id = session_id
        self._local.request_id = request_id

    def get_context(self) -> Dict[str, Optional[str]]:
        """Get current logging context"""
        return {
            'user_id': getattr(self._local, 'user_id', None),
            'session_id': getattr(self._local, 'session_id', None),
            'request_id': getattr(self._local, 'request_id', None)
        }

    def log(self,
            level: LogLevel,
            category: LogCategory,
            operation: str,
            message: str,
            data: Optional[Dict[str, Any]] = None,
            duration_ms: Optional[float] = None,
            error_details: Optional[Dict[str, Any]] = None,
            metadata: Optional[Dict[str, Any]] = None):
        """
        Create a structured log entry
        
        Args:
            level: Log level
            category: Log category
            operation: Operation being performed
            message: Log message
            data: Additional data
            duration_ms: Operation duration in milliseconds
            error_details: Error details if applicable
            metadata: Additional metadata
        """
        context = self.get_context()
        
        log_entry = LogEntry(
            id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            level=level,
            category=category,
            service=self.service_name,
            operation=operation,
            message=message,
            data=data,
            user_id=context['user_id'],
            session_id=context['session_id'],
            request_id=context['request_id'],
            duration_ms=duration_ms,
            error_details=error_details,
            metadata=metadata
        )
        
        # Store in database
        self._store_log_entry(log_entry)
        
        # Also log to standard logger
        self._log_to_standard_logger(log_entry)

    def _store_log_entry(self, entry: LogEntry):
        """Store log entry in database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT INTO log_entries 
                    (id, timestamp, level, category, service, operation, message,
                     data, user_id, session_id, request_id, duration_ms, 
                     error_details, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    entry.id,
                    entry.timestamp.isoformat(),
                    entry.level.value,
                    entry.category.value,
                    entry.service,
                    entry.operation,
                    entry.message,
                    json.dumps(entry.data) if entry.data else None,
                    entry.user_id,
                    entry.session_id,
                    entry.request_id,
                    entry.duration_ms,
                    json.dumps(entry.error_details) if entry.error_details else None,
                    json.dumps(entry.metadata) if entry.metadata else None
                ))
                conn.commit()
        except Exception as e:
            # Fallback to standard logging if database fails
            self.logger.error(f"Failed to store log entry in database: {e}")

    def _log_to_standard_logger(self, entry: LogEntry):
        """Log to standard Python logger"""
        log_message = f"[{entry.category.value}] {entry.operation}: {entry.message}"
        
        if entry.data:
            log_message += f" | Data: {json.dumps(entry.data)}"
        
        if entry.duration_ms:
            log_message += f" | Duration: {entry.duration_ms:.2f}ms"
        
        level_map = {
            LogLevel.DEBUG: logging.DEBUG,
            LogLevel.INFO: logging.INFO,
            LogLevel.WARNING: logging.WARNING,
            LogLevel.ERROR: logging.ERROR,
            LogLevel.CRITICAL: logging.CRITICAL
        }
        
        self.logger.log(level_map[entry.level], log_message)

    # Convenience methods for different log levels
    def debug(self, category: LogCategory, operation: str, message: str, **kwargs):
        """Log debug message"""
        self.log(LogLevel.DEBUG, category, operation, message, **kwargs)

    def info(self, category: LogCategory, operation: str, message: str, **kwargs):
        """Log info message"""
        self.log(LogLevel.INFO, category, operation, message, **kwargs)

    def warning(self, category: LogCategory, operation: str, message: str, **kwargs):
        """Log warning message"""
        self.log(LogLevel.WARNING, category, operation, message, **kwargs)

    def error(self, category: LogCategory, operation: str, message: str, **kwargs):
        """Log error message"""
        self.log(LogLevel.ERROR, category, operation, message, **kwargs)

    def critical(self, category: LogCategory, operation: str, message: str, **kwargs):
        """Log critical message"""
        self.log(LogLevel.CRITICAL, category, operation, message, **kwargs)

    # Specialized logging methods
    def log_validation_error(self, operation: str, errors: List[str], data: Dict[str, Any]):
        """Log validation errors"""
        self.error(
            LogCategory.VALIDATION,
            operation,
            f"Validation failed with {len(errors)} errors",
            data={'validation_errors': errors, 'input_data': data}
        )

    def log_api_request(self, method: str, endpoint: str, status_code: int, duration_ms: float):
        """Log API request"""
        self.info(
            LogCategory.API,
            f"{method} {endpoint}",
            f"API request completed with status {status_code}",
            duration_ms=duration_ms,
            data={'status_code': status_code}
        )

    def log_database_operation(self, operation: str, table: str, affected_rows: int, duration_ms: float):
        """Log database operation"""
        self.info(
            LogCategory.DATABASE,
            operation,
            f"Database operation on {table} affected {affected_rows} rows",
            duration_ms=duration_ms,
            data={'table': table, 'affected_rows': affected_rows}
        )

    def log_sync_event(self, event_type: str, entity_type: str, entity_id: str, success: bool):
        """Log synchronization event"""
        level = LogLevel.INFO if success else LogLevel.ERROR
        message = f"Sync {event_type} for {entity_type} {entity_id} {'succeeded' if success else 'failed'}"
        
        self.log(
            level,
            LogCategory.SYNC,
            f"sync_{event_type}",
            message,
            data={'entity_type': entity_type, 'entity_id': entity_id, 'success': success}
        )

    def log_security_event(self, event_type: str, details: Dict[str, Any]):
        """Log security-related events"""
        self.warning(
            LogCategory.SECURITY,
            event_type,
            f"Security event: {event_type}",
            data=details
        )

    @contextmanager
    def operation_timer(self, category: LogCategory, operation: str):
        """Context manager for timing operations"""
        start_time = time.time()
        timer_id = f"{category.value}_{operation}_{uuid.uuid4().hex[:8]}"
        
        try:
            yield timer_id
        except Exception as e:
            # Log the error
            duration_ms = (time.time() - start_time) * 1000
            self.error(
                category,
                operation,
                f"Operation failed: {str(e)}",
                duration_ms=duration_ms,
                error_details={
                    'exception_type': type(e).__name__,
                    'exception_message': str(e),
                    'traceback': traceback.format_exc()
                }
            )
            raise
        else:
            # Log successful completion
            duration_ms = (time.time() - start_time) * 1000
            self.info(
                category,
                operation,
                f"Operation completed successfully",
                duration_ms=duration_ms
            )

    def query_logs(self,
                   start_time: Optional[datetime] = None,
                   end_time: Optional[datetime] = None,
                   level: Optional[LogLevel] = None,
                   category: Optional[LogCategory] = None,
                   service: Optional[str] = None,
                   operation: Optional[str] = None,
                   user_id: Optional[str] = None,
                   limit: int = 100) -> List[LogEntry]:
        """
        Query log entries with filters
        
        Args:
            start_time: Start time filter
            end_time: End time filter
            level: Log level filter
            category: Category filter
            service: Service filter
            operation: Operation filter
            user_id: User ID filter
            limit: Maximum number of results
            
        Returns:
            List of matching log entries
        """
        query = "SELECT * FROM log_entries WHERE 1=1"
        params = []
        
        if start_time:
            query += " AND timestamp >= ?"
            params.append(start_time.isoformat())
        
        if end_time:
            query += " AND timestamp <= ?"
            params.append(end_time.isoformat())
        
        if level:
            query += " AND level = ?"
            params.append(level.value)
        
        if category:
            query += " AND category = ?"
            params.append(category.value)
        
        if service:
            query += " AND service = ?"
            params.append(service)
        
        if operation:
            query += " AND operation = ?"
            params.append(operation)
        
        if user_id:
            query += " AND user_id = ?"
            params.append(user_id)
        
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        
        entries = []
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(query, params)
            
            for row in cursor.fetchall():
                entry = LogEntry(
                    id=row[0],
                    timestamp=row[1],
                    level=LogLevel(row[2]),
                    category=LogCategory(row[3]),
                    service=row[4],
                    operation=row[5],
                    message=row[6],
                    data=json.loads(row[7]) if row[7] else None,
                    user_id=row[8],
                    session_id=row[9],
                    request_id=row[10],
                    duration_ms=row[11],
                    error_details=json.loads(row[12]) if row[12] else None,
                    metadata=json.loads(row[13]) if row[13] else None
                )
                entries.append(entry)
        
        return entries

    def get_log_statistics(self) -> Dict[str, Any]:
        """Get logging statistics"""
        stats = {}
        
        with sqlite3.connect(self.db_path) as conn:
            # Count by level
            cursor = conn.execute("""
                SELECT level, COUNT(*) 
                FROM log_entries 
                GROUP BY level
            """)
            stats['level_counts'] = dict(cursor.fetchall())
            
            # Count by category
            cursor = conn.execute("""
                SELECT category, COUNT(*) 
                FROM log_entries 
                GROUP BY category
            """)
            stats['category_counts'] = dict(cursor.fetchall())
            
            # Recent errors
            cursor = conn.execute("""
                SELECT COUNT(*) 
                FROM log_entries 
                WHERE level IN ('ERROR', 'CRITICAL') 
                AND timestamp > datetime('now', '-1 hour')
            """)
            stats['recent_errors'] = cursor.fetchone()[0]
            
            # Total entries
            cursor = conn.execute("SELECT COUNT(*) FROM log_entries")
            stats['total_entries'] = cursor.fetchone()[0]
        
        return stats

    def cleanup_old_logs(self, days: int = 90):
        """
        Clean up old log entries
        
        Args:
            days: Number of days to keep logs
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                DELETE FROM log_entries 
                WHERE timestamp < datetime('now', '-{} days')
            """.format(days))
            
            deleted_count = cursor.rowcount
            conn.commit()
            
            self.info(
                LogCategory.SYSTEM,
                "cleanup_logs",
                f"Cleaned up {deleted_count} old log entries"
            )


# Global logger instances for easy access
_loggers: Dict[str, UnifiedLogger] = {}

def get_logger(service_name: str) -> UnifiedLogger:
    """
    Get or create a logger for a service
    
    Args:
        service_name: Name of the service
        
    Returns:
        UnifiedLogger instance
    """
    if service_name not in _loggers:
        _loggers[service_name] = UnifiedLogger(service_name)
    return _loggers[service_name]


if __name__ == "__main__":
    # Example usage
    logger = UnifiedLogger("test-service")
    
    # Set context
    logger.set_context(user_id="user123", request_id="req456")
    
    # Log various events
    logger.info(LogCategory.API, "create_order", "Order created successfully", 
                data={"order_id": "order123"})
    
    logger.log_validation_error("validate_patient", ["Invalid NIK"], {"nik": "123"})
    
    # Use operation timer
    with logger.operation_timer(LogCategory.DATABASE, "insert_order"):
        time.sleep(0.1)  # Simulate operation
    
    # Query logs
    recent_logs = logger.query_logs(limit=10)
    print(f"Found {len(recent_logs)} recent log entries")
    
    # Get statistics
    stats = logger.get_log_statistics()
    print(f"Log statistics: {stats}")