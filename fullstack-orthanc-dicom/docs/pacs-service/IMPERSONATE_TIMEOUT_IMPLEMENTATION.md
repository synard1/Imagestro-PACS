# Impersonate Session Timeout Implementation

## Overview

This document describes the implementation of session timeout logic for the User Impersonate feature. The timeout mechanism ensures that impersonate sessions automatically expire after a configured duration, preventing unauthorized access if a superadmin forgets to manually stop impersonating.

## Requirements Addressed

- **Requirement 6.1**: WHEN a superadmin starts impersonating a user THEN the PACS System SHALL set a configurable timeout for the impersonate session (default 30 minutes)
- **Requirement 6.2**: WHEN an impersonate session is inactive for the configured timeout duration THEN the PACS System SHALL automatically stop impersonating and return to the superadmin's identity
- **Requirement 6.3**: WHEN an impersonate session is about to timeout THEN the PACS System SHALL display a warning notification 5 minutes before timeout
- **Requirement 6.4**: WHEN an impersonate session times out THEN the PACS System SHALL log the timeout event in audit logs
- **Requirement 6.5**: WHEN an impersonate session times out THEN the PACS System SHALL display a notification to the superadmin explaining the timeout

## Architecture

### Components

1. **ImpersonateService** (`pacs-service/app/services/impersonate_service.py`)
   - `cleanup_expired_sessions()`: Finds and marks expired sessions as 'timeout'
   - `handle_session_timeout()`: Handles individual session timeout
   - `get_active_session()`: Calculates remaining time for active sessions

2. **Background Tasks** (`pacs-service/app/tasks/impersonate_tasks.py`)
   - `cleanup_expired_impersonate_sessions()`: Periodic task to clean up expired sessions
   - `send_timeout_warnings()`: Periodic task to send warning notifications
   - `log_active_sessions()`: Periodic task to log active sessions for monitoring
   - `generate_impersonate_statistics()`: Periodic task to generate statistics

3. **Configuration** (`pacs-service/app/config.py`)
   - `impersonate_enabled`: Enable/disable impersonate feature
   - `impersonate_timeout_minutes`: Default timeout duration (default: 30 minutes)
   - `impersonate_warning_minutes`: Warning time before timeout (default: 5 minutes)
   - `impersonate_cleanup_interval_minutes`: Cleanup task interval (default: 5 minutes)

4. **Celery Scheduler** (`pacs-service/app/celery_app.py`)
   - Periodic tasks scheduled to run at configured intervals
   - Task routing to dedicated 'impersonate' queue

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  Impersonate Session Created                │
│                  (status='active', end_time=NULL)           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────┐
        │  Celery Beat Scheduler             │
        │  (Every 5 minutes)                 │
        └────────────────┬───────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
   ┌─────────────────┐          ┌──────────────────┐
   │ Cleanup Task    │          │ Warning Task     │
   │ - Find expired  │          │ - Find sessions  │
   │ - Mark timeout  │          │   about to       │
   │ - Log event     │          │   expire         │
   │                 │          │ - Send warning   │
   └─────────────────┘          │ - Log event      │
        │                       └──────────────────┘
        │
        ▼
   ┌─────────────────────────────────────┐
   │  Session Status Updated             │
   │  (status='timeout', end_time=SET)   │
   │  Audit Log Entry Created            │
   └─────────────────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Enable/disable impersonate feature
IMPERSONATE_ENABLED=true

# Default timeout duration in minutes (1-1440)
IMPERSONATE_TIMEOUT_MINUTES=30

# Warning time before timeout in minutes (1-60)
IMPERSONATE_WARNING_MINUTES=5

