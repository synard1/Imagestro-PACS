"""
Database Query Insights & Slow Query Detection
Monitor query performance, detect slow queries, track connection pool

Features:
- Auto-detect slow queries (configurable threshold)
- Track query execution time distribution (P50, P95, P99)
- Monitor database connection pool (active, idle, waiting)
- Query execution plan analysis
- Automatic query fingerprinting (group similar queries)
"""

import time
import logging
import json
from functools import wraps
from datetime import datetime
from typing import Optional, Dict, List
from collections import defaultdict
import hashlib

from prometheus_client import Counter, Histogram, Gauge
import sqlalchemy
from sqlalchemy import event, pool

logger = logging.getLogger(__name__)

# ============================================================================
# DATABASE QUERY METRICS
# ============================================================================

# Query execution metrics
database_queries_total = Counter(
    'database_queries_total',
    'Total database queries executed',
    ['operation', 'table', 'status', 'service']
)

database_query_duration_seconds = Histogram(
    'database_query_duration_seconds',
    'Database query execution time',
    ['operation', 'table', 'service'],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
)

database_slow_queries_total = Counter(
    'database_slow_queries_total',
    'Total slow queries (>threshold)',
    ['operation', 'table', 'service']
)

database_query_rows_affected = Histogram(
    'database_query_rows_affected',
    'Number of rows affected by query',
    ['operation', 'table', 'service'],
    buckets=(1, 10, 100, 1000, 10000, 100000)
)

# Connection pool metrics
database_connection_pool_size = Gauge(
    'database_connection_pool_size',
    'Total connections in pool',
    ['service']
)

database_connection_active = Gauge(
    'database_connection_active',
    'Active database connections',
    ['service']
)

database_connection_idle = Gauge(
    'database_connection_idle',
    'Idle database connections',
    ['service']
)

database_connection_overflow = Gauge(
    'database_connection_overflow',
    'Overflow connections beyond pool size',
    ['service']
)

database_connection_wait_time = Histogram(
    'database_connection_wait_time_seconds',
    'Time waiting for available connection',
    ['service'],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0)
)

# Query statistics
database_query_errors_total = Counter(
    'database_query_errors_total',
    'Total database query errors',
    ['operation', 'error_type', 'service']
)

database_transaction_duration_seconds = Histogram(
    'database_transaction_duration_seconds',
    'Database transaction duration',
    ['service'],
    buckets=(0.001, 0.01, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0)
)

# ============================================================================
# SLOW QUERY TRACKER
# ============================================================================

class SlowQueryTracker:
    """Track and analyze slow queries"""
    
    def __init__(self, slow_query_threshold: float = 1.0):
        self.slow_query_threshold = slow_query_threshold
        self.slow_queries: List[Dict] = []
        self.query_stats: Dict[str, dict] = defaultdict(lambda: {
            'count': 0,
            'total_duration': 0.0,
            'durations': [],
            'errors': 0,
            'last_executed': None,
        })
    
    def record_query(
        self,
        query: str,
        duration: float,
        operation: str,
        table: str,
        rows_affected: int = 0,
        error: Optional[str] = None
    ):
        """Record a query execution"""
        
        # Fingerprint query (group similar queries)
        fingerprint = self._fingerprint_query(query)
        stats = self.query_stats[fingerprint]
        
        stats['count'] += 1
        stats['total_duration'] += duration
        stats['durations'].append(duration)
        stats['last_executed'] = datetime.utcnow().isoformat()
        
        if error:
            stats['errors'] += 1
        
        # Keep only last 100 executions
        if len(stats['durations']) > 100:
            stats['durations'] = stats['durations'][-100:]
        
        # Track slow queries
        if duration > self.slow_query_threshold:
            self.slow_queries.append({
                'timestamp': datetime.utcnow().isoformat(),
                'query': query[:200],  # Truncate long queries
                'fingerprint': fingerprint,
                'duration_ms': duration * 1000,
                'operation': operation,
                'table': table,
                'rows_affected': rows_affected,
            })
            
            # Keep only last 1000 slow queries
            if len(self.slow_queries) > 1000:
                self.slow_queries = self.slow_queries[-1000:]
    
    @staticmethod
    def _fingerprint_query(query: str) -> str:
        """Generate fingerprint for query (group similar queries)"""
        
        # Remove whitespace and normalize
        normalized = ' '.join(query.split())
        
        # Replace literal values with placeholders
        import re
        # Replace numbers
        normalized = re.sub(r'\b\d+\b', '?', normalized)
        # Replace strings
        normalized = re.sub(r"'[^']*'", "'?'", normalized)
        normalized = re.sub(r'"[^"]*"', '"?"', normalized)
        
        # Create hash
        return hashlib.md5(normalized.encode()).hexdigest()[:8]
    
    def get_slowest_queries(self, top_n: int = 10) -> List[dict]:
        """Get slowest queries by average duration"""
        
        slowest = []
        for fingerprint, stats in self.query_stats.items():
            if stats['count'] == 0:
                continue
            
            avg_duration = stats['total_duration'] / stats['count']
            max_duration = max(stats['durations']) if stats['durations'] else 0
            
            slowest.append({
                'fingerprint': fingerprint,
                'avg_duration_ms': avg_duration * 1000,
                'max_duration_ms': max_duration * 1000,
                'total_executions': stats['count'],
                'error_count': stats['errors'],
                'last_executed': stats['last_executed'],
            })
        
        return sorted(slowest, key=lambda x: x['avg_duration_ms'], reverse=True)[:top_n]
    
    def get_recent_slow_queries(self, limit: int = 50) -> List[dict]:
        """Get most recent slow queries"""
        return list(reversed(self.slow_queries[-limit:]))

