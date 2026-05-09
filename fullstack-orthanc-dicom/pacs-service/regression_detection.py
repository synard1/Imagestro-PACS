"""
Performance Regression Detection & Baseline Tracking
Auto-detect performance changes, anomaly detection, trend analysis

Features:
- Establish performance baselines
- Detect latency regressions (e.g., P99 increased 20%+)
- Trend analysis (is performance getting worse over time?)
- Anomaly detection with Z-score method
- Per-endpoint baseline tracking
"""

import time
import logging
import math
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from collections import defaultdict, deque

from prometheus_client import Gauge

logger = logging.getLogger(__name__)

# ============================================================================
# REGRESSION DETECTION METRICS
# ============================================================================

performance_regression_detected = Gauge(
    'performance_regression_detected',
    'Whether performance regression detected',
    ['endpoint', 'metric_type', 'service']
)

baseline_latency_ms = Gauge(
    'baseline_latency_ms',
    'Baseline P99 latency for endpoint',
    ['endpoint', 'service']
)

current_latency_ms = Gauge(
    'current_latency_ms',
    'Current P99 latency for endpoint',
    ['endpoint', 'service']
)

regression_percentage = Gauge(
    'regression_percentage',
    'Percentage increase from baseline',
    ['endpoint', 'metric_type', 'service']
)

anomaly_score = Gauge(
    'anomaly_score',
    'Anomaly score (Z-score) for latency',
    ['endpoint', 'service']
)

# ============================================================================
# BASELINE TRACKER
# ============================================================================