# Cleanup task interval in minutes (1-60)
IMPERSONATE_CLEANUP_INTERVAL_MINUTES=5
```

### Default Values

| Setting | Default | Min | Max | Description |
|---------|---------|-----|-----|-------------|
| `impersonate_enabled` | `true` | - | - | Enable/disable feature |
| `impersonate_timeout_minutes` | `30` | 1 | 1440 | Session timeout duration |
| `impersonate_warning_minutes` | `5` | 1 | 60 | Warning time before timeout |
| `impersonate_cleanup_interval_minutes` | `5` | 1 | 60 | Cleanup task interval |

## Periodic Tasks

### 1. Cleanup Expired Sessions
- **Schedule**: Every 5 minutes
- **Task**: `app.tasks.impersonate_tasks.cleanup_expired_impersonate_sessions`
- **Queue**: `impersonate`
- **Function**: Finds all active sessions that have exceeded their timeout and marks them as 'timeout'
- **Logging**: Logs count of sessions cleaned up

### 2. Send Timeout Warnings
- **Schedule**: Every 5 minutes
- **Task**: `app.tasks.impersonate_tasks.send_timeout_warnings`
- **Queue**: `impersonate`
- **Parameters**: `warning_minutes=5`
- **Function**: Finds sessions about to timeout and sends warning notifications
- **Logging**: Logs count of warnings sent, creates audit log entries

### 3. Log Active Sessions
- **Schedule**: Every hour
- **Task**: `app.tasks.impersonate_tasks.log_active_sessions`
- **Queue**: `impersonate`
- **Function**: Logs all currently active impersonate sessions for monitoring
- **Logging**: Logs session details including elapsed and remaining time

### 4. Generate Statistics
- **Schedule**: Daily at 1 AM
- **Task**: `app.tasks.impersonate_tasks.generate_impersonate_statistics`
- **Queue**: `impersonate`
- **Parameters**: `hours=24`
- **Function**: Generates statistics about impersonate sessions
- **Logging**: Logs statistics including total sessions, active count, timeouts, etc.

## Session Lifecycle

### 1. Session Creation
```python
# Start impersonate session
success, session_data, error = await impersonate_service.start_impersonate(
    original_user_id="admin-001",
    target_user_id="user-123",
    reason="Testing radiologist features",
    timeout_minutes=30  # Optional, uses default if not provided
)

# Session created with:
# - status='active'
# - end_time=NULL
# - timeout_minutes=30
# - start_time=NOW()
```

### 2. Active Session
- Session remains active for the configured timeout duration
- Cleanup task checks every 5 minutes for expired sessions
- Warning task checks every 5 minutes for sessions about to expire
- Active sessions are logged hourly for monitoring

### 3. Timeout Detection
```python
# Cleanup task finds expired sessions
expired_sessions = db.query(ImpersonateSession).filter(
    and_(
        ImpersonateSession.status == 'active',
        ImpersonateSession.end_time.is_(None),
        # Session timeout time <= now
        ImpersonateSession.start_time + timedelta(minutes=timeout_minutes) <= now
    )
).all()
```

### 4. Timeout Handling
```python
# Mark session as timeout
session.end_time = datetime.utcnow()
session.status = 'timeout'
db.commit()

# Create audit log entry
audit_service.create_log(
    action="impersonate_timeout",
    details={
        "session_id": session.id,
        "reason": "Session timeout"
    }
)
```

### 5. Warning Notification
```python
# Find sessions about to timeout (within 5 minutes)
sessions_to_warn = db.query(ImpersonateSession).filter(
    and_(
        ImpersonateSession.status == 'active',
        ImpersonateSession.end_time.is_(None),
        # Session will timeout between now and warning_threshold
        ImpersonateSession.start_time + timedelta(minutes=timeout_minutes) <= warning_threshold,
        ImpersonateSession.start_time + timedelta(minutes=timeout_minutes) > now
    )
).all()

# For each session:
# 1. Calculate remaining time
# 2. Create audit log entry with warning
# 3. Send notification to superadmin (via notification service)
```

## Audit Logging

### Timeout Event
```json
{
  "action": "impersonate_timeout",
  "user_id": "admin-001",
  "resource_type": "user",
  "resource_id": "user-123",
  "details": {
    "session_id": "session-456",
    "reason": "Session timeout"
  },
  "severity": "WARNING",
  "timestamp": "2024-01-15T11:00:00Z"
}
```

### Timeout Warning Event
```json
{
  "action": "impersonate_timeout_warning",
  "user_id": "admin-001",
  "resource_type": "user",
  "resource_id": "user-123",
  "details": {
    "session_id": "session-456",
    "remaining_minutes": 4,
    "timeout_time": "2024-01-15T11:04:00Z"
  },
  "severity": "WARNING",
  "timestamp": "2024-01-15T10:56:00Z"
}
```

## API Integration

### Get Active Session Status
```python
# Returns remaining time for active session
session_data = await impersonate_service.get_active_session(original_user_id)

# Response:
{
    'sessionId': 'session-456',
    'originalUserId': 'admin-001',
    'targetUserId': 'user-123',
    'startTime': '2024-01-15T10:30:00Z',
    'timeoutMinutes': 30,
    'remainingMinutes': 25,  # Calculated dynamically
    'reason': 'Testing radiologist features',
    'status': 'active'
}
```

### Session History
```python
# History includes timeout status
sessions, total = await impersonate_service.get_session_history(
    original_user_id='admin-001',
    filters={'status': 'timeout'}
)