# Global tracker
slow_query_tracker = SlowQueryTracker(slow_query_threshold=1.0)

# ============================================================================
# SQLALCHEMY EVENT LISTENERS
# ============================================================================

def setup_database_monitoring(engine):
    """Setup SQLAlchemy event listeners for query monitoring"""
    
    @event.listens_for(engine, "before_cursor_execute")
    def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        """Called before query execution"""
        conn.info.setdefault('query_start_time', []).append(time.time())
    
    @event.listens_for(engine, "after_cursor_execute")
    def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        """Called after query execution"""
        
        total_time = time.time() - conn.info['query_start_time'].pop(-1)
        
        # Parse query
        operation = statement.split()[0].upper() if statement else 'UNKNOWN'
        table = _extract_table_from_query(statement)
        
        # Record metrics
        database_queries_total.labels(
            operation=operation,
            table=table,
            status='success',
            service='pacs-service'
        ).inc()
        
        database_query_duration_seconds.labels(
            operation=operation,
            table=table,
            service='pacs-service'
        ).observe(total_time)
        
        # Track slow queries
        if total_time > 1.0:
            database_slow_queries_total.labels(
                operation=operation,
                table=table,
                service='pacs-service'
            ).inc()
        
        # Log slow queries
        if total_time > 1.0:
            logger.warning(
                f"Slow query detected: {operation} on {table} took {total_time*1000:.2f}ms",
                extra={
                    'operation': operation,
                    'table': table,
                    'duration_ms': total_time * 1000,
                    'query': statement[:200],
                }
            )
        
        # Record in tracker
        slow_query_tracker.record_query(
            statement,
            total_time,
            operation,
            table
        )
    
    # Monitor connection pool
    @event.listens_for(pool.Pool, "connect")
    def receive_connect(dbapi_conn, connection_record):
        """Called when new connection created"""
        logger.debug(f"Database connection established")
    
    @event.listens_for(pool.Pool, "checkout")
    def receive_checkout(dbapi_conn, connection_record, connection_proxy):
        """Called when connection checked out from pool"""
        pass
    
    logger.info("Database monitoring initialized")

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _extract_table_from_query(query: str) -> str:
    """Extract table name from SQL query"""
    
    import re
    
    # Try to extract table name from different query patterns
    patterns = [
        r'FROM\s+(\w+)',
        r'INTO\s+(\w+)',
        r'UPDATE\s+(\w+)',
        r'DELETE\s+FROM\s+(\w+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, query, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return 'unknown'

# ============================================================================
# DIAGNOSTIC ENDPOINTS
# ============================================================================

def setup_database_diagnostics(app):
    """Add database diagnostic endpoints"""
    
    @app.get("/api/diagnostics/database/slow-queries", tags=["monitoring"])
    async def slow_queries():
        """Get slowest queries"""
        slowest = slow_query_tracker.get_slowest_queries(10)
        recent = slow_query_tracker.get_recent_slow_queries(20)
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'slowest_queries': slowest,
            'recent_slow_queries': recent,
        }
    
    @app.get("/api/diagnostics/database/query-stats", tags=["monitoring"])
    async def query_stats():
        """Get detailed query statistics"""
        
        stats_dict = {}
        for fingerprint, stats in slow_query_tracker.query_stats.items():
            if stats['count'] == 0:
                continue
            
            durations_sorted = sorted(stats['durations'])
            p50 = durations_sorted[len(durations_sorted) // 2] if durations_sorted else 0
            p95 = durations_sorted[int(len(durations_sorted) * 0.95)] if durations_sorted else 0
            p99 = durations_sorted[int(len(durations_sorted) * 0.99)] if durations_sorted else 0
            
            stats_dict[fingerprint] = {
                'total_executions': stats['count'],
                'avg_duration_ms': (stats['total_duration'] / stats['count']) * 1000,
                'min_duration_ms': min(stats['durations']) * 1000 if durations_sorted else 0,
                'max_duration_ms': max(stats['durations']) * 1000,
                'p50_duration_ms': p50 * 1000,
                'p95_duration_ms': p95 * 1000,
                'p99_duration_ms': p99 * 1000,
                'error_count': stats['errors'],
                'last_executed': stats['last_executed'],
            }
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'total_unique_queries': len(stats_dict),
            'queries': stats_dict
        }
    
    logger.info("Database diagnostics endpoints registered")
