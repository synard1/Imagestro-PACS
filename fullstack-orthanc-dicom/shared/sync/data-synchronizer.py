"""
Data Synchronization Service for DICOM Order Management
Handles real-time synchronization between order-management and accession-api services
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import hashlib
import uuid
from pathlib import Path
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SyncEventType(Enum):
    """Types of synchronization events"""
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    SYNC_REQUEST = "sync_request"

class SyncStatus(Enum):
    """Synchronization status"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CONFLICT = "conflict"

@dataclass
class SyncEvent:
    """Synchronization event data structure"""
    id: str
    event_type: SyncEventType
    source_service: str
    target_service: str
    entity_type: str
    entity_id: str
    data: Dict[str, Any]
    timestamp: datetime
    status: SyncStatus = SyncStatus.PENDING
    retry_count: int = 0
    error_message: Optional[str] = None
    checksum: Optional[str] = None

    def __post_init__(self):
        if self.checksum is None:
            self.checksum = self.calculate_checksum()

    def calculate_checksum(self) -> str:
        """Calculate checksum for data integrity"""
        data_str = json.dumps(self.data, sort_keys=True)
        return hashlib.sha256(data_str.encode()).hexdigest()

class DataSynchronizer:
    """
    Main data synchronization service
    Handles bidirectional sync between order-management and accession-api
    """
    
    def __init__(self, db_path: str = "sync_events.db", max_workers: int = 5):
        """
        Initialize synchronizer
        
        Args:
            db_path: Path to SQLite database for event storage
            max_workers: Maximum number of worker threads
        """
        self.db_path = db_path
        self.max_workers = max_workers
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.event_handlers: Dict[str, List[Callable]] = {}
        self.running = False
        self.sync_thread: Optional[threading.Thread] = None
        
        # Initialize database
        self._init_database()
        
        # Service endpoints
        self.service_endpoints = {
            "order-management": "http://localhost:5000",
            "accession-api": "http://localhost:3000"
        }
        
        logger.info("DataSynchronizer initialized")

    def _init_database(self):
        """Initialize SQLite database for event storage"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sync_events (
                    id TEXT PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    source_service TEXT NOT NULL,
                    target_service TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    data TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    status TEXT NOT NULL,
                    retry_count INTEGER DEFAULT 0,
                    error_message TEXT,
                    checksum TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_sync_events_status 
                ON sync_events(status)
            """)
            
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_sync_events_timestamp 
                ON sync_events(timestamp)
            """)
            
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_sync_events_entity 
                ON sync_events(entity_type, entity_id)
            """)
            
            conn.commit()
            logger.info("Database initialized successfully")

    def register_event_handler(self, event_type: str, handler: Callable):
        """
        Register event handler for specific event types
        
        Args:
            event_type: Type of event to handle
            handler: Handler function
        """
        if event_type not in self.event_handlers:
            self.event_handlers[event_type] = []
        self.event_handlers[event_type].append(handler)
        logger.info(f"Registered handler for event type: {event_type}")

    def create_sync_event(self, 
                         event_type: SyncEventType,
                         source_service: str,
                         target_service: str,
                         entity_type: str,
                         entity_id: str,
                         data: Dict[str, Any]) -> SyncEvent:
        """
        Create a new synchronization event
        
        Args:
            event_type: Type of sync event
            source_service: Source service name
            target_service: Target service name
            entity_type: Type of entity (order, accession, etc.)
            entity_id: Unique identifier of entity
            data: Entity data
            
        Returns:
            Created sync event
        """
        event = SyncEvent(
            id=str(uuid.uuid4()),
            event_type=event_type,
            source_service=source_service,
            target_service=target_service,
            entity_type=entity_type,
            entity_id=entity_id,
            data=data,
            timestamp=datetime.now(timezone.utc)
        )
        
        # Store event in database
        self._store_event(event)
        
        logger.info(f"Created sync event: {event.id} ({event_type.value})")
        return event

    def _store_event(self, event: SyncEvent):
        """Store sync event in database"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO sync_events 
                (id, event_type, source_service, target_service, entity_type, 
                 entity_id, data, timestamp, status, retry_count, error_message, checksum)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event.id,
                event.event_type.value,
                event.source_service,
                event.target_service,
                event.entity_type,
                event.entity_id,
                json.dumps(event.data),
                event.timestamp.isoformat(),
                event.status.value,
                event.retry_count,
                event.error_message,
                event.checksum
            ))
            conn.commit()

    def get_pending_events(self, limit: int = 100) -> List[SyncEvent]:
        """
        Get pending synchronization events
        
        Args:
            limit: Maximum number of events to retrieve
            
        Returns:
            List of pending events
        """
        events = []
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT id, event_type, source_service, target_service, entity_type,
                       entity_id, data, timestamp, status, retry_count, error_message, checksum
                FROM sync_events 
                WHERE status IN ('pending', 'failed')
                ORDER BY timestamp ASC
                LIMIT ?
            """, (limit,))
            
            for row in cursor.fetchall():
                event = SyncEvent(
                    id=row[0],
                    event_type=SyncEventType(row[1]),
                    source_service=row[2],
                    target_service=row[3],
                    entity_type=row[4],
                    entity_id=row[5],
                    data=json.loads(row[6]),
                    timestamp=datetime.fromisoformat(row[7]),
                    status=SyncStatus(row[8]),
                    retry_count=row[9],
                    error_message=row[10],
                    checksum=row[11]
                )
                events.append(event)
        
        return events

    def update_event_status(self, event_id: str, status: SyncStatus, error_message: Optional[str] = None):
        """
        Update event status
        
        Args:
            event_id: Event ID
            status: New status
            error_message: Optional error message
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                UPDATE sync_events 
                SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (status.value, error_message, event_id))
            conn.commit()

    async def process_sync_event(self, event: SyncEvent) -> bool:
        """
        Process a single synchronization event
        
        Args:
            event: Sync event to process
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Processing sync event: {event.id}")
            
            # Update status to in_progress
            self.update_event_status(event.id, SyncStatus.IN_PROGRESS)
            
            # Call registered handlers
            handlers = self.event_handlers.get(event.event_type.value, [])
            for handler in handlers:
                try:
                    await handler(event)
                except Exception as e:
                    logger.error(f"Handler failed for event {event.id}: {e}")
                    raise
            
            # Simulate API call to target service
            success = await self._sync_to_target_service(event)
            
            if success:
                self.update_event_status(event.id, SyncStatus.COMPLETED)
                logger.info(f"Successfully processed sync event: {event.id}")
                return True
            else:
                raise Exception("Failed to sync to target service")
                
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Failed to process sync event {event.id}: {error_msg}")
            
            # Increment retry count
            event.retry_count += 1
            
            # Update status based on retry count
            if event.retry_count >= 3:
                self.update_event_status(event.id, SyncStatus.FAILED, error_msg)
            else:
                self.update_event_status(event.id, SyncStatus.PENDING, error_msg)
            
            return False

    async def _sync_to_target_service(self, event: SyncEvent) -> bool:
        """
        Sync data to target service via API call
        
        Args:
            event: Sync event
            
        Returns:
            True if successful
        """
        try:
            # This is a placeholder for actual API calls
            # In real implementation, this would make HTTP requests to target service
            
            target_endpoint = self.service_endpoints.get(event.target_service)
            if not target_endpoint:
                raise Exception(f"Unknown target service: {event.target_service}")
            
            # Simulate API call delay
            await asyncio.sleep(0.1)
            
            logger.info(f"Synced event {event.id} to {event.target_service}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to sync to target service: {e}")
            return False

    def start_sync_processor(self):
        """Start the synchronization processor"""
        if self.running:
            logger.warning("Sync processor is already running")
            return
        
        self.running = True
        self.sync_thread = threading.Thread(target=self._sync_processor_loop, daemon=True)
        self.sync_thread.start()
        logger.info("Sync processor started")

    def stop_sync_processor(self):
        """Stop the synchronization processor"""
        self.running = False
        if self.sync_thread:
            self.sync_thread.join(timeout=5)
        logger.info("Sync processor stopped")

    def _sync_processor_loop(self):
        """Main synchronization processor loop"""
        while self.running:
            try:
                # Get pending events
                pending_events = self.get_pending_events(limit=10)
                
                if pending_events:
                    logger.info(f"Processing {len(pending_events)} pending events")
                    
                    # Process events concurrently
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                    tasks = [self.process_sync_event(event) for event in pending_events]
                    loop.run_until_complete(asyncio.gather(*tasks, return_exceptions=True))
                    
                    loop.close()
                else:
                    # No pending events, sleep for a bit
                    time.sleep(5)
                    
            except Exception as e:
                logger.error(f"Error in sync processor loop: {e}")
                time.sleep(10)

    def get_sync_statistics(self) -> Dict[str, Any]:
        """
        Get synchronization statistics
        
        Returns:
            Dictionary with sync statistics
        """
        stats = {}
        
        with sqlite3.connect(self.db_path) as conn:
            # Count by status
            cursor = conn.execute("""
                SELECT status, COUNT(*) 
                FROM sync_events 
                GROUP BY status
            """)
            
            status_counts = dict(cursor.fetchall())
            stats['status_counts'] = status_counts
            
            # Recent events
            cursor = conn.execute("""
                SELECT COUNT(*) 
                FROM sync_events 
                WHERE timestamp > datetime('now', '-1 hour')
            """)
            
            stats['events_last_hour'] = cursor.fetchone()[0]
            
            # Failed events
            cursor = conn.execute("""
                SELECT COUNT(*) 
                FROM sync_events 
                WHERE status = 'failed'
            """)
            
            stats['failed_events'] = cursor.fetchone()[0]
        
        return stats

    def cleanup_old_events(self, days: int = 30):
        """
        Clean up old completed events
        
        Args:
            days: Number of days to keep events
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                DELETE FROM sync_events 
                WHERE status = 'completed' 
                AND timestamp < datetime('now', '-{} days')
            """.format(days))
            
            deleted_count = cursor.rowcount
            conn.commit()
            
            logger.info(f"Cleaned up {deleted_count} old events")