# Response includes:
# - Sessions with status='timeout'
# - end_time set to timeout time
# - duration calculated
```

## Testing

### Property-Based Tests

#### Property 7: Session Timeout Auto-Stop
- **Test**: `test_property_7_session_timeout_auto_stop`
- **Validates**: Requirements 2.5, 6.2
- **Scenario**: 
  1. Create impersonate session with 1-minute timeout
  2. Simulate time passing (set start_time to 2 minutes ago)
  3. Run cleanup task
  4. Verify session marked as 'timeout'

#### Property 14: Timeout Warning Notification
- **Test**: `test_property_14_timeout_warning_notification`
- **Validates**: Requirements 6.3
- **Scenario**:
  1. Create impersonate session with 10-minute timeout
  2. Simulate time passing (set start_time to 6 minutes ago)
  3. Verify session is within warning window (< 5 minutes remaining)
  4. Verify session has not expired yet

### Running Tests

```bash
# Run timeout property tests
pytest pacs-service/tests/test_impersonate_properties.py::TestImpersonateProperties::test_property_7_session_timeout_auto_stop -v

pytest pacs-service/tests/test_impersonate_properties.py::TestImpersonateProperties::test_property_14_timeout_warning_notification -v

# Run all impersonate property tests
pytest pacs-service/tests/test_impersonate_properties.py -v
```

## Monitoring

### Active Sessions Logging
The `log_active_sessions` task logs all active sessions hourly:

```
Active session: {
    'session_id': 'session-456',
    'original_user_id': 'admin-001',
    'target_user_id': 'user-123',
    'elapsed_minutes': 15,
    'remaining_minutes': 15,
    'timeout_minutes': 30,
    'reason': 'Testing radiologist features'
}
```

### Statistics Generation
The `generate_impersonate_statistics` task generates daily statistics:

```
Impersonate statistics: {
    'task': 'generate_impersonate_statistics',
    'period_hours': 24,
    'total_sessions': 42,
    'active_sessions': 2,
    'completed_sessions': 35,
    'timeout_sessions': 5,
    'error_sessions': 0,
    'average_duration_seconds': 1800,
    'unique_superadmins': 3,
    'unique_target_users': 15,
    'timestamp': '2024-01-15T01:00:00Z'
}
```

## Error Handling

### Cleanup Task Errors
- Logs error and returns error report
- Does not stop other cleanup operations
- Continues processing remaining sessions

### Warning Task Errors
- Logs error for individual session
- Continues processing remaining sessions
- Does not prevent cleanup task from running

### Database Errors
- Rolls back transaction on error
- Logs detailed error message
- Returns error report for monitoring

## Performance Considerations

### Cleanup Task
- Runs every 5 minutes
- Queries only active sessions with expired timeout
- Uses indexed columns: `status`, `end_time`, `start_time`
- Batch processes all expired sessions in single transaction

### Warning Task
- Runs every 5 minutes
- Queries only active sessions within warning window
- Uses indexed columns: `status`, `end_time`, `start_time`
- Creates audit log entries for each warning

### Database Indexes
```sql
CREATE INDEX idx_impersonate_sessions_status 
    ON impersonate_sessions(status);

CREATE INDEX idx_impersonate_sessions_start_time 
    ON impersonate_sessions(start_time);

CREATE INDEX idx_impersonate_sessions_created_at 
    ON impersonate_sessions(created_at);
```

## Future Enhancements

1. **Configurable Warning Times**: Allow different warning times per session
2. **Notification Channels**: Send warnings via email, SMS, webhook
3. **Session Extension**: Allow superadmin to extend session before timeout
4. **Idle Timeout**: Separate timeout for idle sessions vs. total duration
5. **Session Renewal**: Automatic renewal if activity detected
6. **Timeout Policies**: Different timeouts based on user role or facility

## Troubleshooting

### Sessions Not Timing Out
1. Check Celery worker is running: `celery -A app.celery_app worker -l info`
2. Check Redis connection: `redis-cli ping`
3. Check task queue: `celery -A app.celery_app inspect active`
4. Check logs: `tail -f /var/log/pacs/app.log`

### Warnings Not Sent
1. Verify `send_timeout_warnings` task is scheduled
2. Check notification service configuration
3. Verify audit log entries are created
4. Check task execution logs

### High Database Load
1. Increase cleanup interval: `IMPERSONATE_CLEANUP_INTERVAL_MINUTES=10`
2. Reduce warning check frequency
3. Archive old sessions to separate table
4. Add database indexes if missing

## References

- **Design Document**: `.kiro/specs/user-impersonate/design.md`
- **Requirements**: `.kiro/specs/user-impersonate/requirements.md`
- **Tasks**: `.kiro/specs/user-impersonate/tasks.md`
- **Impersonate Service**: `pacs-service/app/services/impersonate_service.py`
- **Background Tasks**: `pacs-service/app/tasks/impersonate_tasks.py`
- **Configuration**: `pacs-service/app/config.py`
- **Celery Setup**: `pacs-service/app/celery_app.py`

