"""
Impersonate Session Background Tasks
Handles session timeout, cleanup, and warning notifications
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.impersonate_session import ImpersonateSession
from app.services.impersonate_service import ImpersonateService
from app.services.audit_service import AuditService
from sqlalchemy import and_

logger = logging.getLogger(__name__)


@celery_app.task(name='app.tasks.impersonate_tasks.cleanup_expired_impersonate_sessions')
def cleanup_expired_impersonate_sessions() -> Dict[str, Any]:
    """
    Clean up expired impersonate sessions
    
    Finds all active impersonate sessions that have exceeded their timeout duration
    and marks them as 'timeout'. This task runs periodically to ensure sessions
    don't remain active indefinitely.
    
    Returns:
        Cleanup report with count of sessions cleaned up
    """
    db = SessionLocal()
    try:
        logger.info("Starting cleanup of expired impersonate sessions")
        
        impersonate_service = ImpersonateService(db)
        
        # Use asyncio to run async method
        import asyncio
        count = asyncio.run(impersonate_service.cleanup_expired_sessions())
        
        report = {
            'task': 'cleanup_expired_impersonate_sessions',
            'sessions_cleaned': count,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Expired impersonate sessions cleanup complete: {report}")
        return report
        
    except Exception as e:
        logger.error(f"Failed to cleanup expired impersonate sessions: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.impersonate_tasks.send_timeout_warnings')
def send_timeout_warnings(warning_minutes: int = 5) -> Dict[str, Any]:
    """
    Send timeout warning notifications for sessions about to expire
    
    Finds all active impersonate sessions that will expire within the specified
    warning period and sends notifications to the superadmin.
    
    Args:
        warning_minutes: Minutes before timeout to send warning (default: 5)
        
    Returns:
        Report with count of warnings sent
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting timeout warning notifications (warning_minutes={warning_minutes})")
        
        now = datetime.utcnow()
        warning_threshold = now + timedelta(minutes=warning_minutes)
        
        # Find sessions that will timeout within warning period
        sessions_to_warn = db.query(ImpersonateSession).filter(
            and_(
                ImpersonateSession.status == 'active',
                ImpersonateSession.end_time.is_(None),
                # Session will timeout between now and warning_threshold
                ImpersonateSession.start_time + timedelta(minutes=ImpersonateSession.timeout_minutes) <= warning_threshold,
                ImpersonateSession.start_time + timedelta(minutes=ImpersonateSession.timeout_minutes) > now
            )
        ).all()
        
        warnings_sent = 0
        
        for session in sessions_to_warn:
            try:
                # Calculate remaining time
                timeout_time = session.start_time + timedelta(minutes=session.timeout_minutes)
                remaining_seconds = int((timeout_time - now).total_seconds())
                remaining_minutes = remaining_seconds // 60
                
                logger.info(
                    f"Sending timeout warning for session {session.id}: "
                    f"{remaining_minutes} minutes remaining"
                )
                
                # Log warning event in audit trail
                try:
                    audit_service = AuditService(db)
                    import asyncio
                    asyncio.run(audit_service.create_log(
                        user_id=str(session.original_user_id),
                        username=None,
                        user_role=None,
                        action="impersonate_timeout_warning",
                        resource_type="user",
                        resource_id=str(session.target_user_id),
                        details={
                            "session_id": str(session.id),
                            "remaining_minutes": remaining_minutes,
                            "timeout_time": timeout_time.isoformat()
                        },
                        severity="WARNING"
                    ))
                except Exception as e:
                    logger.error(f"Failed to log timeout warning: {str(e)}")
                
                # TODO: Send notification to superadmin (email, webhook, etc.)
                # This would integrate with notification service
                
                warnings_sent += 1
                
            except Exception as e:
                logger.error(f"Failed to send warning for session {session.id}: {str(e)}")
        
        report = {
            'task': 'send_timeout_warnings',
            'warning_minutes': warning_minutes,
            'sessions_found': len(sessions_to_warn),
            'warnings_sent': warnings_sent,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Timeout warning notifications complete: {report}")
        return report
        
    except Exception as e:
        logger.error(f"Failed to send timeout warnings: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.impersonate_tasks.log_active_sessions')
def log_active_sessions() -> Dict[str, Any]:
    """
    Log all currently active impersonate sessions
    
    Periodically logs active sessions for monitoring and audit purposes.
    Helps track which superadmins are currently impersonating users.
    
    Returns:
        Report with count of active sessions
    """
    db = SessionLocal()
    try:
        logger.info("Logging active impersonate sessions")
        
        now = datetime.utcnow()
        
        # Find all active sessions
        active_sessions = db.query(ImpersonateSession).filter(
            and_(
                ImpersonateSession.status == 'active',
                ImpersonateSession.end_time.is_(None)
            )
        ).all()
        
        session_details = []
        
        for session in active_sessions:
            elapsed_minutes = int((now - session.start_time).total_seconds() / 60)
            remaining_minutes = session.timeout_minutes - elapsed_minutes
            
            session_info = {
                'session_id': str(session.id),
                'original_user_id': str(session.original_user_id),
                'target_user_id': str(session.target_user_id),
                'elapsed_minutes': elapsed_minutes,
                'remaining_minutes': max(0, remaining_minutes),
                'timeout_minutes': session.timeout_minutes,
                'reason': session.reason
            }
            
            session_details.append(session_info)
            
            logger.info(f"Active session: {session_info}")
        
        report = {
            'task': 'log_active_sessions',
            'active_sessions_count': len(active_sessions),
            'sessions': session_details,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Active sessions logging complete: {len(active_sessions)} sessions active")
        return report
        
    except Exception as e:
        logger.error(f"Failed to log active sessions: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.impersonate_tasks.generate_impersonate_statistics')
def generate_impersonate_statistics(hours: int = 24) -> Dict[str, Any]:
    """
    Generate impersonate session statistics
    
    Generates statistics about impersonate sessions for monitoring and reporting.
    
    Args:
        hours: Number of hours to look back (default: 24)
        
    Returns:
        Statistics report
    """
    db = SessionLocal()
    try:
        logger.info(f"Generating impersonate statistics (hours={hours})")
        
        now = datetime.utcnow()
        cutoff_time = now - timedelta(hours=hours)
        
        # Get all sessions in the time period
        sessions = db.query(ImpersonateSession).filter(
            ImpersonateSession.start_time >= cutoff_time
        ).all()
        
        # Calculate statistics
        total_sessions = len(sessions)
        active_sessions = sum(1 for s in sessions if s.status == 'active')
        completed_sessions = sum(1 for s in sessions if s.status == 'completed')
        timeout_sessions = sum(1 for s in sessions if s.status == 'timeout')
        error_sessions = sum(1 for s in sessions if s.status == 'error')
        
        # Calculate average duration
        completed_durations = [s.duration_seconds() for s in sessions if s.duration_seconds()]
        avg_duration = sum(completed_durations) / len(completed_durations) if completed_durations else 0
        
        # Get unique superadmins
        unique_superadmins = len(set(s.original_user_id for s in sessions))
        
        # Get unique target users
        unique_target_users = len(set(s.target_user_id for s in sessions))
        
        report = {
            'task': 'generate_impersonate_statistics',
            'period_hours': hours,
            'total_sessions': total_sessions,
            'active_sessions': active_sessions,
            'completed_sessions': completed_sessions,
            'timeout_sessions': timeout_sessions,
            'error_sessions': error_sessions,
            'average_duration_seconds': int(avg_duration),
            'unique_superadmins': unique_superadmins,
            'unique_target_users': unique_target_users,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Impersonate statistics: {report}")
        return report
        
    except Exception as e:
        logger.error(f"Failed to generate impersonate statistics: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()