# Convenience functions for easy integration
def create_order_sync_event(order_data: Dict[str, Any], source_service: str = "order-management") -> SyncEvent:
    """
    Create sync event for order creation/update
    
    Args:
        order_data: Order data
        source_service: Source service name
        
    Returns:
        Created sync event
    """
    synchronizer = DataSynchronizer()
    return synchronizer.create_sync_event(
        event_type=SyncEventType.CREATE,
        source_service=source_service,
        target_service="accession-api",
        entity_type="order",
        entity_id=order_data.get("id", str(uuid.uuid4())),
        data=order_data
    )


def create_accession_sync_event(accession_data: Dict[str, Any], source_service: str = "accession-api") -> SyncEvent:
    """
    Create sync event for accession creation/update
    
    Args:
        accession_data: Accession data
        source_service: Source service name
        
    Returns:
        Created sync event
    """
    synchronizer = DataSynchronizer()
    return synchronizer.create_sync_event(
        event_type=SyncEventType.CREATE,
        source_service=source_service,
        target_service="order-management",
        entity_type="accession",
        entity_id=accession_data.get("id", str(uuid.uuid4())),
        data=accession_data
    )


if __name__ == "__main__":
    # Example usage
    synchronizer = DataSynchronizer()
    
    # Start sync processor
    synchronizer.start_sync_processor()
    
    # Create sample sync event
    sample_order = {
        "id": "order-123",
        "modality": "CT",
        "procedure_code": "CTABDOMEN",
        "patient_name": "John Doe",
        "patient_national_id": "1234567890123456"
    }
    
    event = create_order_sync_event(sample_order)
    print(f"Created sync event: {event.id}")
    
    # Get statistics
    stats = synchronizer.get_sync_statistics()
    print(f"Sync statistics: {stats}")
    
    # Keep running for demo
    try:
        time.sleep(30)
    except KeyboardInterrupt:
        pass
    finally:
        synchronizer.stop_sync_processor()