class RegressionDetector:
    """Detect performance regressions and anomalies"""
    
    def __init__(self, baseline_window: int = 1000, alert_threshold_percent: float = 20.0):
        """
        Args:
            baseline_window: Number of samples to maintain for baseline
            alert_threshold_percent: Regression threshold (e.g., 20% = alert if P99 increases 20%)
        """
        self.baseline_window = baseline_window
        self.alert_threshold_percent = alert_threshold_percent
        
        # Historical data per endpoint
        self.endpoint_history: Dict[str, deque] = defaultdict(lambda: deque(maxlen=baseline_window))
        
        # Baselines
        self.baselines: Dict[str, Dict] = defaultdict(lambda: {
            'p50': 0,
            'p95': 0,
            'p99': 0,
            'mean': 0,
            'stdev': 0,
            'established_at': None,
        })
        
        # Regression alerts (timestamp, endpoint, severity, details)
        self.regression_alerts: List[Dict] = []
    
    def record_latency(self, endpoint: str, latency_ms: float):
        """Record latency measurement for endpoint"""
        self.endpoint_history[endpoint].append(latency_ms)
        self._update_baseline_if_needed(endpoint)
    
    def _update_baseline_if_needed(self, endpoint: str):
        """Update baseline when enough data accumulated"""
        
        history = self.endpoint_history[endpoint]
        if len(history) < 100:  # Need at least 100 samples
            return
        
        baseline = self.baselines[endpoint]
        
        # Calculate percentiles
        history_sorted = sorted(history)
        p50 = history_sorted[len(history_sorted) // 2]
        p95 = history_sorted[int(len(history_sorted) * 0.95)]
        p99 = history_sorted[int(len(history_sorted) * 0.99)]
        
        # Calculate stats
        mean = sum(history) / len(history)
        variance = sum((x - mean) ** 2 for x in history) / len(history)
        stdev = math.sqrt(variance)
        
        # Update baseline
        baseline['p50'] = p50
        baseline['p95'] = p95
        baseline['p99'] = p99
        baseline['mean'] = mean
        baseline['stdev'] = stdev
        baseline['established_at'] = datetime.utcnow().isoformat()
    
    def check_regression(self, endpoint: str, current_latency_ms: float) -> Optional[Dict]:
        """Check if current latency indicates regression"""
        
        baseline = self.baselines[endpoint]
        if baseline['established_at'] is None:
            return None  # No baseline yet
        
        # Check against P99
        if baseline['p99'] > 0:
            regression_pct = ((current_latency_ms - baseline['p99']) / baseline['p99']) * 100
            
            if regression_pct > self.alert_threshold_percent:
                alert = {
                    'timestamp': datetime.utcnow().isoformat(),
                    'endpoint': endpoint,
                    'metric': 'p99_latency',
                    'baseline_ms': baseline['p99'],
                    'current_ms': current_latency_ms,
                    'regression_percent': regression_pct,
                    'severity': self._calculate_severity(regression_pct),
                }
                self.regression_alerts.append(alert)
                
                # Keep only last 1000 alerts
                if len(self.regression_alerts) > 1000:
                    self.regression_alerts = self.regression_alerts[-1000:]
                
                return alert
        
        return None
    
    def detect_anomaly(self, endpoint: str, latency_ms: float) -> Optional[Dict]:
        """Detect anomalies using Z-score method"""
        
        baseline = self.baselines[endpoint]
        if baseline['stdev'] == 0 or baseline['established_at'] is None:
            return None
        
        # Calculate Z-score
        z_score = (latency_ms - baseline['mean']) / baseline['stdev']
        
        # Anomaly if |z_score| > 3 (99.7% confidence)
        if abs(z_score) > 3:
            anomaly = {
                'timestamp': datetime.utcnow().isoformat(),
                'endpoint': endpoint,
                'latency_ms': latency_ms,
                'z_score': z_score,
                'mean_ms': baseline['mean'],
                'stdev_ms': baseline['stdev'],
                'anomaly_type': 'too_fast' if z_score < 0 else 'too_slow',
                'severity': 'high' if abs(z_score) > 5 else 'medium',
            }
            return anomaly
        
        return None
    
    @staticmethod
    def _calculate_severity(regression_pct: float) -> str:
        """Calculate severity based on regression percentage"""
        if regression_pct > 100:
            return 'critical'
        elif regression_pct > 50:
            return 'high'
        elif regression_pct > 30:
            return 'medium'
        else:
            return 'low'
    
    def get_baseline_report(self) -> Dict[str, dict]:
        """Get current baselines for all endpoints"""
        
        report = {}
        for endpoint, baseline in self.baselines.items():
            if baseline['established_at'] is not None:
                report[endpoint] = {
                    'p50_ms': baseline['p50'],
                    'p95_ms': baseline['p95'],
                    'p99_ms': baseline['p99'],
                    'mean_ms': baseline['mean'],
                    'stdev_ms': baseline['stdev'],
                    'established_at': baseline['established_at'],
                    'samples_count': len(self.endpoint_history[endpoint]),
                }
        
        return report
    
    def get_regression_alerts(self, limit: int = 50) -> List[Dict]:
        """Get recent regression alerts"""
        return list(reversed(self.regression_alerts[-limit:]))
    
    def get_trend(self, endpoint: str, window: int = 100) -> Dict:
        """Get performance trend for endpoint"""
        
        history = list(self.endpoint_history[endpoint])[-window:]
        if not history:
            return {'trend': 'no_data'}
        
        # Calculate trend (simple linear regression)
        n = len(history)
        x_mean = (n - 1) / 2
        y_mean = sum(history) / n
        
        numerator = sum((i - x_mean) * (history[i] - y_mean) for i in range(n))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        
        slope = numerator / denominator if denominator > 0 else 0
        
        # Classify trend
        if slope > y_mean * 0.05:  # Getting 5% slower per sample
            trend = 'getting_slower'
            severity = 'high'
        elif slope < -y_mean * 0.05:  # Getting 5% faster per sample
            trend = 'getting_faster'
            severity = 'low'
        else:
            trend = 'stable'
            severity = 'low'
        
        return {
            'endpoint': endpoint,
            'trend': trend,
            'severity': severity,
            'slope': slope,
            'avg_latency_ms': y_mean,
            'samples': n,
        }

# Global detector
regression_detector = RegressionDetector(alert_threshold_percent=20.0)

# ============================================================================
# DIAGNOSTIC ENDPOINTS
# ============================================================================

def setup_regression_diagnostics(app):
    """Add regression detection endpoints"""
    
    @app.get("/api/diagnostics/performance/baselines", tags=["monitoring"])
    async def baselines():
        """Get performance baselines"""
        
        report = regression_detector.get_baseline_report()
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'baselines': report,
            'threshold_percent': regression_detector.alert_threshold_percent,
        }
    
    @app.get("/api/diagnostics/performance/regressions", tags=["monitoring"])
    async def regressions(limit: int = 50):
        """Get performance regression alerts"""
        
        alerts = regression_detector.get_regression_alerts(limit)
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'total_regressions': len(regression_detector.regression_alerts),
            'recent_regressions': alerts,
        }
    
    @app.get("/api/diagnostics/performance/trends/{endpoint_name}", tags=["monitoring"])
    async def performance_trend(endpoint_name: str):
        """Get performance trend for endpoint"""
        
        trend = regression_detector.get_trend(endpoint_name)
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'trend': trend,
        }
    
    logger.info("Regression detection endpoints registered")
