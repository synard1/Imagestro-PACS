"""
API Dependency Graph & Service Mapping
Auto-generate service dependency map from request traces

Features:
- Automatic service dependency detection
- Visualize which services call which
- Request flow tracking (order: GET /orders → Auth → Inventory → Payment)
- Latency attribution per service in a flow
"""

import logging
from datetime import datetime
from typing import Optional, Dict, List, Set
from collections import defaultdict

from prometheus_client import Gauge

logger = logging.getLogger(__name__)

# ============================================================================
# DEPENDENCY METRICS
# ============================================================================

service_dependency_calls_total = Gauge(
    'service_dependency_calls_total',
    'Number of calls from source to target service',
    ['source_service', 'target_service', 'service']
)

service_dependency_latency_ms = Gauge(
    'service_dependency_latency_ms',
    'Average latency for service-to-service calls',
    ['source_service', 'target_service', 'service']
)

# ============================================================================
# DEPENDENCY GRAPH TRACKER
# ============================================================================

class ServiceDependencyGraph:
    """Track service dependencies automatically"""
    
    def __init__(self):
        # service_name -> set of services it calls
        self.dependencies: Dict[str, Set[str]] = defaultdict(set)
        
        # Detailed call metrics
        self.call_stats: Dict[str, Dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {
            'calls': 0,
            'total_latency': 0.0,
            'errors': 0,
            'last_called': None,
        }))
        
        # Common request flows (service sequences)
        self.request_flows: Dict[str, dict] = {}
    
    def record_dependency(self, source_service: str, target_service: str, latency_ms: float, error: bool = False):
        """Record a service-to-service call"""
        
        # Add to dependency graph
        self.dependencies[source_service].add(target_service)
        
        # Update statistics
        stats = self.call_stats[source_service][target_service]
        stats['calls'] += 1
        stats['total_latency'] += latency_ms
        if error:
            stats['errors'] += 1
        stats['last_called'] = datetime.utcnow().isoformat()
        stats['avg_latency'] = stats['total_latency'] / stats['calls']
        stats['error_rate'] = (stats['errors'] / stats['calls'] * 100) if stats['calls'] > 0 else 0
    
    def record_request_flow(self, endpoint: str, service_sequence: List[str], total_latency_ms: float):
        """Record a complete request flow through services"""
        
        flow_key = ' → '.join(service_sequence)
        
        if flow_key not in self.request_flows:
            self.request_flows[flow_key] = {
                'endpoint': endpoint,
                'flow': service_sequence,
                'count': 0,
                'total_latency': 0.0,
                'latencies': [],
            }
        
        flow = self.request_flows[flow_key]
        flow['count'] += 1
        flow['total_latency'] += total_latency_ms
        flow['latencies'].append(total_latency_ms)
        
        # Keep only last 100 latencies
        if len(flow['latencies']) > 100:
            flow['latencies'] = flow['latencies'][-100:]
    
    def get_dependency_graph(self) -> Dict:
        """Get the dependency graph"""
        
        graph = {}
        for source, targets in self.dependencies.items():
            graph[source] = {
                'calls_to': list(targets),
                'downstream_services': list(targets),
                'call_metrics': {}
            }
            
            for target in targets:
                stats = self.call_stats[source][target]
                graph[source]['call_metrics'][target] = {
                    'total_calls': stats['calls'],
                    'avg_latency_ms': stats['avg_latency'],
                    'error_rate_percent': stats['error_rate'],
                    'last_called': stats['last_called'],
                }
        
        return graph
    
    def get_critical_paths(self) -> List[Dict]:
        """Get critical paths (slowest request flows)"""
        
        paths = []
        for flow_key, flow_data in self.request_flows.items():
            if flow_data['count'] == 0:
                continue
            
            latencies = sorted(flow_data['latencies'])
            p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
            
            paths.append({
                'flow': ' → '.join(flow_data['flow']),
                'endpoint': flow_data['endpoint'],
                'total_calls': flow_data['count'],
                'avg_latency_ms': flow_data['total_latency'] / flow_data['count'],
                'p95_latency_ms': p95,
                'service_count': len(flow_data['flow']),
            })
        
        return sorted(paths, key=lambda x: x['p95_latency_ms'], reverse=True)
    
    def get_upstream_services(self, service_name: str) -> Set[str]:
        """Get services that call this service"""
        
        upstream = set()
        for source, targets in self.dependencies.items():
            if service_name in targets:
                upstream.add(source)
        
        return upstream
    
    def get_downstream_services(self, service_name: str, depth: int = 2) -> Set[str]:
        """Get services called by this service (recursive)"""
        
        downstream = set()
        
        def traverse(current, current_depth):
            if current_depth > depth:
                return
            if current in self.dependencies:
                for target in self.dependencies[current]:
                    downstream.add(target)
                    traverse(target, current_depth + 1)
        
        traverse(service_name, 0)
        return downstream
    
    def get_service_impact(self, service_name: str) -> Dict:
        """Analyze impact of a service outage"""
        
        # How many services depend on this?
        upstream = self.get_upstream_services(service_name)
        
        # What services does this depend on?
        downstream = self.get_downstream_services(service_name)
        
        return {
            'service': service_name,
            'upstream_services': list(upstream),  # Services affected if this goes down
            'downstream_services': list(downstream),  # Services it depends on
            'impact_radius': len(upstream) + 1,  # Number of affected services
            'dependency_count': len(downstream),  # Number of services it depends on
        }

# Global graph
dependency_graph = ServiceDependencyGraph()

# ============================================================================
# DIAGNOSTIC ENDPOINTS
# ============================================================================

def setup_dependency_diagnostics(app):
    """Add dependency graph diagnostic endpoints"""
    
    @app.get("/api/diagnostics/dependencies/graph", tags=["monitoring"])
    async def dependency_graph_endpoint():
        """Get full dependency graph"""
        
        graph = dependency_graph.get_dependency_graph()
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'dependency_graph': graph,
            'total_services': len(graph),
        }
    
    @app.get("/api/diagnostics/dependencies/critical-paths", tags=["monitoring"])
    async def critical_paths():
        """Get critical/slow request flows"""
        
        paths = dependency_graph.get_critical_paths()
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'total_flows': len(paths),
            'critical_paths': paths[:20],  # Top 20 slowest
        }
    
    @app.get("/api/diagnostics/dependencies/service/{service_name}/impact", tags=["monitoring"])
    async def service_impact(service_name: str):
        """Analyze impact of service"""
        
        impact = dependency_graph.get_service_impact(service_name)
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'analysis': impact,
        }
    
    @app.get("/api/diagnostics/dependencies/service/{service_name}/topology", tags=["monitoring"])
    async def service_topology(service_name: str):
        """Get service topology around a service"""
        
        upstream = dependency_graph.get_upstream_services(service_name)
        downstream = dependency_graph.get_downstream_services(service_name, depth=3)
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'center_service': service_name,
            'upstream_services': list(upstream),
            'downstream_services': list(downstream),
            'topology': {
                'upstream_count': len(upstream),
                'downstream_count': len(downstream),
            }
        }
    
    logger.info("Dependency graph diagnostics endpoints registered")
