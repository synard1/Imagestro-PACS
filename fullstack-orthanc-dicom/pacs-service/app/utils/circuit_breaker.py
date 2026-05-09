"""
Circuit Breaker Pattern Implementation
Prevents cascading failures by failing fast when errors exceed threshold
"""

import time
import logging
from enum import Enum
from typing import Callable, Optional
from functools import wraps
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing fast
    HALF_OPEN = "half_open"  # Testing recovery


class CircuitBreakerError(Exception):
    """Raised when circuit breaker is open"""
    pass


class CircuitBreaker:
    """
    Circuit Breaker implementation
    
    States:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Too many failures, requests fail immediately
    - HALF_OPEN: Testing if service recovered
    
    Args:
        failure_threshold: Number of failures before opening circuit
        recovery_timeout: Seconds to wait before attempting recovery
        expected_exception: Exception type to catch (default: Exception)
        name: Optional name for logging
    """
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        expected_exception: type = Exception,
        name: Optional[str] = None
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.name = name or "CircuitBreaker"
        
        self._failure_count = 0
        self._last_failure_time: Optional[datetime] = None
        self._state = CircuitState.CLOSED
    
    @property
    def state(self) -> CircuitState:
        """Get current circuit state"""
        return self._state
    
    @property
    def failure_count(self) -> int:
        """Get current failure count"""
        return self._failure_count
    
    def call(self, func: Callable, *args, **kwargs):
        """
        Execute function with circuit breaker protection
        
        Args:
            func: Function to execute
            *args, **kwargs: Arguments to pass to function
        
        Returns:
            Function result
        
        Raises:
            CircuitBreakerError: If circuit is open
        """
        if self._state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self._state = CircuitState.HALF_OPEN
                logger.info(f"{self.name}: Attempting recovery (HALF_OPEN)")
            else:
                raise CircuitBreakerError(
                    f"{self.name}: Circuit breaker is OPEN. "
                    f"Failures: {self._failure_count}/{self.failure_threshold}"
                )
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
            
        except self.expected_exception as e:
            self._on_failure()
            raise
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt recovery"""
        if self._last_failure_time is None:
            return True
        
        elapsed = (datetime.now() - self._last_failure_time).total_seconds()
        return elapsed >= self.recovery_timeout
    
    def _on_success(self):
        """Handle successful call"""
        if self._state == CircuitState.HALF_OPEN:
            logger.info(f"{self.name}: Recovery successful, closing circuit")
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._last_failure_time = None
        elif self._state == CircuitState.CLOSED:
            # Reset failure count on success
            self._failure_count = 0
    
    def _on_failure(self):
        """Handle failed call"""
        self._failure_count += 1
        self._last_failure_time = datetime.now()
        
        if self._state == CircuitState.HALF_OPEN:
            logger.warning(f"{self.name}: Recovery failed, opening circuit")
            self._state = CircuitState.OPEN
        elif self._failure_count >= self.failure_threshold:
            logger.error(
                f"{self.name}: Failure threshold reached ({self._failure_count}), "
                f"opening circuit"
            )
            self._state = CircuitState.OPEN
    
    def reset(self):
        """Manually reset circuit breaker"""
        logger.info(f"{self.name}: Manual reset")
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = None
    
    def __call__(self, func: Callable) -> Callable:
        """Use as decorator"""
        @wraps(func)
        def wrapper(*args, **kwargs):
            return self.call(func, *args, **kwargs)
        return wrapper


# Global circuit breakers for common services
database_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=30.0,
    name="DatabaseCircuitBreaker"
)

dicom_storage_breaker = CircuitBreaker(
    failure_threshold=3,
    recovery_timeout=60.0,
    name="DicomStorageCircuitBreaker"
)

external_api_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=120.0,
    name="ExternalAPICircuitBreaker"
)


def with_circuit_breaker(breaker: CircuitBreaker):
    """
    Decorator to apply circuit breaker to a function
    
    Example:
        @with_circuit_breaker(database_breaker)
        def query_database():
            # Database operation
            pass
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            return breaker.call(func, *args, **kwargs)
        return wrapper
    return decorator
